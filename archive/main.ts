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
