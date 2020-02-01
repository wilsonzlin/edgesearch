import {compileToWasm} from './compileToWasm';
import {BitFieldElementSize, buildData, Entry, Field} from './buildData';
import {promises as fs} from 'fs';
import * as path from 'path';

export {BitFieldElementSize} from './buildData';

const RESOURCES = path.join(__dirname, 'resources');
const RUNNER_MAIN = path.join(RESOURCES, 'runner.main.c');
const RUNNER_SYS = path.join(RESOURCES, 'runner.sys.c');
const WORKER_MAIN = path.join(RESOURCES, 'worker.main.js');
const CLOUDFLARE_METADATA = path.join(RESOURCES, 'cloudflare.metadata.json');

export const build = async <E extends Entry, Searchable extends Field<E>> ({
  entries,
  searchableFields,
  bitfieldElementSize,
  wordsExtractor,
  maximumAutocompleteSuggestions,
  maximumQueryWords,
  maximumQueryResults,
  outputDir,
}: {
  entries: E[];
  searchableFields: Set<Searchable>,
  bitfieldElementSize: BitFieldElementSize,
  wordsExtractor: (str: string) => Set<string>;
  maximumAutocompleteSuggestions: number;
  maximumQueryWords: number;
  maximumQueryResults: number;
  outputDir: string;
}) => {
  const data = buildData(entries, searchableFields, {
    bitfieldElementSize,
    wordsExtractor,
  });

  await Promise.all([
    compileToWasm(await Promise.all([
      fs.readFile(RUNNER_SYS, 'utf8'),
      fs.readFile(RUNNER_MAIN, 'utf8')
        .then(c => c.replace('__BITFIELDS_ARRAY_INITIALISER', `{${data.bitFields.map(b => b.serialise()).join(',')}}`)),
    ]).then(files => files.join('\n')), {
      optimisationLevel: 3,
      warningsAsErrors: false,
      macros: {
        'BITFIELD_BITS_PER_ELEM': bitfieldElementSize,
        'BITFIELD_LENGTH': data.bitFields[0].elementsLength,
        'BITFIELDS_COUNT': data.bitFields.length,
        'MAX_RESULTS': maximumQueryResults,
        'MAX_WORDS': maximumQueryWords,
      },
      outputFile: path.join(outputDir, 'runner.wasm'),
    }),

    fs.readFile(WORKER_MAIN, 'utf8')
      .then(js => js.replace('require("./worker.config")', JSON.stringify({
        // Keep in sync with variables declared in resources/worker.config.ts.
        MAX_AUTOCOMPLETE_RESULTS: maximumAutocompleteSuggestions,
        MAX_QUERY_WORDS: maximumQueryWords,
        MAX_QUERY_RESULTS: maximumQueryResults,
        ENTRIES: entries,
        BIT_FIELD_IDS: data.bitFieldIds,
        FIELDS: searchableFields,
      })))
      .then(js => fs.writeFile(path.join(outputDir, 'worker.js'), js)),

    fs.copyFile(CLOUDFLARE_METADATA, path.join(outputDir, 'metadata.json')),
  ]);
};
