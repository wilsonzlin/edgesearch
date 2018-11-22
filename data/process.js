"use strict";

const fs = require("fs-extra");
const moment = require("moment");
const minimist = require("minimist");
const long = require("long");
const Entities = require("html-entities").AllHtmlEntities;

const entities = new Entities();

const ARGS = minimist(process.argv.slice(2));

const {
  BUILD_DATA_RAW,

  BUILD_DATA_JOBS,
  BUILD_DATA_FILTERS,

  FIELDS,
  FILTER_BITFIELD_BITS_PER_ELEM,
  FILTER_BITFIELD_LENGTH_FN,

  EXTRACT_WORDS_FN,
} = require("../const");

const jobs = fs.readJSONSync(BUILD_DATA_RAW)
  .sort((a, b) => b.postedDate.localeCompare(a.postedDate))
  .map(j => ({
    ID: j.jobId,
    title: j.title,
    date: moment.utc(j.postedDate).format("YYYY-M-D"),
    location: j.location,
    description: entities.decode(j.descriptionTeaser),
  }));

const job_words = new Map();
for (const job of jobs) {
  job_words.set(job, new Map());
}

function collate_words_of_field (field, jobs) {
  const set = new Set();

  for (const job of jobs) {
    const extracted = EXTRACT_WORDS_FN(job[field]);
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

const jobs_bitfield = () => Array(FILTER_BITFIELD_LENGTH_FN(jobs.length))
  .fill(null)
  .map(() => Array(FILTER_BITFIELD_BITS_PER_ELEM).fill(0));

const word_filters = {};
for (const field of FIELDS) {
  const words = collate_words_of_field(field, jobs);
  log_strings_list(field, words);

  const filter = word_filters[field] = {};
  for (const word of words) {
    const bitfield = jobs_bitfield();
    jobs.forEach((job, job_no) => {
      if (job_words.get(job).get(field).has(word)) {
        const idx = Math.floor(job_no / FILTER_BITFIELD_BITS_PER_ELEM);
        const elem = bitfield[idx];
        const bit = job_no % FILTER_BITFIELD_BITS_PER_ELEM;
        elem[bit] = 1;
        bitfield[idx] = elem;
      }
    });
    filter[word] = bitfield.map(arr => long.fromString(arr.join(""), true, 2).toString() + "u");
  }
}

fs.writeJSONSync(BUILD_DATA_JOBS, jobs);
fs.writeJSONSync(BUILD_DATA_FILTERS, word_filters);
