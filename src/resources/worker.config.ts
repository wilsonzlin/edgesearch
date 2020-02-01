// This is just a dummy file with declarations.
// When worker.main.ts is actually compiled, there will be a corresponding worker.config.ts file with these values provided.

// Maximum amount of words that can be returned as part of autocomplete suggestions.
export declare var MAX_AUTOCOMPLETE_RESULTS: number;
// Maximum amount of words as a whole that can be used as part of a query, across fields and modes.
export declare var MAX_QUERY_WORDS: number;
// Maximum amount of entries that can be returned as part of a query result.
export declare var MAX_QUERY_RESULTS: number;
// All entries data.
export declare var ENTRIES: { [field: string]: string }[];
// IDs for a bit field representing a specific word-in-field.
export declare var BIT_FIELD_IDS: { [field: string]: { [word: string]: number } };
// Names of the searchable fields of an entry.
export declare var FIELDS: string[];
