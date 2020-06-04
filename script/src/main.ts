type WorkersKVNamespace = {
  get<T> (key: string, encoding: 'json'): Promise<T>;
  get (key: string, encoding: 'text'): Promise<string>;
  get (key: string, encoding: 'arrayBuffer'): Promise<ArrayBuffer>;
}

// Set by Cloudflare.
declare var KV: WorkersKVNamespace;
// Set by Cloudflare to the WebAssembly module that was uploaded alongside this script.
declare var QUERY_RUNNER_WASM: WebAssembly.Module;

// Following variables are set by build/js.rs.
// Maximum amount of bytes a query can be.
declare var MAX_QUERY_BYTES: number;
// Maximum amount of terms a query can have across all modes.
declare var MAX_QUERY_TERMS: number;
// How documents fetched from Cloudflare Workers KV should be decoded before returning to client.
declare var DOCUMENT_ENCODING: 'text' | 'json';
// [term, packageId, offset, length].
declare var PACKED_POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP_RAW: [string, number, number, number][];
// [term, packageId, middlePos].
declare var PACKED_NORMAL_POSTINGS_LIST_ENTRIES_LOOKUP: [string, number, number][];
// [documentId, packageId, middlePos].
declare var PACKED_DOCUMENTS_LOOKUP: [number, number, number][];

const PACKED_POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP: Map<string, { packageId: number, offset: number, length: number }> =
  new Map(PACKED_POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP_RAW.map(([term, packageId, offset, length]) => [
    term,
    {packageId, offset, length},
  ]));

// Easy reading and writing of memory sequentially without having to manage and update offsets/positions/pointers.
class MemoryWalker {
  private readonly dataView: DataView;
  private readonly uint8Array: Uint8Array;

  constructor (
    readonly buffer: ArrayBuffer,
    private next: number = 0,
  ) {
    this.dataView = new DataView(buffer);
    this.uint8Array = new Uint8Array(buffer);
  }

  jumpTo (ptr: number): this {
    this.next = ptr;
    return this;
  }

  forkAndJump (ptr: number): MemoryWalker {
    return new MemoryWalker(this.buffer, ptr);
  }

  skip (bytes: number): this {
    this.next += bytes;
    return this;
  }

  readAndDereferencePointer (): MemoryWalker {
    return new MemoryWalker(this.buffer, this.readUInt32LE());
  }

  readSlice (len: number): ArrayBuffer {
    return this.buffer.slice(this.next, this.next += len);
  }

  readBoolean (): boolean {
    return !!this.dataView.getUint8(this.next++);
  }

  readUInt8 (): number {
    return this.dataView.getUint8(this.next++);
  }

  readInt32LE (): number {
    const val = this.dataView.getInt32(this.next, true);
    this.next += 4;
    return val;
  }

  readInt32BE (): number {
    const val = this.dataView.getInt32(this.next, false);
    this.next += 4;
    return val;
  }

  readUInt32LE (): number {
    const val = this.dataView.getUint32(this.next, true);
    this.next += 4;
    return val;
  }

  readUInt32BE (): number {
    const val = this.dataView.getUint32(this.next, false);
    this.next += 4;
    return val;
  }

  readInt64LE (): bigint {
    const val = this.dataView.getBigInt64(this.next, true);
    this.next += 8;
    return val;
  }

  readUInt64LE (): bigint {
    const val = this.dataView.getBigUint64(this.next, true);
    this.next += 8;
    return val;
  }

  readDoubleLE (): number {
    const val = this.dataView.getFloat64(this.next, true);
    this.next += 8;
    return val;
  }

  readNullTerminatedString (): string {
    let end = this.next;
    while (this.uint8Array[end]) {
      end++;
    }
    const val = textDecoder.decode(this.uint8Array.slice(this.next, end));
    this.next = end + 1;
    return val;
  }

  writeUInt32LE (val: number): this {
    this.dataView.setUint32(this.next, val, true);
    this.next += 4;
    return this;
  }

  writeAll (src: Uint8Array): this {
    this.uint8Array.set(src, this.next);
    this.next += src.byteLength;
    return this;
  }
}

