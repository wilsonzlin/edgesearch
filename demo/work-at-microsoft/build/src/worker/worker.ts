import * as edgesearch from 'edgesearch';
import {promises as fs} from 'fs';
import {
  DATA_PARSED_JSON,
  EXTRACT_WORDS_FN,
  FIELDS,
  FILTER_BITFIELD_BITS_PER_ELEM,
  SEARCH_AUTOCOMPLETE_MAX_RESULTS,
  SEARCH_RESULTS_MAX,
  SEARCH_WORDS_MAX,
  WORKER_DIST_DIR,
} from '../const';

(async () => {
  await edgesearch.build({
    entries: JSON.parse(await fs.readFile(DATA_PARSED_JSON, 'utf8')),
    bitfieldElementSize: FILTER_BITFIELD_BITS_PER_ELEM,
    maximumAutocompleteSuggestions: SEARCH_AUTOCOMPLETE_MAX_RESULTS,
    maximumQueryResults: SEARCH_RESULTS_MAX,
    maximumQueryWords: SEARCH_WORDS_MAX,
    searchableFields: FIELDS as any,
    outputDir: WORKER_DIST_DIR,
    wordsExtractor: s => new Set(EXTRACT_WORDS_FN(s)),
  });
})()
  .catch(console.error);
