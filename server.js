"use strict";

const fs = require("fs-extra");
const path = require("path");
const express = require("express");
const moment = require("moment");
const Page = require("./template");
const redis = require("redis");
const { promisify } = require("util");

const db = redis.createClient();
const server = express();

const FIELDS = ["title"];
const JOBS = fs.readJSONSync(path.join(__dirname, "data-processed.json"))
  .map(j => ({
    ...j,
    date: moment(j.date),
  }))
const JOB_TITLE_WORDS = fs.readJSONSync(path.join(__dirname, "data-title-words.json"));
const JOB_TITLE_WORDS_SET = new Set(JOB_TITLE_WORDS);

const db_job_title_words_key = job => `${job.ID}_title_words`;

const db_cmd = promisify(db.send_command).bind(db);

(async function () {
  for (const job of JOBS) {
    await db_cmd("DEL", [db_job_title_words_key(job)]);
    await db_cmd(`BF.RESERVE`, [db_job_title_words_key(job), 0.000000001, job.title_words.length]);
    await db_cmd(`BF.MADD`, [db_job_title_words_key(job), ...job.title_words]);
  }

  server.listen(3001, () => console.log(`Server has started`));
})();

const parse_query_parameters = query => {
  return {
    // Check truthy first as moment(undefined) == moment()
    after: query.after && moment(query.after).isValid() ? moment(query.after) : null,
    rules: (query.rules_enabled || []).map((enabled_str, id) => {
      return {
        enabled: enabled_str === "true",
        words: (query.rules_words[id] || "").trim().split(/\s+/).filter(w => JOB_TITLE_WORDS_SET.has(w)),
        field: query.rules_field[id],
        invert: query.rules_invert[id] === "true",
        comment: query.rules_comment[id],
      };
    }).filter(r => FIELDS.includes(r.field) && r.words.length),
  };
};

const deduplicate = arr => {
  return [...new Set(arr)];
};

const db_job_title_words_test = async (job, words) => {
  return await db_cmd(`BF.MEXISTS`, [db_job_title_words_key(job), ...words]);
}

const db_job_title_words_assert_require = async (job, words) => {
  if (!words.length) {
    return;
  }
  const res = await db_job_title_words_test(job, words);
  if (res.some(r => !r)) {
    throw new ReferenceError(`Not all words matched`);
  }
}

const db_job_title_words_assert_exclude = async (job, words) => {
  if (!words.length) {
    return;
  }
  const res = await db_job_title_words_test(job, words);
  if (res.some(r => r)) {
    throw new ReferenceError(`Some words matched`);
  }
}

server.get("/jobs", async (req, res) => {
  let { after, rules } = parse_query_parameters(req.query);

  let jobs = JOBS;

  if (after) {
    jobs = jobs.filter(j => j.date.isAfter(moment(after)));
  }

  const required = deduplicate(rules.filter(r => r.enabled && !r.invert).reduce((t, r) => t.concat(r.words), []));
  const excluded = deduplicate(rules.filter(r => r.enabled && r.invert).reduce((t, r) => t.concat(r.words), []));

  jobs = (await Promise.all(jobs.map(job =>
    Promise.all([
      db_job_title_words_assert_require(job, required),
      db_job_title_words_assert_exclude(job, excluded),
    ])
      .then(() => job)
      .catch(() => null)
  ))).filter(j => j);

  res.send(Page({
    // User-submitted form data
    after: after && after.toISOString(),
    rules: rules.map(r => ({
      ...r,
      words: r.words.join(" "),
    })),

    FIELDS: FIELDS,

    // Results
    jobs: jobs.map(j => ({
      ...j,
      date: j.date.toISOString(),
      date_formatted: j.date.format("MMMM Do YYYY"),
      URL: `https://careers.microsoft.com/us/en/job/${j.ID}`,
    })),
  }));
});