const SPECIFIER_PARSERS: { length: Set<string>, type: Set<string>, parse: (mem: MemoryWalker) => number | bigint | string }[] = [
  {length: new Set(['hh', 'h', 'l', 'z', 't', '']), type: new Set('dic'), parse: mem => mem.readInt32LE()},
  {length: new Set(['hh', 'h', 'l', 'z', 't', '']), type: new Set('uxXop'), parse: mem => mem.readUInt32LE()},
  {length: new Set(['ll', 'j']), type: new Set('di'), parse: mem => mem.readInt64LE()},
  {length: new Set(['ll', 'j']), type: new Set('uxXop'), parse: mem => mem.readUInt64LE()},
  {length: new Set(['L', '']), type: new Set('fFeEgGaA'), parse: mem => mem.readDoubleLE()},
  {length: new Set(), type: new Set('s'), parse: mem => mem.readAndDereferencePointer().readNullTerminatedString()},
  {length: new Set(), type: new Set('%'), parse: () => '%'},
];

const SPECIFIER_FORMATTERS = {
  '%': () => '%',
  d: (val: number | bigint) => val.toString(),
  i: (val: number | bigint) => val.toString(),
  u: (val: number | bigint) => val.toString(),
  f: (val: number) => val.toLocaleString('fullwide', {useGrouping: false, maximumFractionDigits: 20}),
  F: (val: number) => val.toLocaleString('fullwide', {useGrouping: false, maximumFractionDigits: 20}).toUpperCase(),
  e: (val: number) => val.toExponential(2),
  E: (val: number) => val.toExponential(2).toUpperCase(),
  g: (val: number) => val.toString(),
  G: (val: number) => val.toString().toUpperCase(),
  x: (val: number | bigint) => val.toString(16),
  X: (val: number | bigint) => val.toString(16).toUpperCase(),
  o: (val: number | bigint) => val.toString(8),
  s: (val: string) => val,
  c: (val: number) => String.fromCharCode(val),
  p: (val: number | bigint) => val.toString(16),
  a: (val: number) => val.toString(16),
  A: (val: number) => val.toString(16).toUpperCase(),
};

const formatFromVarargs = (mem: MemoryWalker): string => mem
  .readAndDereferencePointer()
  .readNullTerminatedString()
  .replace(/%([-+ 0'#]*)((?:[0-9]+|\*)?)((?:\.(?:[0-9]+|\*))?)((?:hh|h|l|ll|L|z|j|t|I|I32|I64|q)?)([%diufFeEgGxXoscpaA])/g, ((spec, flags, width, precision, length, type) => {
    // These aren't used in our C code right now but we can implement later on if we do.
    if (flags || width || precision) {
      throw new Error(`Unsupported format specifier "${spec}"`);
    }

    const parser = SPECIFIER_PARSERS.find(p => p.length.has(length) && p.type.has(type));
    if (!parser) {
      throw new SyntaxError(`Invalid format specifier "${spec}"`);
    }
    const rawValue = parser.parse(mem);

    return SPECIFIER_FORMATTERS[type](rawValue);
  }));

const wasmMemory = new WebAssembly.Memory({initial: 2048});

const wasmInstance = new WebAssembly.Instance(QUERY_RUNNER_WASM, {
  env: {
    _wasm_import_log (argsPtr: number) {
      console.log(formatFromVarargs(queryRunnerMemory.forkAndJump(argsPtr)));
    },
    _wasm_import_error (argsPtr: number) {
      throw new Error(`[fprintf] ${formatFromVarargs(queryRunnerMemory.forkAndJump(argsPtr))}`);
    },
    memory: wasmMemory,
  },
});

const queryRunner = wasmInstance.exports as {
  // Keep synchronised with function declarations resources/*.c with WASM_EXPORT.
  reset (): void;
  index_alloc_serialised (size: number): number;
  index_query_init (): number;
  index_query (input: number): number;
};

const queryRunnerMemory = new MemoryWalker(wasmMemory.buffer);

const textDecoder = new TextDecoder();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const responsePreflight = () => new Response(null, {
  headers: CORS_HEADERS,
});

const responseError = (error: string, status: number = 400) => new Response(JSON.stringify({error}), {
  status, headers: {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
  },
});

const responseSuccessRawJson = (json: string, status = 200) => new Response(json, {
  status, headers: {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
  },
});

const responseDefaultResults = async () => responseSuccessRawJson(`{"results":${await KV.get('default', 'text')},"continuation":null}`);
const responseNoResults = async () => responseSuccessRawJson(`{"results":[],"continuation":null}`);
const responseSuccess = (data: object, status = 200) => responseSuccessRawJson(JSON.stringify(data), status);

type PackageEntryKey = string | number;

const compareKey = <K extends PackageEntryKey> (a: K, b: K): number => {
  return typeof a == 'number' ? a - (b as number) : (a as string).localeCompare(b as string);
};

