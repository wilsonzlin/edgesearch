import {DEFAULT_RESULTS, DOCUMENT_ENCODING, MAX_QUERY_BYTES, MAX_QUERY_TERMS} from './config';

// Needed for addEventListener at bottom.
// See https://github.com/Microsoft/TypeScript/issues/14877.
declare var self: ServiceWorkerGlobalScope;

type WorkersKVNamespace = {
  get(key: string, encoding: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any>;
}

// Set by Cloudflare.
declare var KV: WorkersKVNamespace;
// Set by Cloudflare to the WebAssembly module that was upload alongside this script.
declare var QUERY_RUNNER_WASM: WebAssembly.Module;

const wasmMemory = new WebAssembly.Memory({initial: 1024});
const wasmInstance = new WebAssembly.Instance(QUERY_RUNNER_WASM, {env: {memory: wasmMemory}});

const queryRunner = wasmInstance.exports as {
  // Keep synchronised with function declarations builder/resources/*.c with WASM_EXPORT.
  init(): void;
  bloom_search_init(): number;
  bloom_search(input: number): number;
  postingslist_alloc_serialised(size: number): number;
  postingslist_query_init(): number;
  postingslist_query(input: number): number;
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

const responseSuccessRawJson = (json: string, status = 200) =>
  new Response(json, {
    status, headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });

const responseSuccess = (data: object, status = 200) =>
  responseSuccessRawJson(JSON.stringify(data), status);

type ParsedQuery = [
  // Require.
  string[],
  // Contain.
  string[],
  // Exclude.
  string[],
];

// Synchronise mode IDs with mode_t enum in builder/resources/main.c.
const searchQsPartRegex = /^([012])_([^&]+)(?:&|$)/;

const textEncoder = new TextEncoder();

const parseQuery = (qs: string): ParsedQuery | undefined => {
  if (!qs.startsWith('?q=')) {
    return;
  }
  qs = qs.slice(3);

  const modeTerms: ParsedQuery = [
    Array<string>(),
    Array<string>(),
    Array<string>(),
  ];
  while (qs) {
    const matches = searchQsPartRegex.exec(qs);
    if (!matches) {
      return;
    }
    const mode = Number.parseInt(matches[1], 10);
    const term = decodeURIComponent(matches[2]);
    modeTerms[mode].push(term);
    qs = qs.slice(matches[0].length);
  }

  return modeTerms;
};

type QueryResult = {
  more: boolean;
  count: number;
  documents: number[];
};

const readResult = (resultPtr: number): QueryResult => {
  // Synchronise with `results_t` in builder/resources/main.c.
  const count = queryRunnerMemory.getUint8(resultPtr);
  const more = !!queryRunnerMemory.getUint8(resultPtr + 1);
  const documents: number[] = [];
  for (let resultNo = 0; resultNo < count; resultNo++) {
    // Synchronise with `doc_id_t` in builder/resources/main.c.
    // WASM is little endian.
    // Starts from next WORD_SIZE (uint32_t) due to alignment.
    const docId = queryRunnerMemory.getUint32(resultPtr + 4 + (resultNo * 4), true);
    documents.push(docId);
  }
  return {more, count, documents};
};

const buildBloomQuery = (query: ParsedQuery): Uint8Array | undefined => {
  const queryData: number[] = [];
  for (const terms of query) {
    for (const term of terms) {
      const termBytes = textEncoder.encode(term);
      Array.prototype.push.apply(queryData, [...termBytes]);
      queryData.push(0);
    }
    queryData.push(0);
  }

  return queryData.length > MAX_QUERY_BYTES ? undefined : new Uint8Array(queryData);
};

const executeBloomQuery = (queryData: Uint8Array): QueryResult => {
  const inputPtr = queryRunner.bloom_search_init();
  queryRunnerMemoryUint8.set(queryData, inputPtr);
  const outputPtr = queryRunner.bloom_search(inputPtr);
  return readResult(outputPtr);
};

const buildPostingsListQuery = async (query: ParsedQuery): Promise<Uint8Array | undefined> => {
  const termCount = query.reduce((count, modeTerms) => count + modeTerms.length, 0);
  if (termCount > MAX_QUERY_TERMS) {
    return undefined;
  }

  const termBitmaps = await Promise.all(
    query.map(modeTerms => Promise.all(
      modeTerms.map(term =>
        KV
          .get(`postingslist_${term}`, 'arrayBuffer')
          .then((sbm: ArrayBuffer) => {
            const ptr = queryRunner.postingslist_alloc_serialised(sbm.byteLength);
            queryRunnerMemoryUint8.set(new Uint8Array(sbm), ptr);
            return [sbm.byteLength, ptr];
          }),
      ),
    )),
  );
  // Synchronise with postingslist_query_t.
  const input = new DataView(new ArrayBuffer((termCount * 2 + 3) * 4));
  let nextByte = 0;
  for (const modeTermBitmaps of termBitmaps) {
    for (const [bitmapBytes, bitmapPtr] of modeTermBitmaps) {
      // WASM is LE.
      input.setUint32(nextByte, bitmapBytes, true);
      nextByte += 4;
      input.setUint32(nextByte, bitmapPtr, true);
      nextByte += 4;
    }
    input.setUint32(nextByte, 0, true);
    nextByte += 4;
  }

  return new Uint8Array(input.buffer);
};

const executePostingsListQuery = (queryData: Uint8Array): QueryResult | undefined => {
  const inputPtr = queryRunner.postingslist_query_init();
  queryRunnerMemoryUint8.set(queryData, inputPtr);
  const outputPtr = queryRunner.postingslist_query(inputPtr);
  return outputPtr == 0 ? undefined : readResult(outputPtr);
};

const handleSearch = async (url: URL) => {
  // NOTE: Just because there are no valid words does not mean that there are no valid results.
  // For example, excluding an invalid word actually results in all entries matching.
  const query = parseQuery(url.search);
  if (!query) {
    return responseError('Invalid query');
  }
  if (query.every(modeTerms => !modeTerms.length)) {
    return responseSuccessRawJson(`{"results":${DEFAULT_RESULTS},"more":true}`);
  }

  queryRunner.init();

  // TODO Bloom filter matrix

  const postingsListQueryData = await buildPostingsListQuery(query);
  if (!postingsListQueryData) {
    return responseError('Invalid query');
  }
  const result = await executePostingsListQuery(postingsListQueryData);
  if (!result) {
    return responseError('Invalid query');
  }

  return responseSuccess({results: await Promise.all(result.documents.map(docId => KV.get(`doc_${docId}`, DOCUMENT_ENCODING))), more: result.more});
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
