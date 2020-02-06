// This is just a dummy file with declarations.
// When worker.main.ts is actually compiled, there will be a corresponding worker.config.ts file with these values provided.

// Maximum amount of bytes a query can be.
export declare var MAX_QUERY_BYTES: number;
// Name of this worker.
export declare var WORKER_NAME: string;
// How documents fetched from Cloudflare Workers KV should be decoded before returning to client.
export declare var DOCUMENT_ENCODING: 'text' | 'json';
