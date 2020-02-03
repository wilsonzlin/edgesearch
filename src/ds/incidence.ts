import {Data, Entry, Field} from '../buildData';
import {BitSet} from '../BitSet';
import {mapMapValues, mapSet} from '../util';
import {DSConfig, DSResult} from './ds';
import {compileToWasm} from '../compileToWasm';
import {minifyWorker} from '../minifyWorker';
import {getRunner, getWorker} from '../resources';

export type BitSetIds<E extends Entry, Searchable extends Field<E>> = Map<Searchable, Map<string, number>>;

export const incidence = async <E extends Entry, Searchable extends Field<E>> ({
  fieldWords,
  entries,
  searchable,
  entryFieldValueWords,
}: Data<E, Searchable>, {
  maximumAutocompleteSuggestions,
  maximumQueryResults,
  maximumQueryWords,
}: DSConfig): Promise<DSResult> => {
  // We create a bit set for each distinct word in each searchable field across all entries.
  // Each bit set has n elements, where n is the amount of entries. A bit is set to true if the entry it represents contains the word-in-field represented by the bit set.
  // A bit set is identified by its index in this array. The ID of the corresponding bit set for a word-in-field is set at bitSetIds[field][word].
  // First bit set is the one used for non-existent words and should be fully zero.
  const bitSets: BitSet[] = [new BitSet(entries.length)];
  // Create BitSetIds object.
  const bitSetIds: BitSetIds<E, Searchable> = mapMapValues(fieldWords, (words, field) =>
    // Create bit sets for field-word.
    new Map(mapSet(words, word => [
      word,
      // The index of the bit set is equal to the new length after pushing minus one.
      bitSets.push([...entries.keys()]
        // Find indices of entries that have this word in its field's value.
        .filter(entryIdx => entryFieldValueWords.get(entryIdx)!.get(field)!.has(word))
        // Set indices to true in bit set.
        .reduce((bitSet, entryIdx) => bitSet.set(entryIdx), new BitSet(entries.length)),
      ) - 1,
    ])),
  );

  const c = await Promise.all(['sys', 'main', 'bitset', 'incidence'].map(getRunner))
    .then(c => c.join('\n'))
    .then(c => c.replace('__INCIDENCE_MATRIX_INITIALISER', `{${bitSets.map(b => b.serialise()).join(',')}}`));

  const wasm = await compileToWasm(c, {
    optimisationLevel: 3,
    warningsAsErrors: false,
    macros: {
      'BITSET_ELEMS_LENGTH': bitSets[0].elementsLength,
      'BITSETS_COUNT': bitSets.length,
      'MAX_RESULTS': maximumQueryResults,
      'MAX_WORDS': maximumQueryWords,
    },
  });

  const js = await getWorker('main')
    // `exports` is not defined in Workers environment.
    .then(js => js.replace('Object.defineProperty(exports, "__esModule", { value: true });', ''))
    .then(js => js.replace('require("./worker.config")', JSON.stringify({
      // Keep in sync with variables declared in resources/worker.config.ts.
      MAX_AUTOCOMPLETE_RESULTS: maximumAutocompleteSuggestions,
      MAX_QUERY_WORDS: maximumQueryWords,
      MAX_QUERY_RESULTS: maximumQueryResults,
      ENTRIES: entries,
      // TODO Passing map.
      BIT_FIELD_IDS: bitSetIds,
      FIELDS: searchable,
    })))
    .then(minifyWorker);

  return {js, wasm};
};
