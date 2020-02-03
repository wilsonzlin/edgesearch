import {arrayOf, uint64CArrayInitialiser} from '../util';
import * as long from 'long';
// WASM is little-endian.
import mmh from 'murmurhash-native';
import {BitSet} from '../BitSet';
import {Data, Entry, Field} from '../buildData';
import {getRunner, getWorker} from '../resources';
import {compileToWasm} from '../compileToWasm';
import {DSConfig} from './ds';
import {minifyWorker} from '../minifyWorker';

export const buildBloom = async <E extends Entry, Searchable extends Field<E>> ({
  entries,
  entryFieldValueWords,
  fieldWords,
  searchable,
}: Data<E, Searchable>, {
  error,
  maximumQueryResults,
  maximumQueryWords,
}: {
  error: number,
} & DSConfig) => {
  if (!Number.isFinite(error) || error < 0 || error > 1) {
    throw new RangeError('Error must be between 0 and 1 (exclusive)');
  }

  const totalWordsCount = [...fieldWords.values()].map(words => words.size).reduce((sum, c) => sum + c);
  if (totalWordsCount < 1000) {
    throw new RangeError(`Total words count needs to be at least 1000, but is ${totalWordsCount}`);
  }
  const bitsPerElement = -(Math.log(error) / (Math.log(2) ** 2));
  const bits = Math.trunc(bitsPerElement * totalWordsCount);
  const hashes = Math.ceil(Math.log(2) * bitsPerElement);
  // This is a matrix. Each bit is represented by a bit set with `entries` bits.
  // For example, assume "hello" is in entry with index 5 and hashes to bits {3, 7, 10}.
  // Then the bit sets for bits {3, 7, 10} have their 5th bit set to 1.
  const filter = arrayOf(bits, () => new BitSet(entries.length));

  for (const [entryIdx, entryField] of entryFieldValueWords) {
    for (const [field, words] of entryField) {
      for (const word of words) {
        const bytes = Buffer.from([field, word].join('\0'), 'utf8');

        // Synchronise implementation with runner.bloom.c.
        const hash = mmh.LE.murmurHash128x64(bytes, 'buffer');
        if (!Buffer.isBuffer(hash) || hash.length != 16) {
          throw new TypeError('Murmurhash3 result is not a 16-byte Buffer');
        }
        const a = long.fromBytesLE([...hash.slice(0, 8)], true);
        const b = long.fromBytesLE([...hash.slice(8)], true);

        for (let i = 0; i < hashes; i++) {
          const bit = a.add(b.mul(b)).mod(bits);
          // TODO Consider bit positions too large for JS Number.
          filter[bit.toNumber()].set(entryIdx);
        }
      }
    }
  }

  const c = await Promise.all(['sys', 'main', 'bitset', 'bloom'].map(getRunner))
    .then(c => c.join('\n'))
    .then(c => c.replace('__BLOOM_INITIALISER', `{
      bits: ${bits},
      hashes: ${hashes},
      bf: {${filter.map(bit => uint64CArrayInitialiser(bit.elems())).join(',')}},
    }`));

  const wasm = await compileToWasm(c, {
    optimisationLevel: 3,
    warningsAsErrors: false,
    macros: {
      'BITSET_ELEMS_LENGTH': filter[0].elementsLength,
      'MAX_RESULTS': maximumQueryResults,
      'MAX_WORDS': maximumQueryWords,
    },
  });

  const js = await getWorker('main')
    // `exports` is not defined in Workers environment.
    .then(js => js.replace('Object.defineProperty(exports, "__esModule", { value: true });', ''))
    .then(js => js.replace('require("./worker.config")', JSON.stringify({
      // Keep in sync with variables declared in resources/worker.config.ts.
      MAX_QUERY_WORDS: maximumQueryWords,
      MAX_QUERY_RESULTS: maximumQueryResults,
      FIELDS: searchable,
    })))
    .then(minifyWorker);

  return {js, wasm};
};
