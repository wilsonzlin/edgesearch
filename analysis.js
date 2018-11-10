"use strict";

const fs = require("fs-extra");
const moment = require("moment");
const path = require("path");

const PATH_DATA_RAW = path.join(__dirname, "data-raw.json");
const PATH_DATA_PROCESSED = path.join(__dirname, "data-processed.json");

const word_map = {
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

function extract_words (sentence) {
  return sentence
    .replace(/[\[\]\-\/&_(),:;.（）、*"+!?$|]/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(w => /^[\x20-\x7e]+$/.test(w))
    .map(w => w.toLowerCase())
    .reduce((words, w) => words.concat(word_map[w] || [w]), [])
    ;
}

function collate_words_of_field (field, jobs) {
  const set = new Set();

  for (const job of jobs) {
    const extracted = job._words[field] = extract_words(job[field]);
    for (const word of extracted) {
      set.add(word);
    }
  }

  return [...set].sort();
}

function log_strings_list (description, list) {
  console.log(`${description} (${list.length}):
==================================
 ${list.join("\n ")}
`);
}

const jobs = fs.readJSONSync(PATH_DATA_RAW)
  .map(j => ({
    _words: {},
    ID: j.jobId,
    title: j.title,
    date: moment(j.postedDate).toISOString(),
    humanDate: moment(j.postedDate).format("MMMM Do YYYY"),
    location: j.location,
    description: j.descriptionTeaser,
    URL: `https://careers.microsoft.com/us/en/job/${j.jobId}`,
  }))
  .sort((a, b) => b.date.localeCompare(a.date));

const title_words = collate_words_of_field("title", jobs);
log_strings_list("Title words", title_words);

const location_words = collate_words_of_field("location", jobs);
log_strings_list("Locations", location_words);

fs.writeJSONSync(PATH_DATA_PROCESSED, jobs);
