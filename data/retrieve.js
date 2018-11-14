"use strict";

const request = require("request-promise-native");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment");
const Queue = require("../queue");

const {
  CACHE,

  BUILD_DATA_RAW,
} = require("../const");

const scrape = async (from) => {
  const cache_key = `${from}.json`;
  const cache_path = path.join(CACHE, cache_key);

  try {
    return await fs.readJSON(cache_path);
  } catch (_) {
    // Download
    console.info(`Fetching from ${from}...`);
    const page = await request({
      uri: `https://careers.microsoft.com/us/en/search-results`,
      qs: {
        from: from,
        s: 1, // This is required, otherwise $from is ignored
        rt: "professional", // Progressional jobs
      },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36",
      },
    });

    // Parse
    const $ = cheerio.load(page);
    const js = $("script").first().contents().text();
    const raw = js.slice(js.indexOf("phApp.ddo = {") + 12, js.lastIndexOf("; phApp.sessionParams"));
    const data = JSON.parse(raw).eagerLoadRefineSearch;

    // Save
    await fs.writeJSON(cache_path, data);

    return data;
  }
};

const queue = new Queue(8);

const load = async () => {
  try {
    return await fs.readJSON(BUILD_DATA_RAW);
  } catch (_) {
    const first = await scrape(0);
    const pagination = first.hits;
    const total = first.totalHits;

    console.log(`Need to retrieve ${total} jobs in chunks of ${pagination}`);

    const scrapes = await Promise.all(Array(Math.ceil(total / pagination)).fill(true).map((_, i) => {
      const from = i * pagination;
      return queue.queue(() => scrape(from));
    }));

    const jobIds = new Set();

    const data = scrapes.reduce((jobs, data) => jobs.concat(data.data.jobs.map(j => {
      if (jobIds.has(j.jobId)) {
        return null;
      }

      jobIds.add(j.jobId);
      return {
        ...j,
        postedDate: moment(j.postedDate),
        dateCreated: moment(j.dateCreated),
      };
    }).filter(j => j)), []);

    await fs.writeJSON(BUILD_DATA_RAW, data);

    return data;
  }
};

load()
  .then(() => console.log(`Successfully retrieved data`))
  .catch(e => console.error(e))
;
