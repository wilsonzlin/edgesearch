import {DOCUMENT_ENCODING, MAX_QUERY_BYTES, WORKER_NAME} from './config';

// Needed for addEventListener at bottom.
// See https://github.com/Microsoft/TypeScript/issues/14877.
declare var self: ServiceWorkerGlobalScope;

type WorkersKVNamespace = {
  get (key: string, encoding: 'text' | 'json'): Promise<any>;
}

// Set by Cloudflare to the WebAssembly module that was upload alongside this script.
declare var QUERY_RUNNER_WASM: WebAssembly.Module;

const wasmMemory = new WebAssembly.Memory({initial: 96});
const wasmInstance = new WebAssembly.Instance(QUERY_RUNNER_WASM, {env: {memory: wasmMemory}});

const queryRunner = wasmInstance.exports as {
  // Keep synchronised with function declarations in runner.main.c with WASM_EXPORT.
  init (): number;
  search (): number;
};
const queryRunnerMemory = new DataView(wasmMemory.buffer);
const queryRunnerMemoryUint8 = new Uint8Array(wasmMemory.buffer);

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

// Synchronise mode IDs with mode_t enum in runner.main.c.
const searchQsPartRegex = /^([012])_([^&]+)(?:&|$)/;

const textEncoder = new TextEncoder();

const parseQuery = (qs: string): Uint8Array | undefined => {
  if (!qs.startsWith('?q=')) {
    return;
  }
  qs = qs.slice(3);

  const modeTerms = Array(3).fill(void 0).map(() => Array<Uint8Array>());
  let termsCount = 0;
  let bytesCount = 0;
  while (qs) {
    const matches = searchQsPartRegex.exec(qs);
    if (!matches) {
      return;
    }

    qs = qs.slice(matches[0].length);
    const mode = Number.parseInt(matches[1], 10);
    const term = decodeURIComponent(matches[2]);

    const termBytes = textEncoder.encode(term);
    modeTerms[mode].push(termBytes);
    termsCount++;
    bytesCount += termBytes.byteLength;
  }

  if (!termsCount || bytesCount > MAX_QUERY_BYTES) {
    return;
  }

  const query = new Uint8Array(bytesCount);
  let nextByte = 0;
  for (const terms of modeTerms) {
    for (const term of terms) {
      query.set(term, nextByte);
      nextByte += term.byteLength;
      query[nextByte++] = 0;
    }
    query[nextByte++] = 0;
  }

  return query;
};

const handleSearch = async (url: URL) => {
  // NOTE: Just because there are no valid words does not mean that there are no valid results.
  // For example, excluding an invalid word actually results in all entries matching.
  const query = parseQuery(url.search);
  if (!query) {
    return responseError('Invalid query');
  }

  const inputPtr = queryRunner.init();
  queryRunnerMemoryUint8.set(query, inputPtr);

  const outputPtr = queryRunner.search();
  // Synchronise with `results_t` in runner.main.c.
  const resultsCount = queryRunnerMemory.getUint8(outputPtr);
  const more = !!queryRunnerMemory.getUint8(outputPtr + 1);

  const documents = [];
  for (let resultNo = 0; resultNo < resultsCount; resultNo++) {
    // Synchronise with `doc_id_t` in runner.main.c.
    // WASM is little endian.
    const docId = queryRunnerMemory.getBigInt64(outputPtr + 2 + (resultNo * 8), true).toString();
    documents.push((self[`EDGESEARCH_${WORKER_NAME}`] as WorkersKVNamespace).get(`doc_${docId}`, DOCUMENT_ENCODING));
  }

  return responseSuccess({results: await Promise.all(documents), more});
};

const requestHandler = async (request: Request) => {
  if (request.method == 'OPTIONS') {
    return responsePreflight();
  }

  const url = new URL(request.url);

  switch (url.pathname) {
    case '/search':
      return handleSearch(url);
    default:
      return new Response(null, {
        status: 404,
      });
  }
};

self.addEventListener('fetch', event => {
  event.respondWith(requestHandler(event.request));
});
