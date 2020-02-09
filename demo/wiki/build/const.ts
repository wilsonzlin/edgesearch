import * as path from "path";

export const NAME = 'wikipedia';

const BUILD_DIR = __dirname;
export const DATA_SOURCE = path.join(BUILD_DIR, 'data', 'titles.txt');
export const DATA_DEFAULT = path.join(BUILD_DIR, 'data', 'default.txt');
export const DATA_CONTENTS = path.join(BUILD_DIR, 'data', 'contents.txt');
export const DATA_TERMS = path.join(BUILD_DIR, 'data', 'terms.txt');

export const SEARCH_RESULTS_MAX = 50;

export const WORDS_EXTRACTOR = (sentence: string) => sentence
  .split(/[^a-zA-Z0-9]+/)
  .filter(t => t)
  .map(t => t.toLowerCase());
