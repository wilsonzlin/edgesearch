import * as readline from 'readline';
import * as fs from 'fs';
import {EXTRACT_WORDS_FN} from '../const';

const input = readline.createInterface({
  input: fs.createReadStream('./titles.txt'),
});

const wordCounts = new Map<string, number>();

input.on('line', l => {
  const words = EXTRACT_WORDS_FN(decodeURIComponent(l));
  for (const w of words) {
    wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
  }
});

input.on('close', () => {
  const highest = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]);

  // TODO
});
