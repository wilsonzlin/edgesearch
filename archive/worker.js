"use strict";

const FIELDS = ["title", "location"];
const MODES = ["require", "contain", "exclude"];
const MAX_RESULTS = 200;
const FILTER_BITS_PER_ELEM = 32;
const FILTER_MSB_MASK = 0x80000000 | 0;

let data_fetch_queue;
let data;

const get_jobs = () => {
  if (data) {
    return Promise.resolve(data.JOBS);
  }
  return new Promise(resolve => {
    data_fetch_queue.push([resolve, "JOBS"]);
  });
};

const get_filters = () => {
  if (data) {
    return Promise.resolve(data.FILTERS);
  }
  return new Promise(resolve => {
    data_fetch_queue.push([resolve, "FILTERS"]);
  });
};

const typedarray_and = arrays => {
  const result = arrays[0].slice();
  for (let typedarray_no = 1; typedarray_no < arrays.length; typedarray_no++) {
    const src = arrays[typedarray_no];
    for (let i = 0; i < result.length; i++) {
      result[i] &= src[i];
    }
  }
  return result;
};

const typedarray_i_and = arrays => {
  const result = arrays[0];
  for (let typedarray_no = 1; typedarray_no < arrays.length; typedarray_no++) {
    const src = arrays[typedarray_no];
    for (let i = 0; i < result.length; i++) {
      result[i] &= src[i];
    }
  }
  return result;
};

const typedarray_or = arrays => {
  const result = arrays.shift().slice();
  for (const src of arrays) {
    for (let i = 0; i < result.length; i++) {
      result[i] |= src[i];
    }
  }
  return result;
};

const typedarray_not = array => {
  const result = new Int32Array(array.length);
  for (let i = 0; i < array.length; i++) {
    result[i] = ~array[i];
  }
  return result;
};

const typedarray_i_not = array => {
  for (let i = 0; i < array.length; i++) {
    array[i] = ~array[i];
  }
  return array;
};

const valid_word_or_null = async (str, field) => {
  return !!(await get_filters())[field][str] ? str : null;
};

const parse_query = async (params) => {
  let parsed = FIELDS.map(field => ({
    field: field,
    terms: [],
  }));

  for (const part of (params.get("q") || "").trim().split("|")) {
    const mode = part.startsWith("!") ? "exclude" :
                 part.startsWith("~") ? "contain" :
                 "require";

    const [field, words_raw] = part.slice(mode != "require").split(":", 2);

    if (FIELDS.includes(field)) {
      const words = (await Promise.all(words_raw.replace(/[;:,]/g, " ")
        .trim()
        .split(/\s+/)
        .map(w => valid_word_or_null(w, field))
      ))
        .filter(w => w)
        .map(w => w.toLowerCase());
      if (words.length) {
        parsed.find(r => r.field == field).terms.push({mode, words});
      }
    }
  }

  return parsed;
};

const handler = async (request) => {
  if (!data_fetch_queue) {
    data_fetch_queue = [];
    // TODO .catch
    await fetch("{{{{{ DATA_URL }}}}}")
      .then(res => res.json())
      .then(d => {
        for (const field of Object.keys(d.FILTERS)) {
          for (const word of Object.keys(d.FILTERS[field])) {
            d.FILTERS[field][word] = new Int32Array(d.FILTERS[field][word]);
          }
        }
        data = d;
        data_fetch_queue.forEach(([resolve, prop]) => resolve(d[prop]));
      });
  }

  const requestURL = new URL(request.url);

  if (requestURL.protocol !== "https:") {
    requestURL.protocol = "https:";
    return Response.redirect(requestURL.href);
  }

  if (requestURL.pathname == "/") {
    return Response.redirect(`${requestURL.protocol}//${requestURL.host}/jobs`);
  }

  if (requestURL.pathname == "/jobs") {
    return fetch("{{{{{ PAGE_URL }}}}}");
  }

  if (requestURL.pathname != "/search") {
    return new Response("Page not found", {
      status: 404,
    });
  }

  const rules = await parse_query(requestURL.searchParams);

  // Don't initialise with all modes as unused modes will break bitwise operations
  /*
   *   {
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
  const word_rules = {};

  let search_words_count = 0;
  let last_search_term;
  for (const {field, terms} of rules) {
    for (const {mode, words} of terms) {
      if (!word_rules[mode]) {
        word_rules[mode] = {};
      }
      if (!word_rules[mode][field]) {
        word_rules[mode][field] = new Set();
      }
      for (const word of words) {
        search_words_count++;
        word_rules[mode][field].add(word);
        last_search_term = {word, field, mode};
      }
    }
  }

  let jobs;
  let overflow = false;

  if (!search_words_count) {
    jobs = await get_jobs();
    if (jobs.length > MAX_RESULTS) {
      overflow = true;
      jobs = jobs.slice(0, MAX_RESULTS);
    }
  } else {
    let filtered;

    if (search_words_count == 1) {
      filtered = (await get_filters())[last_search_term.field][last_search_term.word];
      if (last_search_term.mode == "exclude") {
        filtered = typedarray_not(filtered);
      }
    } else {
      filtered = [];

      // Don't use MODES as unused modes will break bitwise operations
      for (const mode of Object.keys(word_rules)) {
        const mode_source_bufs = [];
        for (const field of Object.keys(word_rules[mode])) {
          for (const word of word_rules[mode][field]) {
            mode_source_bufs.push((await get_filters())[field][word]);
          }
        }

        let result_buf;
        switch (mode) {
        case "require":
          result_buf = typedarray_and(mode_source_bufs);
          break;
        case "contain":
          result_buf = typedarray_or(mode_source_bufs);
          break;
        case "exclude":
          result_buf = typedarray_i_not(typedarray_or(mode_source_bufs));
          break;
        }
        filtered.push(result_buf);
      }

      if (filtered.length > 1) {
        filtered = typedarray_i_and(filtered);
      } else {
        [filtered] = filtered;
      }
    }

    jobs = [];
    for (let idx = 0; idx < filtered.length; idx++) {
      let anchor = idx * FILTER_BITS_PER_ELEM;
      let byte = filtered[idx];
      let done = false;
      for (let bit = 0; byte; bit++) {
        if (byte & FILTER_MSB_MASK) {
          const job = (await get_jobs())[anchor + bit];
          if (
            // Reached extra padding bits at end
            !job ||
            (overflow = jobs.length >= MAX_RESULTS)
          ) {
            done = true;
            break;
          }
          jobs.push(job);
        }
        byte <<= 1;
      }
      if (done) {
        break;
      }
    }
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
