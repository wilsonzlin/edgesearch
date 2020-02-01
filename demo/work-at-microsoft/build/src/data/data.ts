import cheerio from 'cheerio';
import request from 'request-promise-native';
import {promises as fs} from 'fs';
import path from 'path';
import {Queue} from './queue';
import {CACHE_DIR, DATA_PARSED_JSON, DATA_RAW_JSON} from '../const';
import * as moment from 'moment';
import {AllHtmlEntities} from 'html-entities';

const entities = new AllHtmlEntities();

const scrape = async (from: number): Promise<any> => {
  const cacheKey = `${from}.json`;
  const cachePath = path.join(CACHE_DIR, cacheKey);

  try {
    return JSON.parse(await fs.readFile(cachePath, 'utf8'));
  } catch (_) {
    // Download.
    console.info(`Fetching from ${from}...`);
    const page = await request({
      uri: 'https://careers.microsoft.com/us/en/search-results',
      qs: {
        from,
        s: 1, // This is required, otherwise `from` is ignored.
        rt: 'professional', // Professional jobs.
      },
      headers: {
        // User agent is required, as otherwise the page responds with an error.
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36',
      },
    });

    // Parse.
    const $ = cheerio.load(page);
    const js = $('script').first().contents().text();
    const raw = js.slice(js.indexOf('phApp.ddo = {') + 12, js.lastIndexOf('; phApp.sessionParams'));
    const data = JSON.parse(raw).eagerLoadRefineSearch;

    // Save
    await fs.writeFile(cachePath, JSON.stringify(data));

    return data;
  }
};

const queue = new Queue(8);

const loadRaw = async () => {
  try {
    return JSON.parse(await fs.readFile(DATA_RAW_JSON, 'utf8'));
  } catch (_) {
    const first = await scrape(0);
    const pagination = first.hits;
    const total = first.totalHits;

    console.log(`Need to retrieve ${total} jobs in chunks of ${pagination}`);

    const scrapes = await Promise.all(
      Array(Math.ceil(total / pagination))
        .fill(void 0)
        .map((_, i) => queue.queue(() => scrape(i * pagination))),
    );

    const jobIds = new Set();

    return scrapes.reduce((jobs: any, data: any) =>
      jobs.concat(data.data.jobs.filter((j: any) => {
        if (jobIds.has(j.jobId)) {
          return false;
        }

        jobIds.add(j.jobId);
        return true;
      })), []);
  }
};

const parse = (rawData: any[]) =>
  rawData
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
    .map(j => ({
      ID: j.jobId,
      title: j.title,
      date: moment.utc(j.postedDate).format('YYYY-M-D'),
      location: j.location,
      description: entities.decode(j.descriptionTeaser),
    }));

(async () => {
  const raw = await loadRaw();
  await fs.writeFile(DATA_RAW_JSON, JSON.stringify(raw));
  console.log('Successfully retrieved data');
  const parsed = await parse(raw);
  await fs.writeFile(DATA_PARSED_JSON, JSON.stringify(parsed));
})()
  .catch(e => console.error(e));
