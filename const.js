"use strict";

const fs = require("fs-extra");
const path = require("path");
const escape_string_regexp = require("escape-string-regexp");

// TODO Document everything
const CLIENT = path.join(__dirname, "client");
const CLIENT_TEMPLATE = path.join(CLIENT, "page.hbs");

const DATA = path.join(__dirname, "data");

const WORKER = path.join(__dirname, "worker");
const WORKER_SCRIPT = path.join(WORKER, "worker.js");
const WORKER_WASM = path.join(WORKER, "worker.c");

const BUILD = path.join(__dirname, "build");
fs.ensureDirSync(BUILD);
const BUILD_CLIENT = path.join(BUILD, "client.html");
const BUILD_WORKER = path.join(BUILD, "worker.js");
const BUILD_WORKER_C = path.join(BUILD, "worker.c");
const BUILD_WORKER_WASM = path.join(BUILD, "worker.wasm");
const BUILD_DATA_RAW = path.join(BUILD, "data-raw.json");
const BUILD_DATA_JOBS = path.join(BUILD, "data-jobs.json");
const BUILD_DATA_FILTERS = path.join(BUILD, "data-filters.json");

const CACHE = path.join(__dirname, "cache");
fs.ensureDirSync(CACHE);

const ENV_ANALYTICS = process.env.MSC_ANALYTICS;
if (!ENV_ANALYTICS) {
  console.warn(`[WARN] Environment variable MSC_ANALYTICS missing`);
}

const DESCRIPTION = `Find your next career at Microsoft.`;

const FIELDS = ["title", "location", "description"];
const FIELD_SUBREGEX = FIELDS.map(f => escape_string_regexp(f)).join("|");
// TODO These words are no longer used, but length is
const MODES = ["require", "contain", "exclude"];
const FILTER_BITFIELD_BITS_PER_ELEM = 64;
const FILTER_BITFIELD_LENGTH_FN = jobsCount => Math.ceil(jobsCount / FILTER_BITFIELD_BITS_PER_ELEM);

const SEARCH_RESULTS_MAX = 50;
const SEARCH_WORDS_MAX = 50;
const SEARCH_AUTOCOMPLETE_MAX_RESULTS = 5;

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

const VALID_WORD_SUBREGEX = "[a-z0-9-]{1,25}";
const VALID_WORD_REGEX = new RegExp(`^${VALID_WORD_SUBREGEX}$`);

const EXTRACT_WORDS_FN = sentence => sentence
  .replace(/[~!@#$%^&*?_|[\]\\,./;'`"<>:()+{}（）、’]/g, " ")
  .trim()
  .toLowerCase()
  .split(/\s+/)
  // This .filter will take care of single empty string on splitting of ""
  .filter(w => VALID_WORD_REGEX.test(w))
  .reduce((words, w) => words.concat(WORD_MAP[w] || [w]), [])
;

module.exports = {
  BUILD,
  BUILD_CLIENT,
  BUILD_DATA_FILTERS,
  BUILD_DATA_JOBS,
  BUILD_DATA_RAW,
  BUILD_WORKER,
  BUILD_WORKER_C,
  BUILD_WORKER_WASM,
  CACHE,
  CLIENT,
  CLIENT_TEMPLATE,
  DATA,
  DESCRIPTION,
  ENV_ANALYTICS,
  EXTRACT_WORDS_FN,
  FIELD_SUBREGEX,
  FIELDS,
  FILTER_BITFIELD_BITS_PER_ELEM,
  FILTER_BITFIELD_LENGTH_FN,
  MODES,
  SEARCH_AUTOCOMPLETE_MAX_RESULTS,
  SEARCH_RESULTS_MAX,
  SEARCH_WORDS_MAX,
  VALID_WORD_REGEX,
  VALID_WORD_SUBREGEX,
  WORD_MAP,
  WORKER,
  WORKER_SCRIPT,
  WORKER_WASM,
};
