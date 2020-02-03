import {BIT_FIELD_IDS, ENTRIES, FIELDS, MAX_AUTOCOMPLETE_RESULTS, MAX_QUERY_RESULTS, MAX_QUERY_WORDS} from './worker.config';

// Needed for addEventListener at bottom.
// See https://github.com/Microsoft/TypeScript/issues/14877.
declare var self: ServiceWorkerGlobalScope;

// Set by Cloudflare to the WebAssembly module that was upload alongside this script.
declare var QUERY_RUNNER_WASM: WebAssembly.Module;

// Map from a field to a sorted array of every word in every value of that field across all entries.
const AUTOCOMPLETE_LISTS = new Map(FIELDS.map(field => [field, Object.keys(BIT_FIELD_IDS[field]).sort()]));

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const responsePreflight = () => {
  return new Response(null, {
    headers: CORS_HEADERS,
  });
};

const responseError = (error: string, status: number = 400) =>
  new Response(JSON.stringify({error}), {
    status, headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });

const responseSuccess = (data: object, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });

// Find where a word would be inserted into an ordered list.
const findWordPos = (words: string[], word: string, left: number = 0, right: number = words.length - 1): number => {
  if (left >= right) {
    return left;
  }
  if (left + 1 == right) {
    return word <= words[left] ? left : right;
  }
  const midPos = left + Math.floor((right - left) / 2);
  const midWord = words[midPos];
  return word === midWord
    ? midPos
    : word < midWord
      // Could still be midPos, i.e. midPos -1 <= x < midPos.
      ? findWordPos(words, word, left, midPos)
      // Could still be midPos, i.e. midPos < x <= midPos + 1.
      : findWordPos(words, word, midPos, right);
};

const autocompleteQsRegex = /^\?f=([^&]+)&t=(.*)$/;

const handleAutocomplete = (url: URL) => {
  const matches = autocompleteQsRegex.exec(url.search);
  if (!matches) {
    return responseError('Bad query');
  }

  const [_, field, term] = matches;

  const results = [];
  const words = AUTOCOMPLETE_LISTS.get(field);
  if (!words) {
    return responseError('Invalid field');
  }

  for (
    let pos = findWordPos(words, term), count = 0;
    pos < words.length && count < MAX_AUTOCOMPLETE_RESULTS;
    pos++, count++
  ) {
    const word = words[pos];
    if (!word.startsWith(term)) {
      break;
    }
    results.push(word);
  }

  return responseSuccess(results);
};

// Synchronise mode IDs with mode_t enum in runner.main.c.
const searchQsPartRegex = /^([012])_([^_]+)_([^&]+)(?:&|$)/;

const parseQuery = (qs: string): number[] | undefined => {
  if (!qs.startsWith('?q=')) {
    return;
  }
  qs = qs.slice(3);

  // Synchronise mode IDs with mode_t enum in runner.main.c.
  let lastMode = -1;
  let lastModeField = '';
  let lastModeFieldWord = '';

  let wordsCount = 0;

  const modeWords = Array(3).fill(0).map(() => Array<number>());

  while (qs) {
    const matches = searchQsPartRegex.exec(qs);
    if (!matches) {
      return;
    }

    qs = qs.slice(matches[0].length);
    const mode = Number.parseInt(matches[1], 10);
    const field = matches[2];
    const word = matches[3];

    // Query string must be sorted for caching
    if (lastMode > mode) {
      return;
    }
    if (lastMode != mode) {
      lastMode = mode;
      // Changing this will cause lastModeFieldWord to be invalidated
      lastModeField = '';
    }

    if (lastModeField > field) {
      return;
    }
    if (lastModeField != field) {
      lastModeField = field;
      lastModeFieldWord = '';
    }

    // Query string must be sorted for caching.
    // Words must be unique per mode-field.
    if (lastModeFieldWord >= word) {
      return;
    }
    if (lastModeFieldWord != word) {
      lastModeFieldWord = word;
    }

    if (++wordsCount > MAX_QUERY_WORDS) {
      return;
    }

    // The zeroth bit set is a fully-zero bit set, used for non-existent words.
    modeWords[mode].push(BIT_FIELD_IDS[field]?.[word] ?? 0);
  }

  return !wordsCount ? [] : modeWords.reduce((comb, m) => comb.concat(m, -1), Array<number>());
};

const wasmMemory = new WebAssembly.Memory({initial: 96});
const wasmInstance = new WebAssembly.Instance(QUERY_RUNNER_WASM, {env: {memory: wasmMemory}});

const queryRunner = wasmInstance.exports as {
  // Keep synchronised with function declarations in runner.main.c with WASM_EXPORT.
  init (): number;
  search (): number;
};
const queryRunnerMemory = new DataView(wasmMemory.buffer);

const handleSearch = (url: URL) => {
  const query = parseQuery(url.search);
  if (!query) {
    return responseError('Invalid query');
  }

  let results;
  let overflow;

  // NOTE: Just because there are no valid words does not mean that there are no valid results.
  // For example, excluding an invalid word actually results in all entries matching.
  if (!query.length) {
    results = ENTRIES.slice(0, MAX_QUERY_RESULTS);
    overflow = ENTRIES.length > MAX_QUERY_RESULTS;
  } else {
    const inputPtr = queryRunner.init();
    for (const [no, int16] of query.entries()) {
      queryRunnerMemory.setInt16(inputPtr + (no * 2), int16, true);
    }

    const outputPtr = queryRunner.search();

    results = [];
    for (let resultNo = 0; ; resultNo++) {
      const entryIdx = queryRunnerMemory.getInt32(outputPtr + (resultNo * 4), true);
      if (entryIdx == -1) {
        break;
      }
      results.push(ENTRIES[entryIdx]);
    }
    // Worker returns MAX_RESULTS + 1 entry IDs so as to detect overflow.
    if ((overflow = results.length == MAX_QUERY_RESULTS + 1)) {
      results.pop();
    }
  }

  return responseSuccess({results, overflow});
};

const requestHandler = (request: Request) => {
  if (request.method == 'OPTIONS') {
    return responsePreflight();
  }

  const url = new URL(request.url);

  switch (url.pathname) {
  case '/search':
    return handleSearch(url);
  case '/autocomplete':
    return handleAutocomplete(url);
  default:
    return new Response(null, {
      status: 404,
    });
  }
};

self.addEventListener('fetch', event => {
  event.respondWith(requestHandler(event.request));
});
