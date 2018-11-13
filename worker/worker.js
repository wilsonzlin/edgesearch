"use strict";

(async () => {
  const FIELDS = ["title", "location"];
  const MODES = ["require", "contain", "exclude"];
  const {JOBS, WORD_FILTERS} = await fetch("{{{{{ DATA_URL }}}}}");
  const MAX_RESULTS = 200;

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

  const valid_word = (str, field) => {
    return !!WORD_FILTERS[field][str];
  };

  const parse_query = params => {
    let parsed = FIELDS.map(field => ({
      field: field,
      terms: [],
    }));

    for (const part of (params.q || "").trim().split("|")) {
      const mode = part.startsWith("!") ? "exclude" :
                   part.startsWith("~") ? "contain" :
                   "require";

      const [field, words_raw] = part.slice(mode != "require").split(":", 2);

      if (FIELDS.includes(field)) {
        const words = words_raw.replace(/[;:,]/g, " ")
          .trim()
          .split(/\s+/)
          .filter(w => valid_word(w, field))
          .map(w => w.toLowerCase());
        if (words.length) {
          parsed.find(r => r.field == field).terms.push({mode, words});
        }
      }
    }

    return parsed;
  };

  addEventListener("fetch", ({request, respondWith}) => {
    respondWith(async () => {
      const requestURL = new URL(request.url);
      if (requestURL.pathname == "/") {
        return Response.redirect("/jobs");
      } else if (requestURL.pathname == "/jobs") {
        // TODO
        return fetch();
      } else if (requestURL.pathname != "/search") {
        return new Response("Page not found", {
          status: 404,
        });
      }

      const rules = parse_query(requestURL.search);

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
        jobs = JOBS;
        if (jobs.length > MAX_RESULTS) {
          overflow = true;
          jobs = jobs.slice(0, MAX_RESULTS);
        }
      } else {
        let filtered;

        if (search_words_count == 1) {
          filtered = WORD_FILTERS[last_search_term.field][last_search_term.word];
          if (last_search_term.mode == "exclude") {
            filtered = typedarray_not(filtered);
          }
        } else {
          // Maximum length == MODES.length
          const to_and = Array(MODES.length);

          // Don't use MODES as unused modes will break bitwise operations
          for (const mode of Object.keys(word_rules)) {
            const mode_source_bufs = [];
            for (const field of Object.keys(word_rules[mode])) {
              for (const word of word_rules[mode][field]) {
                mode_source_bufs.push(WORD_FILTERS[field][word]);
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
            to_and.push(result_buf);
          }

          filtered = typedarray_i_and(to_and);
        }

        jobs = [];
        for (let idx = 0; idx < filtered.length; idx++) {
          let anchor = idx * 8;
          let byte = filtered[idx];
          let done = false;
          for (let bit = 0; byte; bit++) {
            if (byte & 128) {
              const job = JOBS[anchor + bit];
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
    });
  });
})();
