import * as path from 'path';
import * as mkdirp from 'mkdirp';

const BUILD_DIR = __dirname;
export const CACHE_DIR = path.join(BUILD_DIR, 'cache');
mkdirp.sync(CACHE_DIR);
export const DATA_RAW_JSON = path.join(BUILD_DIR, 'cache', 'raw.json');
export const DATA_PARSED_JSON = path.join(BUILD_DIR, 'cache', 'parsed.json');
export const DATA_DEFAULT = path.join(BUILD_DIR, 'data', 'default-results.txt');
export const DATA_DOCUMENTS = path.join(BUILD_DIR, 'data', 'documents.txt');
export const DATA_TERMS = path.join(BUILD_DIR, 'data', 'terms.txt');
export const CLIENT_SRC_DIR = path.join(BUILD_DIR, '..', 'client');
export const CLIENT_SRC_HTML_TEMPLATE = path.join(CLIENT_SRC_DIR, 'page.hbs');
export const DIST_DIR = path.join(BUILD_DIR, '..', 'dist');
export const CLIENT_DIST_DIR = path.join(DIST_DIR, 'client');
mkdirp.sync(CLIENT_DIST_DIR);
export const CLIENT_DIST_HTML = path.join(CLIENT_DIST_DIR, 'index.html');
export const WORKER_DIST_DIR = path.join(DIST_DIR, 'worker');
mkdirp.sync(WORKER_DIST_DIR);

export const NAME = 'work-at-microsoft';
export const DESCRIPTION = 'Find your next career at Microsoft.';

export const FIELDS = ['title', 'location', 'description'];

export const SEARCH_RESULTS_MAX = 50;

export const WORD_MAP: { [original: string]: string[] } = {
  'architecte': ['architect'],
  'engineeer': ['engineer'],
  'engineerv': ['engineer'],
  'hw': ['hardware'],
  'ii': ['2'],
  'iii': ['3'],
  'iv': ['4'],
  'll': ['2'],
  'm365': ['microsoft', '365'],
  'ms': ['microsoft'],
  'o365': ['office', '365'],
  'office365': ['office', '365'],
  'sr': ['senior'],
  'sw': ['software'],
};

export const VALID_WORD_REGEX = /^[a-z0-9]{1,25}$/;

export const EXTRACT_WORDS_FN = (sentence: string) => sentence
  .split(/[^a-zA-Z0-9]/)
  .filter(t => t)
  .map(t => t.toLowerCase())
  .map(t => WORD_MAP[t] || [t])
  // Don't use .flat, as it's not supported in Edge.
  .reduce((flat, words) => flat.concat(words), new Array<string>());
