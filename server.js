"use strict";

const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment");
const handlebars = require("handlebars");
const redis = require("redis");
const minimist = require("minimist");
const {promisify} = require("util");

const ARGS = minimist(process.argv.slice(2));
const PAGE_TEMPLATE_PATH = path.join(__dirname, "page.hbs");
const FIELDS = ["title", "location"];
const MODES = ["require", "contain", "exclude"];
const JOBS = fs.readJSONSync(path.join(__dirname, "data-processed.json"));

const db = redis.createClient();
const db_job_words_key = (job, field) => `${job.ID}_${field}_words`;
const db_cmd = promisify(db.send_command).bind(db);
const server = express();

const compile_page_template = () => {
  return handlebars.compile(fs.readFileSync(PAGE_TEMPLATE_PATH, "utf8"));
};
let Page = compile_page_template();

if (ARGS.debug) {
  console.log(`DEBUG MODE`);
  fs.watchFile(PAGE_TEMPLATE_PATH, () => {
    console.log(`Recompiling template...`);
    Page = compile_page_template();
  });
}
server.use("/static", express.static(path.join(__dirname, "static")));

(async function () {
  for (const job of JOBS) {
    for (const field of FIELDS) {
      const words = job._words[field];
      if (!words) {
        throw new ReferenceError(`Processed data for job ${job.ID} does not contain words for field ${field}`);
      }
      const key = db_job_words_key(job, field);
      await db_cmd("DEL", [key]);
      await db_cmd(`BF.RESERVE`, [key, 0.000000001, words.length]);
      await db_cmd(`BF.MADD`, [key, ...words]);
    }
    delete job._words;
  }

  server.listen(3001, () => console.log(`Server has started`));
})();

const valid_word = str => {
  // TODO
  return true;
};

const validate_query_parameters = query => {
  return {
    // toISOString will return null if invalid; `undefined - 1` is NaN
    after: moment.utc([query.after_year, query.after_month - 1, query.after_day]).toISOString(),
    rules: (query.rules_enabled || []).map((enabled_str, id) => {
      return {
        enabled: enabled_str === "true",
        words: ((query.rules_words || [])[id] || "").trim().split(/\s+/).filter(w => valid_word(w)),
        field: (query.rules_field || [])[id],
        mode: (query.rules_mode || [])[id],
      };
    }).filter(r => FIELDS.includes(r.field) && MODES.includes(r.mode) && r.words.length),
  };
};

const db_job_words_test = async (job, field, words) => {
  return await db_cmd(`BF.MEXISTS`, [db_job_words_key(job, field), ...words]);
};

const db_job_words_assert_mode = {
  "require": async (job, field, words) => {
    if (!words.length) {
      return;
    }
    const res = await db_job_words_test(job, field, words);
    if (res.some(r => !r)) {
      throw new ReferenceError(`Not all words matched`);
    }
  },
  "contain": async (job, field, words) => {
    if (!words.length) {
      return;
    }
    const res = await db_job_words_test(job, field, words);
    if (!res.some(r => r)) {
      throw new ReferenceError(`No words matched`);
    }
  },
  "exclude": async (job, field, words) => {
    if (!words.length) {
      return;
    }
    const res = await db_job_words_test(job, field, words);
    if (res.some(r => r)) {
      throw new ReferenceError(`Some words matched`);
    }
  },
};

server.get("/jobs", async (req, res) => {
  let {after, rules} = validate_query_parameters(req.query);

  let jobs = JOBS;

  if (after) {
    jobs = jobs.filter(j => j.date > after);
  }

  const word_rules = {
    "require": {},
    "contain": {},
    "exclude": {},
  };

  for (const {enabled, words, field, mode} of rules) {
    if (!enabled) {
      continue;
    }
    if (!word_rules[mode][field]) {
      word_rules[mode][field] = new Set();
    }
    for (const word of words) {
      word_rules[mode][field].add(word);
    }
  }

  const word_rules_promises = [];
  for (const job of jobs) {
    const job_subpromises = [];
    for (const mode of Object.keys(word_rules)) {
      for (const field of Object.keys(word_rules[mode])) {
        const words = [...word_rules[mode][field]];
        job_subpromises.push(db_job_words_assert_mode[mode](job, field, words));
      }
    }
    word_rules_promises.push(Promise.all(job_subpromises).then(() => job, () => null));
  }

  jobs = (await Promise.all(word_rules_promises)).filter(j => j);

  let now = moment();

  res.send(Page({
    // User-submitted form data
    afterYear: after ? after.slice(0, 4) : now.year(),
    afterMonth: after ? after.slice(5, 7) : Math.max(now.month(), 1),
    afterDay: after ? after.slice(8, 10) : 1,
    rules: rules.map(r => ({
      ...r,
      words: r.words.join(" "),
    })),

    FIELDS: FIELDS,

    // Results
    jobs: jobs,
    resultsCount: jobs.length,
    todayHumanDate: now.format("MMMM Do YYYY"),
  }));
});
