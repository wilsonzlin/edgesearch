"use strict";

const request = require("request-promise-native");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");
const moment = require("moment");
const express = require("express");
const Page = require("./template");

const CACHE = path.join(__dirname, "cache");
fs.ensureDirSync(CACHE);

const scrape = async (keywords, from) => {
  const cache_key = [from, ...keywords].join("_") + ".json";
  const cache_path = path.join(CACHE, cache_key);

  try {
    return await fs.readJSON(cache_path);
  } catch (_) {
    // Download
    console.info(`Fetching from ${from}...`);
    const page = await request({
      uri: `https://careers.microsoft.com/us/en/search-results`,
      qs: {
        keywords: keywords.join(" "),
        from: from,
        s: 1, // Sort by most recent
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

    await fs.writeJSON(cache_path, data);
    return data;
  }
};

const queue = new class {
  constructor(concurrency) {
    this._queue = [];
    this.active = 0;
    this.concurrency = concurrency;
  }

  async _process() {
    if (this.active >= this.concurrency || !this._queue.length) {
      return;
    }

    this.active++;
    const { resolve, reject, task } = this._queue.shift();

    let result;
    let error = null;
    try {
      result = await task();
    } catch (e) {
      error = e;
    }

    try {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    } finally {
      this.active--;
      this._process();
    }
  }

  queue(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ resolve, reject, task });
      this._process();
    });
  }
}(8);

const load = async (keywords_raw) => {
  const keywords = keywords_raw.trim().split(/\s+/);
  if (!keywords.every(k => /^[a-z]+$/.test(k))) {
    throw new TypeError(`Invalid keywords`);
  }

  const first = await scrape(keywords, 0);
  let pagination = first.hits;
  let total = first.totalHits;

  let scrapes = await Promise.all(Array(Math.ceil(total / pagination)).fill(true).map((_, i) => {
    const from = i * pagination;
    return queue.queue(() => scrape(keywords, from));
  }));

  return scrapes.reduce((jobs, data) => jobs.concat(data.data.jobs.map(j => ({
    ...j,
    postedDate: moment(j.postedDate),
    dateCreated: moment(j.dateCreated),
  }))), []);
};

const server = express();

const FIELDS = ["title", "location", "descriptionTeaser"];

const load_parameters = query => {
  return {
    keywords: query.keywords || "",
    // Check truthy first as moment(undefined) == moment()
    after: query.after && moment(query.after).isValid() ? moment(query.after) : null,
    rules: (query.rules_enabled || []).map((enabled_str, id) => {
      return {
        enabled: enabled_str === "true",
        expression: (query.rules_expression[id] || "").trim(),
        flags: query.rules_flags[id] || undefined,
        field: query.rules_field[id],
        invert: query.rules_invert[id] === "true",
        comment: query.rules_comment[id],
      };
    }).filter(r => FIELDS.includes(r.field)),
  };
};

server.get("/jobs", async (req, res) => {
  let { keywords, after, rules } = load_parameters(req.query);

  let jobs = [];

  if (keywords) {
    jobs = await load(keywords);

    if (after) {
      jobs = jobs.filter(j => j.postedDate.isAfter(moment(after)));
    }

    // Filter invalid rules
    rules = rules.filter(({ enabled, expression, flags, field, invert }) => {
      if (enabled) {
        try {
          jobs = jobs.filter(j => new RegExp(expression, flags).test(j[field]) ^ invert);
        } catch (_) {
          console.log(`Invalid rule /${expression}/${flags}`);
          return false;
        }
      }

      return true;
    });
  }

  res.send(Page({
    keywords: keywords,
    after: after && after.toISOString(),
    rules: rules,
    FIELDS: FIELDS,
    jobs: jobs.map(j => ({
      date: j.postedDate.toISOString(),
      date_formatted: j.postedDate.format("MMMM Do YYYY"),
      location: j.location,
      title: j.title,
      description: j.descriptionTeaser,
      URL: `https://careers.microsoft.com/us/en/job/${j.jobId}`,
    })),
  }));
});

server.listen(3001, () => console.log(`Server has started`));
