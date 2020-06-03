import {fetchAndParse} from '@wzlin/jobs';
import {promises as fs} from 'fs';
import {CACHE_DIR, DATA_DEFAULT, DATA_DOCUMENTS, DATA_PARSED_JSON, DATA_TERMS, EXTRACT_WORDS_FN, FIELDS, SEARCH_RESULTS_MAX} from '../const';

const withShortDescription = (j: any) => ({
  ...j,
  preview: undefined,
  description: j.preview,
});

(async () => {
  const parsed = (await fetchAndParse({cacheDir: CACHE_DIR, companies: ['Microsoft']})).Microsoft;
  await fs.writeFile(DATA_PARSED_JSON, JSON.stringify(parsed));
  await fs.writeFile(DATA_DEFAULT, JSON.stringify(parsed.slice(0, SEARCH_RESULTS_MAX).map(withShortDescription)));

  const contents = parsed.map((j: any) => JSON.stringify(withShortDescription(j)) + '\0').join('');
  const terms = parsed.map((job: any) =>
    FIELDS
      // For each field, get words from that field's value and map to the form `{field}_{term}\0`.
      .map(f => [...new Set(EXTRACT_WORDS_FN(job[f]).map(t => `${f}_${t}\0`))])
      .flat(Infinity)
      .join('') + '\0',
  ).join('');
  await fs.writeFile(DATA_DOCUMENTS, contents);
  await fs.writeFile(DATA_TERMS, terms);
})()
  .catch(e => {
    if (e.statusCode != undefined) {
      console.error(`Failed to fetch ${e.response.request.href} with status ${e.statusCode}`);
    } else {
      console.error(e);
    }
  });
