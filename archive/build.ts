import {arrayOf, tmpFile} from './util';
import {BitSet} from './BitSet';
import mmh from 'murmurhash-native';
import * as long from 'long';
import {getRunner, getWorker} from './resources';
import {compileToWasm} from './compileToWasm';
import {minifyJs} from './minifyJs';
import {createWriteStream, promises as fs, WriteStream} from 'fs';
import * as bytes from 'bytes';

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
  popular = 0.67,
}: {
  documentEncoding?: 'text' | 'json';
  documents: Document[];
  error: number;
  maximumQueryBytes?: number;
  maximumQueryResults: number;
  name: string;
  popular?: number;
}): Promise<Worker> => {
  console.log('Compiling WASM...');
  let wasm;
  try {
    wasm = await compileToWasm(sourceCodePath, {
      optimisationLevel: 3,
      warningsAsErrors: false,
      macros: {
        'BITS_COUNT': bits,
        'BITSET_ELEMS_LENGTH': matrix[0].elementsLength,
        'MAX_RESULTS': maximumQueryResults,
        'MAX_QUERY_BYTES': maximumQueryBytes,
      },
    });
  } finally {
    await fs.unlink(sourceCodePath);
  }

  console.log('Generating worker script...');
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

  return {docs: reachableDocs.map(d => d.content), js, wasm};
};
