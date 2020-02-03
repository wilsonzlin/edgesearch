import * as edgesearch from 'edgesearch';
import {promises as fs} from 'fs';
import {DATA_PARSED_JSON, EXTRACT_WORDS_FN, FIELDS, NAME, SEARCH_RESULTS_MAX, WORKER_DIST_DIR} from '../const';
import {join} from 'path';

(async () => {
  const worker = await edgesearch.build({
    documents: JSON.parse(await fs.readFile(DATA_PARSED_JSON, 'utf8')).map((job: any) => ({
      content: JSON.stringify(job),
      terms: new Set(FIELDS.flatMap(field => EXTRACT_WORDS_FN(job[field]).map(fw => [field, fw].join('_')))),
    })),
    documentEncoding: 'json',
    error: 0.01,
    maximumQueryResults: SEARCH_RESULTS_MAX,
    name: NAME,
  });

  await fs.writeFile(join(WORKER_DIST_DIR, 'runner.wasm'), worker.wasm);
  await fs.writeFile(join(WORKER_DIST_DIR, 'worker.js'), worker.js);
})()
  .catch(console.error);
