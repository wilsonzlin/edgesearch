// This is just a dummy file with declarations.
// When main.ts is actually compiled, its import of this will be replaced with an object with these values.

// Maximum amount of bytes a query can be.
export declare var MAX_QUERY_BYTES: number;
// Maximum amount of terms a query can have across all modes.
export declare var MAX_QUERY_TERMS: number;
// Default results to send when not searching for anything.
export declare var DEFAULT_RESULTS: string;
// How documents fetched from Cloudflare Workers KV should be decoded before returning to client.
export declare var DOCUMENT_ENCODING: 'text' | 'json';
