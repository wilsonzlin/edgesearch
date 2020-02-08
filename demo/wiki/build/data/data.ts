import * as readline from 'readline';
import * as fs from 'fs';
import {createWriteStream} from 'fs';
import {WORDS_EXTRACTOR} from '../const';
import {join} from 'path';

const outTerms = createWriteStream(join(__dirname, 'terms.txt'), {
  encoding: 'utf8',
});

const outContents = createWriteStream(join(__dirname, 'contents.txt'), {
  encoding: 'utf8',
});

const input = readline.createInterface({
  input: fs.createReadStream(join(__dirname, 'titles.txt')),
});

let lineNo = 0;
input.on('line', l => {
  const title = decodeURIComponent(l).trim();
  const terms = Array.from(new Set(WORDS_EXTRACTOR(title))).sort();
  outContents.write(title);
  outContents.write('\0');
  // Don't skip documents with no terms, as otherwise document IDs are not in sync.
  for (const term of terms) {
    if (!term) {
      throw new Error('Empty term');
    }
    outTerms.write(term + '\0');
  }
  outTerms.write('\0');
  if (++lineNo % 1_000_000 == 0) {
    console.log(`Wrote document ${lineNo}`);
  }
});
