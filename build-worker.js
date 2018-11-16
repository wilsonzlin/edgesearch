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
  MODES,

  FILTER_BITFIELD_BITS_PER_ELEM,
  FILTER_BITFIELD_LENGTH_FN,
  SEARCH_RESULTS_MAX,
  SEARCH_WORDS_MAX,
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
// First bit field is the one used for non-existent words
let filter_bitfields = [Array(FILTER_BITFIELD_LENGTH_FN(jobs.length)).fill(0)];

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
	    -DMAX_WORDS=${SEARCH_WORDS_MAX} \\
	    -DMODES_COUNT=${MODES.length} \\
	    "${BUILD_WORKER_C}" -o "${BUILD_WORKER_WASM}"
  `))
  .catch(console.error);

fs.readFile(WORKER_SCRIPT, "utf8")
  .then(js => js.replace(/{__VAR_(.*?)}/g, (_, param) => {
    switch (param) {
    case "DATA":
      return JSON.stringify(worker_data);
    case "FIELDS":
      return JSON.stringify(FIELDS);
    case "MAX_AUTOCOMPLETE_RESULTS":
      return SEARCH_AUTOCOMPLETE_MAX_RESULTS;
    case "MAX_RESULTS":
      return SEARCH_RESULTS_MAX;
    case "MAX_WORDS":
      return SEARCH_WORDS_MAX;
    case "MODES_COUNT":
      return MODES.length;
    default:
      throw new ReferenceError(`Unknown parameter ${param}`);
    }
  }))
  .then(minify_js)
  .then(js => fs.writeFile(BUILD_WORKER, js))
  .catch(console.error)
;
