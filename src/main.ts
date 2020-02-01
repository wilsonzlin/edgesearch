import {compileToWasm} from './compileToWasm';
import {BitFieldElementSize, buildData, Entry, Field} from './buildData';
import {promises as fs} from 'fs';
import * as path from 'path';

export {BitFieldElementSize} from './buildData';

const RESOURCES = path.join(__dirname, '..', 'resources');
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

  const wasm = await compileToWasm(await Promise.all([
    fs.readFile(RUNNER_SYS, 'utf8'),
    fs.readFile(RUNNER_MAIN, 'utf8'),
  ]).then(files => files.join('\n')), {
    macros: {
      'BITFIELD_BITS_PER_ELEM': bitfieldElementSize,
      'BITFIELD_LENGTH': data.bitFields[0].elementsLength,
      'BITFIELDS_COUNT': data.bitFields.length,
      'BITFIELDS': `{${data.bitFields.map(b => b.serialise()).join(',')}}`,
      'MAX_RESULTS': maximumQueryResults,
      'MAX_WORDS': maximumQueryWords,
    },
  });

  const js = await fs.readFile(WORKER_MAIN, 'utf8')
    .then(js => js.replace('require("./worker.config")', JSON.stringify({
      // Keep in sync with variables declared in resources/worker.config.ts.
      MAX_AUTOCOMPLETE_RESULTS: maximumAutocompleteSuggestions,
      MAX_QUERY_WORDS: maximumQueryWords,
      MAX_QUERY_RESULTS: maximumQueryResults,
      ENTRIES: entries,
      BIT_FIELD_IDS: data.bitFieldIds,
      FIELDS: searchableFields,
    })));

  await Promise.all([
    fs.writeFile(path.join(outputDir, 'worker.js'), js),
    fs.writeFile(path.join(outputDir, 'runner.wasm'), wasm),
    fs.copyFile(path.join(outputDir, 'metadata.json'), CLOUDFLARE_METADATA),
  ]);
};
