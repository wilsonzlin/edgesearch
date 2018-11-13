"use strict";

const fs = require("fs-extra");
const moment = require("moment");
const path = require("path");
const minimist = require("minimist");

const ARGS = minimist(process.argv.slice(2));

const {
  BUILD_DATA_RAW,

  ENV_STATIC_URL,

  BUILD_DATA_JOBS,
  BUILD_DATA_FILTERS,
} = require("../const");

const FIELDS = ["title", "location"];

const WORD_MAP = {
  "architecte": "architect",
  "ii": ["2"],
  "ll": ["2"],
  "iii": ["3"],
  "iv": ["4"],
  "sr": ["senior"],
  "sw": ["software"],
  "engineerv": ["engineer"],
  "m365": ["microsoft", "365"],
  "ms": ["microsoft"],
  "o365": ["office", "365"],
  "office365": ["office", "365"],
};

const jobs = fs.readJSONSync(BUILD_DATA_RAW)
  .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
  .map(j => ({
    ID: j.jobId,
    title: j.title,
    date: moment(j.postedDate).format("YYYY-M-D"),
    location: j.location,
    description: j.descriptionTeaser,
  }));

function extract_words (sentence) {
  return sentence
    .replace(/[\[\]\-\/&_(),:;.（）、*"+!?$|]/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(w => /^[\x20-\x7e]+$/.test(w))
    .map(w => w.toLowerCase())
    .reduce((words, w) => words.concat(WORD_MAP[w] || [w]), [])
    ;
}

const job_words = new Map();
for (const job of jobs) {
  job_words.set(job, new Map());
}

function collate_words_of_field (field, jobs) {
  const set = new Set();

  for (const job of jobs) {
    const extracted = extract_words(job[field]);
    job_words.get(job).set(field, new Set(extracted));
    for (const word of extracted) {
      set.add(word);
    }
  }

  return [...set].sort();
}

function log_strings_list (description, list) {
  if (ARGS.log) {
    console.log(`${description} (${list.length}):
==================================
 ${list.join("\n ")}
`);
  }
}

const jobs_bitfield = () => Array(Math.ceil(jobs.length / 32)).fill(0);

const word_filters = {};
for (const field of FIELDS) {
  const words = collate_words_of_field(field, jobs);
  log_strings_list(field, words);

  const filter = word_filters[field] = {};
  for (const word of words) {
    const bitfield = filter[word] = jobs_bitfield();
    jobs.forEach((job, job_no) => {
      if (job_words.get(job).get(field).has(word)) {
        bitfield[Math.floor(job_no / 32)] |= Math.pow(2, 31 - (job_no % 32));
      }
    });
  }
}

fs.writeJSONSync(BUILD_DATA_JOBS, jobs);
fs.writeJSONSync(BUILD_DATA_FILTERS, word_filters);