const extractKeyAtPosInBstPackage = <K extends PackageEntryKey> (packageData: MemoryWalker, type: K extends string ? 'string' : 'number'): K => {
  if (type == 'string') {
    // Keep in sync with build::packed::PackedStrKey.
    const len = packageData.readUInt8();
    return textDecoder.decode(packageData.readSlice(len)) as K;
  } else {
    // Keep in sync with build::PackedU32Key.
    return packageData.readUInt32BE() as K;
  }
};

const getFromBstPackage = <K extends PackageEntryKey> (packageData: MemoryWalker, targetKey: K): ArrayBuffer | undefined => {
  while (true) {
    let currentKey = extractKeyAtPosInBstPackage(packageData, typeof targetKey as any);
    // Keep in sync with build::packed::bst::BST::_serialise_node.
    const leftPos = packageData.readInt32BE();
    const rightPos = packageData.readInt32BE();
    const valueLen = packageData.readUInt32BE();
    const cmp = compareKey(targetKey, currentKey);
    if (cmp < 0) {
      if (leftPos == -1) {
        break;
      }
      packageData.jumpTo(leftPos);
    } else if (cmp == 0) {
      return packageData.readSlice(valueLen);
    } else {
      if (rightPos == -1) {
        break;
      }
      packageData.jumpTo(rightPos);
    }
  }
  return undefined;
};

const findInPackages = async <K extends PackageEntryKey> (packagesLookup: ReadonlyArray<[K, number, number]>, key: K, packageIdPrefix: string): Promise<ArrayBuffer | undefined> => {
  let lo = 0, hi = packagesLookup.length - 1;
  if (!packagesLookup.length) {
    return undefined;
  }
  let entry: [K, number, number] | undefined;
  while (!entry) {
    const dist = hi + 1 - lo;
    if (dist <= 0) {
      throw new Error(`Search went out of bounds while looking for "${key}"`);
    } else if (dist == 1) {
      entry = packagesLookup[lo];
    } else if (dist == 2) {
      entry = compareKey(key, packagesLookup[hi][0]) < 0 ? packagesLookup[lo] : packagesLookup[hi];
    } else {
      const mid = lo + Math.floor(dist / 2);
      const cmp = compareKey(key, packagesLookup[mid][0]);
      if (cmp < 0) {
        hi = mid - 1;
      } else if (cmp == 0) {
        entry = packagesLookup[mid];
      } else {
        lo = mid;
      }
    }
  }

  const packageData = new MemoryWalker(await KV.get(`${packageIdPrefix}${entry[1]}`, 'arrayBuffer'));
  return getFromBstPackage(packageData.jumpTo(entry[2]), key);
};

// Keep order in sync with mode_t.
type ParsedQuery = [
  // Require.
  string[],
  // Contain.
  string[],
  // Exclude.
  string[],
];

// Take a raw query string and parse in into an array with three subarrays, each subarray representing terms for a mode.
const parseQuery = (termsRaw: string[]): ParsedQuery | undefined => {
  const modeTerms: ParsedQuery = [
    Array<string>(),
    Array<string>(),
    Array<string>(),
  ];
  for (const value of termsRaw) {
    // Synchronise mode IDs with mode_t enum in resources/main.c.
    const matches = /^([012])_([^&]+)(?:&|$)/.exec(value);
    if (!matches) {
      return;
    }
    const mode = Number.parseInt(matches[1], 10);
    const term = decodeURIComponent(matches[2]);
    modeTerms[mode].push(term);
  }

  return modeTerms;
};

type QueryResult = {
  continuation: number | null;
  count: number;
  documents: number[];
};

const readResult = (result: MemoryWalker): QueryResult => {
  // Synchronise with `results_t` in resources/index.c.
  const continuation = result.readInt32LE();
  const count = result.readUInt8();
  // Starts from next WORD_SIZE (uint32_t) due to alignment.
  result.skip(3);
  const documents: number[] = [];
  for (let resultNo = 0; resultNo < count; resultNo++) {
    // Synchronise with `doc_id_t` in resources/main.c.
    const docId = result.readUInt32LE();
    documents.push(docId);
  }
  return {continuation: continuation == -1 ? null : continuation, count, documents};
};

