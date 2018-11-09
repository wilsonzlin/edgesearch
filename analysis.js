"use strict";

const fs = require("fs-extra");
const moment = require("moment");
const path = require("path");

const PATH_DATA_RAW = path.join(__dirname, "data-raw.json");
const PATH_DATA_PROCESSED = path.join(__dirname, "data-processed.json");
const PATH_TITLE_WORDS = path.join(__dirname, "data-title-words.json");

const word_map = {
  "ii": ["2"],
  "ll": ["2"],
  "iii": ["3"],
  "iv": ["4"],
  "sr": ["senior"],
  "sw": ["software"],
  "engineerv": ["engineer"],
  "d’azure": ["azure"],
  "m365": ["microsoft", "365"],
  "ms": ["microsoft"],
  "o365": ["office", "365"],
  "office365": ["office", "365"],
};

function extract_words(sentence) {
  return sentence
    .replace(/[\[\]\-\/&_(),:;.（）、*"+!?$|]/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(w => /^[\x20-\x7e]+$/.test(w))
    .map(w => w.toLowerCase())
    .reduce((words, w) => words.concat(word_map[w] || [w]), [])
    ;
}

function log_words(words) {
  console.log(`Words (${words.length}):
==================================
 ${words.join("\n ")}
`);
}

const jobs = fs.readJSONSync(PATH_DATA_RAW)
  .map(j => ({
    ID: j.jobId,
    title: j.title,
    title_words: extract_words(j.title),
    date: moment(j.postedDate),
    location: j.location,
    description: j.descriptionTeaser,
  }));

const title_words = [...new Set(
  jobs.reduce(
    (words, job) => words.concat(job.title_words),
    []
  )
)].sort();

log_words(title_words);

fs.writeJSONSync(PATH_TITLE_WORDS, title_words);
fs.writeJSONSync(PATH_DATA_PROCESSED, jobs);
