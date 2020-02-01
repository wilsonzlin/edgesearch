import * as path from 'path';
import {BitFieldElementSize} from 'edgesearch';
import mkdirp from 'mkdirp';

const BUILD_DIR = path.join(__dirname, '..');
export const CACHE_DIR = path.join(BUILD_DIR, 'cache');
mkdirp.sync(CACHE_DIR);
export const DATA_RAW_JSON = path.join(BUILD_DIR, 'cache', 'raw.json');
export const DATA_PARSED_JSON = path.join(BUILD_DIR, 'cache', 'parsed.json');
export const CLIENT_SRC_DIR = path.join(BUILD_DIR, '..', 'src');
export const CLIENT_SRC_HTML_TEMPLATE = path.join(CLIENT_SRC_DIR, 'page.hbs');
export const DIST_DIR = path.join(BUILD_DIR, '..', 'dist');
export const CLIENT_DIST_DIR = path.join(DIST_DIR, 'client');
mkdirp.sync(CLIENT_DIST_DIR);
export const CLIENT_DIST_HTML = path.join(CLIENT_DIST_DIR, 'index.html');
export const WORKER_DIST_DIR = path.join(DIST_DIR, 'worker');
mkdirp.sync(WORKER_DIST_DIR);

export const DESCRIPTION = 'Find your next career at Microsoft.';

export const FIELDS = ['title', 'location', 'description'];
export const FILTER_BITFIELD_BITS_PER_ELEM = BitFieldElementSize.uint64_t;

export const SEARCH_RESULTS_MAX = 50;
export const SEARCH_WORDS_MAX = 50;
export const SEARCH_AUTOCOMPLETE_MAX_RESULTS = 5;

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

// NOTE: This regex is used to filter keypresses, so it should accept single-character strings
export const VALID_WORD_SUBREGEX = '[a-z0-9]{1,25}';
export const VALID_WORD_REGEX = new RegExp(`^${VALID_WORD_SUBREGEX}$`);

export const EXTRACT_WORDS_FN = (sentence: string) => sentence
  .replace(/[\-~!@#$%^&*?_|[\]\\,./;'`"<>:()+{}（）、’]/g, ' ')
  .trim()
  .toLowerCase()
  .split(/\s+/)
  // This .filter will take care of single empty string on splitting of ""
  .filter(w => VALID_WORD_REGEX.test(w))
  .flatMap(w => WORD_MAP[w] ?? w);
