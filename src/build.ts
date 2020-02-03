import {arrayOf, uint64CArrayInitialiser} from './util';
import {BitSet} from './BitSet';
import mmh from 'murmurhash-native';
import * as long from 'long';
import {getRunner, getWorker} from './resources';
import {compileToWasm} from './compileToWasm';
import {minifyJs} from './minifyJs';

export type Document = {
  content: string;
  terms: Set<string>;
}

export type Worker = {
  docs: string[];
  js: string;
  wasm: Buffer;
}

export const build = async ({
  documentEncoding = 'text',
  documents,
  error,
  maximumQueryBytes = 512,
  maximumQueryResults,
  name,
}: {
  documentEncoding?: 'text' | 'json';
  documents: Document[];
  error: number;
  maximumQueryBytes?: number;
  maximumQueryResults: number;
  name: string;
}): Promise<Worker> => {
  if (!Number.isFinite(error) || error < 0 || error > 1) {
    throw new RangeError('Error must be between 0 and 1 (exclusive)');
  }

  const reachableDocuments = documents.filter(d => d.terms.size);

  const totalTermsCount = reachableDocuments.map(d => d.terms.size).reduce((sum, c) => sum + c);
  if (totalTermsCount < 1000) {
    throw new RangeError(`Total terms count needs to be at least 1000, but is ${totalTermsCount}`);
  }
  const bitsPerElement = -(Math.log(error) / (Math.log(2) ** 2));
  const bits = Math.trunc(bitsPerElement * totalTermsCount);
  const hashes = Math.ceil(Math.log(2) * bitsPerElement);
  // This is a matrix. Each bit is represented by a bit set with `reachableDocuments` bits.
  // For example, assume "hello" is in document with index 5 and hashes to bits {3, 7, 10}.
  // Then the bit sets for bits {3, 7, 10} have their 5th bit set to 1.
  const matrix = arrayOf(bits, () => new BitSet(reachableDocuments.length));

  for (const [documentId, {terms}] of reachableDocuments.entries()) {
    for (const term of terms) {
      const bytes = Buffer.from(term, 'utf8');

      // Synchronise implementation with runner.bloom.c.
      const hash = mmh.LE.murmurHash128x64(bytes, 'buffer');
      if (!Buffer.isBuffer(hash) || hash.length != 16) {
        throw new TypeError('Murmurhash3 result is not a 16-byte Buffer');
      }
      const a = long.fromBytesLE([...hash.slice(0, 8)], true);
      const b = long.fromBytesLE([...hash.slice(8)], true);

      for (let i = 0; i < hashes; i++) {
        const bit = a.add(b.mul(i)).mod(bits);
        // TODO Consider bit positions too large for JS Number.
        matrix[bit.toNumber()].set(documentId);
      }
    }
  }

  const c = await Promise.all(['sys', 'main', 'bitset', 'murmur', 'sort', 'bloom'].map(getRunner))
    .then(c => c.join('\n'))
    .then(c => c.replace('__BLOOM_INITIALISER', `{
      bits: ${bits},
      hashes: ${hashes},
      matrix: {${matrix.map(bit => uint64CArrayInitialiser(bit.elems())).join(',')}},
    }`));

  const wasm = await compileToWasm(c, {
    optimisationLevel: 3,
    warningsAsErrors: false,
    macros: {
      'BITSET_ELEMS_LENGTH': matrix[0].elementsLength,
      'MAX_RESULTS': maximumQueryResults,
      'MAX_QUERY_BYTES': maximumQueryBytes,
    },
  });

  const js = await getWorker('main')
    // `exports` is not defined in Workers environment.
    .then(js => js.replace('Object.defineProperty(exports, "__esModule", { value: true });', ''))
    .then(js => js.replace('require("./worker.config")', JSON.stringify({
      // Keep in sync with variables declared in resources/worker.config.ts.
      DOCUMENT_ENCODING: documentEncoding,
      MAX_QUERY_WORDS: maximumQueryBytes,
      WORKER_NAME: name,
    })))
    .then(minifyJs);

  return {docs: reachableDocuments.map(d => d.content), js, wasm};
};
