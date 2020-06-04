import {fetchAndParse} from '@wzlin/jobs';
import {promises as fs} from 'fs';
import mkdirp from 'mkdirp';
import {join} from 'path';

const CACHE_DIR = join(__dirname, 'cache');
const BUILD_DIR = join(__dirname, 'build');
mkdirp.sync(BUILD_DIR);
const DATA_DEFAULT = join(BUILD_DIR, 'default.json');
const DATA_DOCS = join(BUILD_DIR, 'docs.txt');
const DATA_TERMS = join(BUILD_DIR, 'terms.txt');

const FIELDS = ['title', 'location', 'description'];

const WORD_MAP: { [original: string]: string[] } = {
  'architecte': ['architect'],
  'engineeer': ['engineer'],
  'engineerv': ['engineer'],
  'hw': ['hardware'],
  'ii': ['2'],
  'iii': ['3'],
  'iv': ['4'],
  'll': ['2'],
  'm365': ['microsoft', '365'],
  'ms': ['microsoft'],
  'o365': ['office', '365'],
  'office365': ['office', '365'],
  'sr': ['senior'],
  'sw': ['software'],
};

const extractWords = (sentence: string) => sentence
  .split(/[^a-zA-Z0-9]/)
  .filter(t => t)
  .map(t => t.toLowerCase())
  .flatMap(t => WORD_MAP[t] || t);

const SEARCH_RESULTS_MAX = 50;

const withShortDescription = (j: any) => ({
  ...j,
  preview: undefined,
  description: j.preview,
});

(async () => {
  const parsed = (await fetchAndParse({cacheDir: CACHE_DIR, companies: ['Microsoft']})).Microsoft;
  await fs.writeFile(DATA_DEFAULT, JSON.stringify(parsed.slice(0, SEARCH_RESULTS_MAX).map(withShortDescription)));

  const contents = parsed.map((j: any) => JSON.stringify(withShortDescription(j)) + '\0').join('');
  const terms = parsed.map((job: any) =>
    FIELDS
      // For each field, get words from that field's value and map to the form `{field}_{term}\0`.
      .map(f => [...new Set(extractWords(job[f]).map(t => `${f}_${t}\0`))])
      .flat(Infinity)
      .join('') + '\0',
  ).join('');

  await fs.writeFile(DATA_DOCS, contents);
  await fs.writeFile(DATA_TERMS, terms);
})()
  .catch(e => {
    if (e.statusCode != undefined) {
      console.error(`Failed to fetch ${e.response.request.href} with status ${e.statusCode}`);
    } else {
      console.error(e);
    }
  });
