import cheerio from 'cheerio';
import {promises as fs} from 'fs';
import {AllHtmlEntities} from 'html-entities';
import * as moment from 'moment';
import {join} from 'path';
import request from 'request';
import {
  CACHE_DIR,
  DATA_DEFAULT,
  DATA_DOCUMENTS,
  DATA_PARSED_JSON,
  DATA_RAW_JSON,
  DATA_TERMS,
  EXTRACT_WORDS_FN,
  FIELDS,
  SEARCH_RESULTS_MAX,
} from '../const';
import {Job, Results} from './model';
import {Queue} from './queue';

const entities = new AllHtmlEntities();

const DDO_START = 'phApp.ddo = ';
const FETCH_JITTER = 250;

const fetchDdo = async <O> (uri: string, qs?: { [name: string]: string | number }): Promise<O | null> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      request({
        uri,
        qs,
        headers: {
          // User agent is required, as otherwise the page responds with an error.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36',
        },
        timeout: 5000,
      }, (error, response, body) => {
        if (error) {
          return reject(error);
        }
        if (response.statusCode >= 400 && response.statusCode < 500) {
          return resolve(null);
        }
        // Parse. If the status is bad (e.g. 500), then the data should not exist and we'll resolve with null.
        const $ = cheerio.load(body);
        for (const $script of $('script').get()) {
          const js = $($script).contents().text();
          const start = js.indexOf(DDO_START);
          if (start == -1) {
            continue;
          }
          return resolve(JSON.parse(js.slice(start + DDO_START.length, js.indexOf('; phApp.sessionParams', start))));
        }
        return resolve(null);
      });
    }, Math.floor(Math.random() * FETCH_JITTER)));

const jsonFromCache = async <V> (cachePath: string, computeFn: () => Promise<V>): Promise<V> => {
  try {
    return JSON.parse(await fs.readFile(cachePath, 'utf8'));
  } catch (e) {
    if (e.code != 'ENOENT') {
      throw e;
    }
    const value = await computeFn();
    await fs.writeFile(cachePath, JSON.stringify(value));
    return value;
  }
};

const fetchJobDescription = async (id: string | number): Promise<string> => {
  const job = await jsonFromCache<Job>(join(CACHE_DIR, `job${id}.json`), async () => {
    console.info(`Fetching job ID ${id}`);
    const ddo = await fetchDdo<any>(`https://careers.microsoft.com/professionals/us/en/job/${id}/`);
    return ddo && ddo.jobDetail.data.job;
  });
  if (job == null) {
    return '';
  }
  return cheerio(`<div>${[job.description, job.jobSummary, job.jobResponsibilities, job.jobQualifications].join('')}</div>`).text();
};

const fetchResults = async (from: number): Promise<Results> =>
  jsonFromCache<Results>(join(CACHE_DIR, `results${from}.json`), async () => {
    console.info(`Fetching results from ${from}...`);
    const ddo = await fetchDdo<any>(`https://careers.microsoft.com/us/en/search-results`, {
      from,
      s: 1, // This is required, otherwise `from` is ignored.
      rt: 'professional', // Professional jobs.
    });
    return ddo.eagerLoadRefineSearch;
  });

const queue = new Queue(12);

const loadRaw = async () =>
  jsonFromCache(join(DATA_RAW_JSON), async () => {
    const first = await fetchResults(0);
    const pagination = first.hits;
    const total = first.totalHits;

    console.info(`Need to retrieve ${total} jobs in chunks of ${pagination}`);

    const results = await Promise.all(
      Array.from(
        {length: Math.ceil(total / pagination)},
        (_, i) => queue.queue(() => fetchResults(i * pagination)),
      ),
    );

    const jobs = results.flatMap(result => result.data.jobs);

    const fullDescriptions = await Promise.all(jobs.map(j => queue.queue(() => fetchJobDescription(j.jobId))));

    return jobs.map((j, i) => ({
      ...j,
      fullDescription: fullDescriptions[i] || j.descriptionTeaser,
    }));
  });

const parse = (rawData: any[]) =>
  rawData
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
    .map(j => ({
      ID: j.jobId,
      title: j.title,
      date: moment.utc(j.postedDate).format('YYYY-M-D'),
      location: j.location,
      preview: entities.decode(j.descriptionTeaser),
      description: entities.decode(j.fullDescription),
    }));

const withShortDescription = (j: any) => ({
  ...j,
  preview: undefined,
  description: j.preview,
});

(async () => {
  const raw = await loadRaw();
  console.info('Successfully retrieved data');

  const parsed = await parse(raw);
  await fs.writeFile(DATA_PARSED_JSON, JSON.stringify(parsed));
  await fs.writeFile(DATA_DEFAULT, JSON.stringify(parsed.slice(0, SEARCH_RESULTS_MAX).map(withShortDescription)));

  const contents = parsed.map(j => JSON.stringify(withShortDescription(j)) + '\0').join('');
  const terms = parsed.map(job =>
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
