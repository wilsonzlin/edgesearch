"use strict";

const fs = require("fs-extra");
const shelljs = require("shelljs");

const {minify_js} = require("./build-common");

const {
  WORKER_SCRIPT,
  WORKER_WASM,

  BUILD_WORKER,
  BUILD_WORKER_C,
  BUILD_WORKER_WASM,

  BUILD_DATA_JOBS,
  BUILD_DATA_FILTERS,

  FIELDS,

  FILTER_BITFIELD_BITS_PER_ELEM,
  FILTER_BITFIELD_LENGTH_FN,
  SEARCH_RESULTS_MAX,
  SEARCH_MODE_MAX_WORDS,
  SEARCH_AUTOCOMPLETE_MAX_RESULTS,
} = require("./const");

/*
 *
 *  {
 *    jobs: [...],
 *    filters: {
 *      title|location: { // Field
 *        word: 72, // Index of bitfield in $filter_bitfields
 *      }
 *    }
 *  }
 *
 */
const jobs = fs.readJSONSync(BUILD_DATA_JOBS);
let worker_data = {
  jobs,
  filters: {},
};
let filter_bitfields = [];

const filters = fs.readJSONSync(BUILD_DATA_FILTERS);
for (const field of Object.keys(filters)) {
  worker_data.filters[field] = {};
  for (const word of Object.keys(filters[field])) {
    worker_data.filters[field][word] = filter_bitfields.push(filters[field][word]) - 1;
  }
}

fs.readFile(WORKER_WASM, "utf8")
  .then(c => c.replace(/\/\*\s*{{{{{ (.*?) }}}}}\s*\*\//g, (_, param) => {
    switch (param) {
    case "FILTERS":
      return filter_bitfields.map(f => `{${f.join(",")}}`).join(",\n");
    default:
      throw new ReferenceError(`Unknown parameter ${param}`);
    }
  }))
  .then(c => fs.writeFile(BUILD_WORKER_C, c))
  .then(() => shelljs.exec(`
  	clang -std=c11 -O2 -Wall -Wextra -Werror --target=wasm32-unknown-unknown-wasm \\
	    -nostdlib -nostdinc -isystemstubs -Wl,--no-entry -Wl,--import-memory \\
	    -DBITFIELD_BITS_PER_ELEM=${FILTER_BITFIELD_BITS_PER_ELEM} \\
	    -DBITFIELD_LENGTH=${FILTER_BITFIELD_LENGTH_FN(jobs.length)} \\
	    -DFILTERS_COUNT=${filter_bitfields.length} \\
	    -DMAX_RESULTS=${SEARCH_RESULTS_MAX} \\
	    -DMAX_WORDS_PER_MODE=${SEARCH_MODE_MAX_WORDS} \\
	    "${BUILD_WORKER_C}" -o "${BUILD_WORKER_WASM}"
  `))
  .catch(console.error);

fs.readFile(WORKER_SCRIPT, "utf8")
  .then(js => js.replace(/{__VAR_(.*?)}/g, (_, param) => {
    switch (param) {
    case "DATA":
      return JSON.stringify(worker_data);
    case "MAX_RESULTS":
      return SEARCH_RESULTS_MAX;
    case "MAX_WORDS_PER_MODE":
      return SEARCH_MODE_MAX_WORDS;
    case "FIELDS":
      return JSON.stringify(FIELDS);
    case "MAX_AUTOCOMPLETE_RESULTS":
      return SEARCH_AUTOCOMPLETE_MAX_RESULTS;
    default:
      throw new ReferenceError(`Unknown parameter ${param}`);
    }
  }))
  .then(minify_js)
  .then(js => fs.writeFile(BUILD_WORKER, js))
  .catch(console.error)
;