const findSerialisedTermBitmaps = async (query: ParsedQuery): Promise<(ArrayBuffer | undefined)[][]> => {
  return await Promise.all(
    query.map(modeTerms => Promise.all(
      modeTerms.map(async (term) => {
        const popular = PACKED_POPULAR_POSTINGS_LIST_ENTRIES_LOOKUP.get(term);
        let sbm: ArrayBuffer | undefined;

        if (popular) {
          const packageData: ArrayBuffer = await KV.get(`popular_terms_${popular.packageId}`, 'arrayBuffer');
          sbm = packageData.slice(popular.offset, popular.offset + popular.length);
        } else {
          // Keep in sync with deploy/mod.rs.
          sbm = await findInPackages(PACKED_NORMAL_POSTINGS_LIST_ENTRIES_LOOKUP, term, 'normal_terms_');
        }

        return sbm;
      }),
    )),
  );
};

const buildPostingsListQuery = async (firstRank: number, modeTermBitmaps: ArrayBuffer[][]): Promise<Uint8Array> => {
  const bitmapCount = modeTermBitmaps.reduce((count, modeTerms) => count + modeTerms.length, 0);

  // Synchronise with index_query_t.
  const input = new MemoryWalker(new ArrayBuffer(4 + (bitmapCount * 2 + 3) * 4));
  input.writeUInt32LE(firstRank);
  for (const mode of modeTermBitmaps) {
    for (const bitmap of mode) {
      const ptr = queryRunner.index_alloc_serialised(bitmap.byteLength);
      queryRunnerMemory.forkAndJump(ptr).writeAll(new Uint8Array(bitmap));
      // WASM is LE.
      input
        .writeUInt32LE(bitmap.byteLength)
        .writeUInt32LE(ptr);
    }
    input.writeUInt32LE(0);
  }

  return new Uint8Array(input.buffer);
};

const executePostingsListQuery = (queryData: Uint8Array): QueryResult | undefined => {
  const inputPtr = queryRunner.index_query_init();
  queryRunnerMemory.forkAndJump(inputPtr).writeAll(queryData);
  const outputPtr = queryRunner.index_query(inputPtr);
  return outputPtr == 0 ? undefined : readResult(queryRunnerMemory.forkAndJump(outputPtr));
};

const handleSearch = async (url: URL) => {
  // NOTE: Just because there are no valid words does not mean that there are no valid results.
  // For example, excluding an invalid word actually results in all entries matching.
  const query = parseQuery(url.searchParams.getAll('t'));
  if (!query) {
    return responseError('Malformed query');
  }
  const continuation = Math.max(0, Number.parseInt(url.searchParams.get('c') || '', 10) || 0);

  const termCount = query.reduce((count, modeTerms) => count + modeTerms.length, 0);
  if (termCount > MAX_QUERY_TERMS) {
    return responseError('Too many terms', 413);
  }

  const modeTermBitmaps = await findSerialisedTermBitmaps(query);
  // Handling non-existent terms:
  // - If REQUIRE, then immediately return zero results, regardless of other terms of any mode.
  // - If CONTAIN, then simply omit.
  // - If EXCLUDE, then it depends; if there are other terms of any mode, then simply omit. If there are no other terms of any mode, then return default results.
  if (modeTermBitmaps[0].some(bm => !bm)) {
    return responseNoResults();
  }
  modeTermBitmaps[1] = modeTermBitmaps[1].filter(bm => bm);
  modeTermBitmaps[2] = modeTermBitmaps[2].filter(bm => bm);
  if (modeTermBitmaps.every(modeTerms => !modeTerms.length)) {
    return responseDefaultResults();
  }

  queryRunner.reset();

  const postingsListQueryData = await buildPostingsListQuery(continuation, modeTermBitmaps as ArrayBuffer[][]);
  const result = await executePostingsListQuery(postingsListQueryData);
  if (!result) {
    throw new Error(`Failed to execute query`);
  }

  const documents = await Promise.all(result.documents.map(async (docId) => {
    const encoded = await findInPackages(PACKED_DOCUMENTS_LOOKUP, docId, 'doc_');
    const value = textDecoder.decode(encoded);
    switch (DOCUMENT_ENCODING) {
    case 'text':
      return value;
    case 'json':
      return JSON.parse(value);
    }
  }));

  return responseSuccess({
    results: documents,
    continuation: result.continuation,
  });
};

const requestHandler = async (request: Request) => {
  if (request.method == 'OPTIONS') {
    return responsePreflight();
  }

  const url = new URL(request.url);

  return url.pathname === '/search'
    ? handleSearch(url)
    : new Response(null, {status: 404});
};

// See https://github.com/Microsoft/TypeScript/issues/14877.
(self as unknown as ServiceWorkerGlobalScope).addEventListener('fetch', event => {
  event.respondWith(requestHandler(event.request));
});
