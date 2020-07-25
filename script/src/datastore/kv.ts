type WorkersKVNamespace = {
  get<T> (key: string, encoding: 'json'): Promise<T>;
  get (key: string, encoding: 'text'): Promise<string>;
  get (key: string, encoding: 'arrayBuffer'): Promise<ArrayBuffer>;
}

// Set by Cloudflare.
declare var KV: WorkersKVNamespace;

var fetchChunk = async (chunkIdPrefix: string, chunkId: number): Promise<ArrayBuffer> => {
  const chunkData = await KV.get(`${chunkIdPrefix}${chunkId}`, 'arrayBuffer');
  console.log('Fetched chunk from KV');
  return chunkData;
};
