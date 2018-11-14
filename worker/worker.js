"use strict";

const FIELDS = new Set({__VAR_FIELDS});
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

const valid_word = (str, field) => {
  return !!FILTERS[field][str];
};

const parse_query = params => {
  // Don't initialise with all MODES as unused modes will break bitwise operations
  let parsed = {
    words: 0,
    rules: {},
  };

  for (const part of (params.get("q") || "").trim().split("|")) {
    const mode = part.startsWith("!") ? "exclude" :
                 part.startsWith("~") ? "contain" :
                 "require";

    const [field, words_raw] = part.slice(mode != "require").split(":", 2);

    if (!FIELDS.has(field)) {
      continue;
    }

    // TODO Limit words here
    const words = words_raw.replace(/[;:,]/g, " ")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(w => valid_word(w, field));

    // Don't create set until at least one word
    if (!words.length) {
      continue;
    }

    if (!parsed.rules[mode]) {
      parsed.rules[mode] = {};
    }

    if (!parsed.rules[mode][field]) {
      parsed.rules[mode][field] = new Set();
    }

    for (const word of words) {
      parsed.rules[mode][field].add(word);
      parsed.words++;
    }
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
  /*
   *   rules: {
   *     "require": {
   *       "title": Set(["a", "b"])
   *     },
   *     "exclude": {
   *       "title": Set(["c"]),
   *       "location": Set(["london"])
   *     }
   *   }
   *
   *   (title_a & title_b) & ~(title_c | location_london)
   */
  const {words, rules} = parse_query(url.searchParams);

  let jobs;
  let overflow;

  if (!words) {
    jobs = JOBS.slice(0, MAX_RESULTS);
    overflow = JOBS.length > MAX_RESULTS;
  } else {
    const bitfield_indexes = {
      "require": [],
      "contain": [],
      "exclude": [],
    };

    // Don't use MODES as unused modes will break bitwise operations
    for (const mode of Object.keys(rules)) {
      for (const field of Object.keys(rules[mode])) {
        for (const word of rules[mode][field]) {
          bitfield_indexes[mode].push(FILTERS[field][word]);
        }
      }
    }

    const struct_query_data = ["require", "contain", "exclude"]
      .map(m => {
        const data = Array(MAX_WORDS_PER_MODE + 1).fill(-1);
        // TODO Remove MAX limit here
        data.splice(0, Math.min(MAX_WORDS_PER_MODE, bitfield_indexes[m].length), ...bitfield_indexes[m]);
        return data;
      })
      .reduce((struct, list) => struct.concat(list));

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
