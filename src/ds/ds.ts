export type DSConfig = {
  maximumAutocompleteSuggestions: number;
  maximumQueryWords: number;
  maximumQueryResults: number;
}

export type DSResult = {
  wasm: Buffer;
  js: string;
};
