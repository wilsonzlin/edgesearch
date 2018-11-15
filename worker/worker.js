"use strict";

const FIELDS = new Set({__VAR_FIELDS});
const MODES_COUNT = {__VAR_MODES_COUNT};
const MAX_RESULTS = {__VAR_MAX_RESULTS};
const MAX_WORDS_PER_MODE = {__VAR_MAX_WORDS_PER_MODE};
const MAX_AUTOCOMPLETE_RESULTS = {__VAR_MAX_AUTOCOMPLETE_RESULTS};

const DATA = {__VAR_DATA};
const JOBS = DATA.jobs;
const FILTERS = DATA.filters;
const AUTOCOMPLETE_LISTS = [...FIELDS].reduce((obj, field) => {
  obj[field] = Object.keys(FILTERS[field]).sort();
  return obj;
}, {});

const response_error = (error, status = 400) =>
  new Response(JSON.stringify({error}), {
    status: status,
    headers: {
      "Content-Type": "application/json",
    },
  });

const response_success = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
    },
  });

// Find where a word would be inserted into an ordered list
const find_pos = (words, word, left = 0, right = words.length - 1) => {
  if (left >= right) {
    return left;
  }
  if (left + 1 == right) {
    return word <= words[left] ? left : right;
  }
  const mid_pos = left + Math.floor((right - left) / 2);
  const mid_word = words[mid_pos];
  if (word === mid_word) {
    return mid_pos;
  }
  if (word < mid_word) {
    // Could still be $mid_pos, i.e. $mid_pos -1 <= x < $mid_pos
    return find_pos(words, word, left, mid_pos);
  }
  // Could still be $mid_pos, i.e. $mid_pos < x <= $mid_pos + 1
  return find_pos(words, word, mid_pos, right);
};

const handle_autocomplete = url => {
  const field = url.searchParams.get("f");
  if (!FIELDS.has(field)) {
    return response_error("Invalid field", 404);
  }

  const term = (url.searchParams.get("t") || "")
    .trim()
    .toLowerCase();

  if (!/^[!-z]+$/.test(term)) {
    return response_error("Bad term");
  }

  const results = [];
  const words = AUTOCOMPLETE_LISTS[field];

  for (let pos = find_pos(words, term), count = 0;
       pos < words.length && count < MAX_AUTOCOMPLETE_RESULTS;
       pos++, count++) {
    const word = words[pos];
    if (!word.startsWith(term)) {
      break;
    }
    results.push(word);
  }

  return response_success(results);
};

const parse_query = qs => {
  let parsed = new Array((MAX_WORDS_PER_MODE + 1) * MODES_COUNT).fill(-1);

  if (!qs.startsWith("?q=")) {
    return;
  }
  qs = qs.slice(3);

  let last_mode = 0;
  let last_mode_field = "";
  let last_mode_field_word = "";

  let mode_words_count = 0;

  while (qs) {
    // TODO Abstract out field and word regex parts
    const matches = /^([123])_([a-z]+)_([a-z0-9-]+)(?:&|$)/.exec(qs);
    if (!matches) {
      return;
    }
    qs = qs.slice(matches[0].length);
    const mode = Number.parseInt(matches[1], 10);
    const field = matches[2];
    const word = matches[3];

    if (!FIELDS.has(field)) {
      return;
    }

    // Enforce query string must be sorted for caching

    if (last_mode > mode) {
      return;
    } else if (last_mode != mode) {
      last_mode = mode;
      // Changing this will cause $last_mode_field_word to be invalidated
      last_mode_field = "";
      mode_words_count = 0;
    }

    if (last_mode_field > field) {
      return;
    } else if (last_mode_field != field) {
      last_mode_field = field;
      last_mode_field_word = "";
    }

    if (last_mode_field_word >= word) {
      // Words must be unique per mode-field
      return;
    } else if (last_mode_field_word != word) {
      last_mode_field_word = word;
    }

    mode_words_count++;
    if (mode_words_count > MAX_WORDS_PER_MODE) {
      return;
    }

    // The zeroth field is a fully-zero field, used for non-existent words
    parsed[(mode - 1) * (MAX_WORDS_PER_MODE + 1) + (mode_words_count - 1)] = FILTERS[field][word] || 0;
  }

  return parsed;
};

const wasm_memory = new WebAssembly.Memory({initial: 48});
const wasm_instance = new WebAssembly.Instance(QUERY_RUNNER_WASM, {
  env: {
    memory: wasm_memory,
  },
});

const query_runner = wasm_instance.exports;
const query_runner_memory = new DataView(wasm_memory.buffer);

const handle_search = url => {
  const struct_query_data = parse_query(url.search);
  if (!struct_query_data) {
    return response_error("Invalid query");
  }

  let jobs;
  let overflow;

  if (struct_query_data.every(q => q == -1)) {
    jobs = JOBS.slice(0, MAX_RESULTS);
    overflow = JOBS.length > MAX_RESULTS;
  } else {
    const input_ptr = query_runner.init();
    for (const [no, int16] of struct_query_data.entries()) {
      query_runner_memory.setInt16(input_ptr + (no * 2), int16, true);
    }

    const output_ptr = query_runner.search();

    jobs = [];
    for (let result_no = 0; ; result_no++) {
      const job_idx = query_runner_memory.getInt32(output_ptr + (result_no * 4), true);
      if (job_idx == -1) {
        break;
      }
      jobs.push(JOBS[job_idx]);
    }
    overflow = jobs.length >= MAX_RESULTS;
  }

  return response_success({jobs, overflow});
};

const entry_handler = event => {
  const request = event.request;
  const url = new URL(request.url);

  let handler;
  switch (url.pathname) {
  case "/":
    url.pathname = "/jobs";
    return Response.redirect(url.href);
  case "/search":
    handler = handle_search;
    break;
  case "/autocomplete":
    handler = handle_autocomplete;
    break;
  default:
    // Continue request to origin
    return fetch(request);
  }

  return handler(url);
};

addEventListener("fetch", event => {
  event.respondWith(entry_handler(event));
});
