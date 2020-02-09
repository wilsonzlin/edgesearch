import * as readline from 'readline';
import * as fs from 'fs';
import {createWriteStream} from 'fs';
import {DATA_CONTENTS, DATA_DEFAULT, DATA_SOURCE, DATA_TERMS, WORDS_EXTRACTOR} from '../const';

const outTerms = createWriteStream(DATA_TERMS, {
  encoding: 'utf8',
});

const outContents = createWriteStream(DATA_CONTENTS, {
  encoding: 'utf8',
});

const input = readline.createInterface({
  input: fs.createReadStream(DATA_SOURCE),
});

fs.writeFileSync(DATA_DEFAULT, '[]', 'utf8');

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
