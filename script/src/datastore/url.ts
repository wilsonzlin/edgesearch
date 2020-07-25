declare var DATASTORE_URL_PREFIX: string;

var fetchChunk = async (chunkIdPrefix: string, chunkId: number): Promise<ArrayBuffer> => {
  const res = await fetch(`${DATASTORE_URL_PREFIX}${chunkIdPrefix}${chunkId}`);
  console.log('Fetched chunk from KV');
  return res.arrayBuffer();
};
