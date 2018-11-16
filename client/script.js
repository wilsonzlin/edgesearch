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
   *  EXTERNAL VARIABLES
   *
   */

  const msc_description = "{__VAR_DESCRIPTION}";
  const msc_extract_words_fn = {__VAR_EXTRACT_WORDS_FN};
  const msc_valid_word_regex = {__VAR_VALID_WORD_REGEX};

  /*
   *
   *  DOM
   *
   */

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

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

    const autocomplete_focus_entry = idx => {
      if (entry_focus != undefined) {
        $$entries[entry_focus].classList.remove("autocomplete-entry-focus");
      }
      entry_focus = idx;
      if (idx != undefined) {
        $$entries[idx].classList.add("autocomplete-entry-focus");
      }
    };

    const autocomplete_use_focused_entry = () => {
      const value = $$entries[entry_focus].textContent;
      $input.value = $input.value.slice(0, last_selection_start) +
                     value +
                     $input.value.slice(last_selection_end + 1);
      const new_cursor = last_selection_start + value.length;
      $input.focus();
      $input.setSelectionRange(new_cursor, new_cursor);
      autocomplete_empty_list();
    };

    const autocomplete_append_entry = value => {
      const $li = import_template($template_autocomplete_entry);
      $li.textContent = value;
      $list.appendChild($li);
      const id = $$entries.push($li) - 1;

      $li.addEventListener("click", autocomplete_use_focused_entry);

      $li.addEventListener("mouseover", () => {
        autocomplete_focus_entry(id);
      });
      $li.addEventListener("mouseout", () => {
        autocomplete_focus_entry(undefined);
      });
    };

    const autocomplete_empty_list = () => {
      let $li;
      while ($li = $$entries.pop()) {
        $li.remove();
      }
      entry_focus = undefined;
    };

    const autocomplete_sanitise = () => {
      $input.value = msc_extract_words_fn($input.value).join(" ");
    };
    autocomplete_sanitise();

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
          autocomplete_focus_entry(new_id);
          break;
        case 9: // Tab
        case 13: // Enter
          if (entry_focus == undefined) {
            autocomplete_empty_list();
          } else {
            // Prevent submitting form
            e.preventDefault();
            autocomplete_use_focused_entry();
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
    $input.addEventListener("paste", () => setTimeout(autocomplete_sanitise, 100));
    $input.addEventListener("input", () => {
      clearTimeout(search_timeout);
      // Necessary to invalidate previous fetch requests (see below)
      search_timeout = undefined;

      autocomplete_empty_list();
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
      if (!term) {
        return;
      }

      last_selection_start = start;
      last_selection_end = end;

      // Cache $search_timeout locally so that when results come back,
      // we will know if another search has already been made and therefore
      // these results are stale
      const this_search_timeout = search_timeout = setTimeout(() => {
        fetch(`/autocomplete?f=${$auto.dataset.field}&t=${encodeURIComponent(term)}`)
          .then(res => res.json())
          .then(results => {
            if (search_timeout !== this_search_timeout) {
              // This request is stale
              return;
            }
            for (const res of results) {
              autocomplete_append_entry(res);
            }
          })
          .catch(err => {
            // TODO
          });
      }, 0 /* Debounce rate */);
    });

    return {
      set_value: val => {
        $input.value = val;
        autocomplete_sanitise();
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
   *  FORM BUTTONS
   *
   */

  const $template_search_term = $("#template-search-term");
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

  const $$share_links = $$("[data-service]");
  const $share_URL = $("#share-URL");
  const update_title_or_url = (url, title) => {
    if (url) {
      try {
        ga("set", "page", `${location.pathname}${location.search}${location.hash}`);
        ga("send", "pageview");
      } catch (_) {
      }
      history.pushState(null, undefined, url);
    }
    if (title) {
      document.title = title;
    }

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

  const search = () => {
      // NOTE: Don't rerender or normalise form on submit, as user might be
      // in middle of typing or quickly switching terms
      // { mode: { field: Set() } }
      const terms = {};

      // Always query for latest set of .search-term elements
      // Only find in form to avoid finding in templates on unsupported browsers
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

        if (!terms[mode]) {
          terms[mode] = {};
        }
        if (!terms[mode][field]) {
          terms[mode][field] = new Set();
        }
        for (const w of words) {
          terms[mode][field].add(w);
        }

        // Replace `%20` with nicer looking `+`
        return `${prefix}${field}:${encodeURIComponent(words).replace(/%20/g, "+")}`;
      }).filter(w => w).join("|");

      const query_parts = [];
      for (const mode of Object.keys(terms).sort()) {
        for (const field of Object.keys(terms[mode]).sort()) {
          for (const word of Array.from(terms[mode][field]).sort()) {
            // Mode and field should be URL safe; word should be too but encode just to be sure
            query_parts.push(`${mode}_${field}_${encodeURIComponent(word)}`);
          }
        }
      }
      const query = `?q=${query_parts.join("&")}`;

      update_title_or_url(`${location.pathname}${hash.length == 1 ? "" : hash}`, "Work @ Microsoft");
      $jobs_heading.textContent = "Searching";
      for (const $job of $$(".job", $jobs)) {
        $job.remove();
      }
      $filter_form_submit.disabled = true;

      fetch(`/search${query}`)
        .then(res => res.json())
        .then(({jobs, overflow}) => {
          const count = `${jobs.length}${overflow ? "+" : ""}`;
          const title = `${jobs.length == 1 ? "1 result" : `${count} results`} | Work @ Microsoft`;
          const heading = jobs.length == 1 ? "1 match" : `${count} matches`;

          update_title_or_url(false, title);
          $jobs_heading.textContent = heading;

          for (const job of jobs) {
            const $job = import_template($template_job);
            $(".job-title-link", $job).textContent = job.title;
            $(".job-title-link", $job).href = `https://careers.microsoft.com/us/en/job/${job.ID}`;
            $(".job-location", $job).textContent = job.location;
            $(".job-description", $job).innerHTML = job.description;
            const [year, month, day] = job.date.split("-").map(v => Number.parseInt(v, 10));
            $(".job-date", $job).textContent = [MONTHS[month - 1], day, year].join(" ");
            $(".job-date", $job).dateTime = `${year}-${month}-${day}T00:00:00.000Z`;
            $jobs.appendChild($job);
          }
        })
        .catch(err => {
          // TODO
          const title = `0 results | Work @ Microsoft`;
          const heading = `0 matches`;

          update_title_or_url(false, title);
          $jobs_heading.textContent = heading;
        })
        .then(() => {
          $filter_form_submit.disabled = false;
        });
    }
  ;

  $filter_form.addEventListener("submit", e => {
    e.preventDefault();
    search();
  });

  /*
   *
   *  URL
   *
   */

  const parse_hash = () => {
    /*
     *  {
     *    field: [
     *      {
     *        mode: "require",
     *        words: ["a", "b"],
     *      },
     *    ],
     *  }
     */
    let parsed = {};

    for (const part of decodeURIComponent(location.hash.slice(1).replace(/\+/g, "%20")).split("|")) {
      const mode = /^!/.test(part) ? "3" :
                   /^~/.test(part) ? "2" :
                   "1";

      const [field, words_raw] = part.slice(mode != "1").split(":", 2);

      // TODO Validate field

      const words = msc_extract_words_fn(words_raw || "");
      if (words.length) {
        if (!parsed[field]) {
          parsed[field] = [];
        }
        parsed[field].push({mode, words});
      }
    }

    for (const field of Object.keys(parsed)) {
      for (const term of parsed[field]) {
        new_search_term(field, term.mode, term.words);
      }
    }
  };

  parse_hash();
  search();

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
