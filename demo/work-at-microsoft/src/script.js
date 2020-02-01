"use strict";

(() => {
  /*
   *  COMPATIBILITY
   */
  const COMPAT_TEMPLATE = !!window.HTMLTemplateElement;
  const import_template = $template => (COMPAT_TEMPLATE ? $template.content : $template).cloneNode(true).children[0];
  if (!HTMLElement.prototype.remove) {
    HTMLElement.prototype.remove = function () {
      this.parentNode.removeChild(this);
    };
  }
  if (!Object.assign) {
    Object.assign = function () {
      const dest = arguments[0];
      for (let i = 1; i < arguments.length; i++) {
        const src = arguments[i];
        for (const key of Object.keys(src)) {
          dest[key] = src[key];
        }
      }
      return dest;
    };
  }
  if (!Array.from) {
    Array.from = src => Array.prototype.slice.call(src);
  }
  if (!Number.parseInt) {
    Number.parseInt = parseInt;
  }

  /*
   *
   *  DOM
   *
   */

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /*
   *
   *  HTTP
   *
   */

  const http_get = (url, callback) => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        const status = xhr.status;
        if (status === 200) {
          callback(JSON.parse(xhr.responseText));
        } else {
          callback();
        }
      }
    };
    xhr.open("GET", url);
    xhr.send();
  };

  /*
   *
   *  AUTOCOMPLETE
   *
   */

  const $template_autocomplete_entry = $("#template-autocomplete-entry");
  const autocomplete_init = $auto => {
    const $list = $(".autocomplete-list", $auto);

    const $input = $(".autocomplete-input", $auto);
    let last_selection_start;
    let last_selection_end;

    const $$entries = [];
    let entry_focus;

    let search_timeout;

    const focus_entry = idx => {
      if (entry_focus != undefined) {
        $$entries[entry_focus].classList.remove("autocomplete-entry-focus");
      }
      entry_focus = idx;
      if (idx != undefined) {
        $$entries[idx].classList.add("autocomplete-entry-focus");
      }
    };

    const use_focused_entry = () => {
      const value = $$entries[entry_focus].textContent;
      $input.value = $input.value.slice(0, last_selection_start) +
                     value +
                     $input.value.slice(last_selection_end + 1);
      const new_cursor = last_selection_start + value.length;
      $input.focus();
      $input.setSelectionRange(new_cursor, new_cursor);
      empty_list();
    };

    const append_entry = value => {
      const $li = import_template($template_autocomplete_entry);
      $li.textContent = value;
      $list.appendChild($li);
      const id = $$entries.push($li) - 1;

      $li.addEventListener("click", use_focused_entry);

      $li.addEventListener("mouseover", () => {
        focus_entry(id);
      });
      $li.addEventListener("mouseout", () => {
        focus_entry(undefined);
      });
    };

    const empty_list = () => {
      let $li;
      while ($li = $$entries.pop()) {
        $li.remove();
      }
      entry_focus = undefined;
    };

    const sanitise = () => {
      $input.value = msc_extract_words_fn($input.value).join(" ");
    };
    sanitise();

    $input.addEventListener("keydown", e => {
      const key = e.keyCode;
      if ($$entries.length) {
        switch (key) {
        case 38: // Up
        case 40: // Down
          const dir = key - 39;
          let new_id;
          if (entry_focus == undefined) {
            new_id = dir == -1 ? $$entries.length - 1 : 0;
          } else {
            new_id = ((entry_focus || $$entries.length) + dir) % $$entries.length;
          }
          focus_entry(new_id);
          break;
        case 9: // Tab
        case 13: // Enter
          if (entry_focus == undefined) {
            empty_list();
          } else {
            // Prevent submitting form
            e.preventDefault();
            use_focused_entry();
          }
          break;
        }
      }
    });

    $input.addEventListener("keypress", e => {
      const key = e.key.toLowerCase();
      // Don't try to control spaces, as it makes it difficult to split and insert words at weird places
      if (key != " " &&
          !msc_valid_word_regex.test(key)) {
        e.preventDefault();
      }
    });
    // Don't clean on "change" as that will break autocomplete insertion
    $input.addEventListener("paste", () => setTimeout(sanitise, 100));
    $input.addEventListener("input", () => {
      clearTimeout(search_timeout);
      // Necessary to invalidate previous fetch requests (see below)
      search_timeout = undefined;

      empty_list();
      const pos = $input.selectionStart - 1; // val[pos] == new_char
      const val = $input.value;

      if (val[pos] == " ") {
        return;
      }

      let start = pos;
      while (start > 0 && val[start - 1] != " ") {
        start--;
      }

      let end = pos;
      while (end < val.length - 1 && val[end + 1] != " ") {
        end++;
      }

      // val[start, end] == word (NOT [start, end)]
      const term = val.slice(start, end + 1);
      if (!msc_valid_word_regex.test(term)) {
        return;
      }

      last_selection_start = start;
      last_selection_end = end;

      // Cache $search_timeout locally so that when results come back,
      // we will know if another search has already been made and therefore
      // these results are stale
      const this_search_timeout = search_timeout = setTimeout(() => {
        http_get(`/autocomplete?f=${$auto.dataset.field}&t=${encodeURIComponent(term)}`, results => {
          if (search_timeout !== this_search_timeout) {
            // This request is stale
            return;
          }

          if (!results) {
            // TODO
            return;
          }

          for (const res of results) {
            append_entry(res);
          }
        });
      }, 0 /* Debounce rate */);
    });

    return {
      set_value: val => {
        $input.value = val;
        sanitise();
      },
    };
  };

  /*
   *
   *  PANE
   *
   */

  const $pane = $("#pane");
  const $pane_toggle_button = $("#pane-toggle-button");
  $pane_toggle_button.addEventListener("click", () => {
    $pane.classList.toggle("pane-open");
  });

  /*
   *
   *  SEARCH TERMS
   *
   */

  const $template_search_term = $("#template-search-term");

  const clear_search_terms = () => {
    for (const $term of $$(".search-term", $filter_form)) {
      $term.remove();
    }
  };

  const new_search_term = (field, mode, words) => {
    const $target = $(`.search-terms[data-field="${field}"]`);
    if (!$target) {
      return null;
    }

    const $new = import_template($template_search_term);
    $new.dataset.field = field;
    $target.appendChild($new);

    if (mode) {
      $(".search-term-mode", $new).value = mode;
    }

    const $autocomplete = $(".search-term-words", $new);
    $autocomplete.dataset.field = field;
    const {set_value} = autocomplete_init($autocomplete);
    if (words) {
      set_value(words);
    }

    $(".search-term-button", $new).addEventListener("click", () => {
      $new.remove();
    });
  };

  // Don't use capture event listener as it is buggy and slow
  for (const $button of $$(".search-category-button")) {
    $button.addEventListener("click", () => {
      const field = $button.dataset.field;
      new_search_term(field);
    });
  }

  /*
   *
   *  SHARING
   *
   */

  const $$share_links = $$("[data-service]");
  const $share_URL = $("#share-URL");
  const reflect_url = () => {
    $share_URL.value = location.href;
    let ue_title = encodeURIComponent(document.title);
    let ue_url = encodeURIComponent(location.href);
    let ue_hostname = encodeURIComponent(location.hostname);
    let ue_description = encodeURIComponent(msc_description);

    for (const $link of $$share_links) {
      $link.href = {
        LinkedIn: `https://www.linkedin.com/shareArticle?mini=true&url=${ue_url}&title=${ue_title}&summary=${ue_description}&source=${ue_hostname}`,
        Facebook: `https://www.facebook.com/sharer/sharer.php?u=${ue_url}`,
        Twitter: `https://twitter.com/home?status=${ue_title}%20${ue_url}`,
        Email: `mailto:?&subject=${ue_title}&body=${ue_title}%0A${ue_url}`,
      }[$link.dataset.service];
    }
  };

  const $template_job = $("#template-job");
  const $jobs = $("#jobs");
  const $filter_form = $("#filter-form");
  const $filter_form_submit = $("#filter-form-submit");
  const $jobs_heading = $("#jobs-heading");
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const left_pad = (s, n, p = "0") => {
    s = `${s}`;
    const delta = n - s.length;
    if (delta <= 0) {
      return s;
    }
    // String.prototype.repeat not compatible with IE 11
    return `${Array(delta + 1).join(p)}${s}`;
  };

  class Query {
    constructor () {
      // { mode: { field: Set() } }
      this.terms = {};
    }

    add (mode, field, words) {
      const terms = this.terms;
      if (!terms[mode]) {
        terms[mode] = {};
      }
      if (!terms[mode][field]) {
        terms[mode][field] = new Set();
      }
      for (const w of words) {
        terms[mode][field].add(w);
      }
    }

    build () {
      const terms = this.terms;
      const query_parts = [];
      // TODO Abstract modes
      for (const mode of Object.keys(terms).sort()) {
        for (const field of Object.keys(terms[mode]).sort()) {
          for (const word of Array.from(terms[mode][field]).sort()) {
            // Mode and field should be URL safe; word should be too but encode just to be sure
            query_parts.push(encodeURIComponent(`${mode}_${field}_${word}`));
          }
        }
      }
      return `?q=${query_parts.join("&")}`;
    }
  }

  const set_title_and_heading = (title, heading) => {
    // TODO Abstract title suffix
    document.title = `${title ? `${title} | ` : ""}Work @ Microsoft`;
    $jobs_heading.textContent = heading;
  };

  // It's possible to have concurrent searches when using the Back and Forward history buttons,
  // as well as hitting Enter to submit form
  let current_search_query;
  const search = query => {
      const query_string = query.build();
      if (current_search_query === query_string) {
        return;
      }
      current_search_query = query_string;

      set_title_and_heading(undefined, "Searching");
      for (const $job of $$(".job", $jobs)) {
        $job.remove();
      }
      $filter_form_submit.disabled = true;

      http_get(`/search${query_string}`, data => {
        if (current_search_query !== query_string) {
          // Stale results
          return;
        }
        current_search_query = undefined;

        $filter_form_submit.disabled = false;

        if (!data) {
          set_title_and_heading("Error", "Something went wrong");
          return;
        }

        const {jobs, overflow} = data;

        const count = `${jobs.length}${overflow ? "+" : ""}`;
        const plural = jobs.length != 1;
        const title = `${count} result${plural ? "s" : ""}`;
        const heading = `${count} match${plural ? "es" : ""}`;

        set_title_and_heading(title, heading);

        for (const job of jobs) {
          const $job = import_template($template_job);
          $(".job-title-link", $job).textContent = job.title;
          $(".job-title-link", $job).href = `https://careers.microsoft.com/us/en/job/${job.ID}`;
          $(".job-location", $job).textContent = job.location;
          $(".job-description", $job).textContent = job.description;
          const [year, month, day] = job.date.split("-").map(v => Number.parseInt(v, 10));
          $(".job-date", $job).textContent = [MONTHS[month - 1], day, year].join(" ");
          $(".job-date", $job).dateTime = `${year}-${left_pad(month, 2)}-${left_pad(day, 2)}T00:00:00.000Z`;
          $jobs.appendChild($job);
        }
      });
    }
  ;

  const handle_form = e => {
    // NOTE: Don't rerender or normalise form on submit, as user might be
    // in middle of typing or quickly switching terms
    e.preventDefault();

    // Always query for latest set of .search-term elements
    // Only find in form to avoid finding in templates on unsupported browsers
    const query = new Query();
    const hash = "#" + $$(".search-term", $filter_form).map($term => {
      const mode = $term.children[0].value;
      const field = $term.dataset.field;
      const prefix = {
        "1": "",
        "2": "~",
        "3": "!",
      }[mode];
      const words = msc_extract_words_fn($term.children[1].children[0].value);
      if (!words.length) {
        return null;
      }

      query.add(mode, field, words);

      // Replace `%20` with nicer looking `+`
      return `${prefix}${field}:${encodeURIComponent(words.join(" ")).replace(/%20/g, "+")}`;
    }).filter(w => w).join("|");

    history.pushState(null, undefined, hash);
    reflect_url();
    search(query);
  };

  $filter_form.addEventListener("submit", handle_form);

  /*
   *
   *  HASH
   *
   */

  const handle_hash = () => {
    reflect_url();
    clear_search_terms();
    const query = new Query();

    for (const part of decodeURIComponent(location.hash.slice(1).replace(/\+/g, "%20")).split("|")) {
      const mode = /^!/.test(part) ? "3" :
                   /^~/.test(part) ? "2" :
                   "1";

      const [field, words_raw] = part.slice(mode != "1").split(":", 2);

      if (!msc_fields.has(field)) {
        continue;
      }

      const words = msc_extract_words_fn(words_raw || "");
      if (!words.length) {
        continue;
      }

      query.add(mode, field, words);
      new_search_term(field, mode, words);
    }

    search(query);
  };

  window.addEventListener("popstate", handle_hash);
  handle_hash();

  /*
   *
   *  SHARING
   *
   */

  new ClipboardJS("#share-copy-button");

  /*
   *
   *  ANIMATIONS
   *
   */

  const $header_logo = $("#header-logo");
  const $$header_logo_quads = [
    [$("#ms-logo-nw"), "#f24f1c"],
    [$("#ms-logo-ne"), "#80bb00"],
    [$("#ms-logo-se"), "#ffba00"],
    [$("#ms-logo-sw"), "#00a6f0"],
  ];
  const $header_text = $("#header-text");
  const $header_brands = $("#header-brands");
  const $$header_brand_icons = $$("li", $header_brands);

  const animate = (target, opts) =>
    anime({
      targets: target,
      duration: 1000,
      easing: "easeOutCubic",
      ...opts,
    }).finished;

  const INIT_DELAY = 400;

  Promise.all([
    ...$$header_brand_icons.map(($icon, no) => animate($icon, {
      translateX: -(no * 40),
      opacity: 0,
      delay: INIT_DELAY + 450 + (no * 50),
    })),
    animate($header_logo, {
      opacity: 1,
      delay: INIT_DELAY + 750,
    }),
    ...$$header_logo_quads.map(([$quad, to], no) => animate($quad, {
      backgroundColor: ["#fff", to],
      delay: INIT_DELAY + 950 + (no * 100),
    })),
  ]).then(() => animate($header_text, {
    width: "100%",
  })).then(() => {
    $header_brands.classList.remove("header-brands-init");
  }).then(() => Promise.all($$header_brand_icons.map(($icon, no) => animate($icon, {
    translateY: ["-100%", 0],
    opacity: 1,
    delay: no * 100,
  }))));
})();
