export const NAME = 'wikipedia';

export const SEARCH_RESULTS_MAX = 50;

export const WORDS_EXTRACTOR = (sentence: string) => sentence
  .split(/[^a-zA-Z0-9]+/)
  .filter(t => t)
  .map(t => t.toLowerCase());
