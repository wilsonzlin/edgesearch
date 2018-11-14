"use strict";

const FIELDS = ["title", "location"];
const MAX_RESULTS = {__VAR_MAX_RESULTS};
const MAX_WORDS_PER_MODE = {__VAR_MAX_WORDS_PER_MODE};

let data_fetch_promise;
let JOBS, FILTERS;

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

    if (!FIELDS.includes(field)) {
      continue;
    }

    // TODO Limit words here
    const words = words_raw.replace(/[;:,]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(w => valid_word(w, field))
      .map(w => w.toLowerCase());

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

const wasm_memory = new WebAssembly.Memory({initial: 12});
const wasm_instance = new WebAssembly.Instance(QUERY_RUNNER_WASM, {
  env: {
    memory: wasm_memory,
  },
});

const query_runner = wasm_instance.exports;
const query_runner_memory = new DataView(wasm_memory.buffer);

const handler = async (request) => {
  const url = new URL(request.url);

  switch (url.pathname) {
  case "/":
    url.pathname = "/jobs";
    return Response.redirect(url.href);
  case "/search":
    // This script
    break;
  default:
    // Continue request to origin
    return fetch(request);
  }

  if (!data_fetch_promise) {
    // TODO .catch
    data_fetch_promise = fetch("{__VAR_DATA_URL}")
      .then(res => res.json())
      .then(d => {
        JOBS = d.jobs;
        FILTERS = d.filters;
      })
      .catch(err => {
        // TODO
        console.error(err);
      });
  }
  if (!JOBS) {
    await data_fetch_promise;
    if (!JOBS) {
      // Failed
      // TODO
      return new Response(JSON.stringify({error: "Internal server error"}), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  }

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
  const {words, rules} = await parse_query(url.searchParams);

  let jobs;
  let overflow;

  if (!words) {
    jobs = JOBS.slice(0, MAX_RESULTS);
    overflow = jobs.length > MAX_RESULTS;
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

  return new Response(JSON.stringify({jobs, overflow}), {
    headers: {
      "Content-Type": "application/json",
    }
  });
};

addEventListener("fetch", event => {
  event.respondWith(handler(event.request));
});
