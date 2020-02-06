import * as readline from 'readline';
import * as fs from 'fs';
import {createWriteStream} from 'fs';
import {EXTRACT_WORDS_FN} from '../const';
import {join} from 'path';

const outTerms = createWriteStream(join(__dirname, 'titles.terms.txt'), {
  encoding: 'utf8',
});

const input = readline.createInterface({
  input: fs.createReadStream(join(__dirname, 'titles.txt')),
});

input.on('line', l => {
  const terms = Array.from(new Set(EXTRACT_WORDS_FN(decodeURIComponent(l)))).sort();
  if (!terms.length) {
    return;
  }
  for (const term of terms) {
    if (!term) {
      throw new Error('Empty term');
    }
    outTerms.write(term + '\0');
  }
  outTerms.write('\0');
});
