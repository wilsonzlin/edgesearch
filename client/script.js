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
   *  AUTOCOMPLETE
   *
   */

  const AUTOCOMPLETE_OPEN_CLASS = "autocomplete-open";
  const $autocomplete_backdrop = $("#autocomplete-backdrop");
  const $autocomplete_done = $("#autocomplete-done");
  const $template_autocomplete_entry = $("#template-autocomplete-entry");
  const $autocomplete_search = $("#autocomplete-search");
  const $autocomplete_list = $("#autocomplete-list");

  let autocomplete_current_control;
  let autocomplete_search_timeout;

  $autocomplete_search.addEventListener("input", () => {
    const term = $autocomplete_search.value.trim();
    const control = autocomplete_current_control;
    autocomplete_clear_list();
    clearTimeout(autocomplete_search_timeout);
    // Need to clear this so $this_request_id validation works
    autocomplete_search_timeout = undefined;
    $autocomplete_backdrop.classList.toggle("autocomplete-loading", !!term);
    if (!term) {
      autocomplete_load_control(control);
      return;
    }
    const this_request_id = autocomplete_search_timeout = setTimeout(() => {
      fetch(`/autocomplete?f=${control.dataset.field}&t=${encodeURIComponent(term)}`)
        .then(res => res.json())
        .then(results => {
          if (autocomplete_search_timeout !== this_request_id) {
            // This request is stale
            return;
          }
          for (const res of results) {
            autocomplete_append_entry(res, autocomplete_has_value(control, res));
          }
          // Don't put in post-.then as this request might be stale
          $autocomplete_backdrop.classList.remove("autocomplete-loading");
        })
        .catch(err => {
          // TODO
        });
    }, 100);
  });

  $autocomplete_done.addEventListener("click", () => {
    $autocomplete_backdrop.classList.remove(AUTOCOMPLETE_OPEN_CLASS);
    autocomplete_current_control.value = autocomplete_get_values(autocomplete_current_control).join(" ");
    autocomplete_current_control = undefined;
  });

  const autocomplete_clear_list = () => {
    for (const $existing of $$(".autocomplete-entry", $autocomplete_list)) {
      $existing.remove();
    }
  };

  const autocomplete_append_entry = (value, checked) => {
    const $entry = import_template($template_autocomplete_entry);
    $autocomplete_list.appendChild($entry);
    $entry.classList.toggle("autocomplete-entry-ticked", !!checked);
    $(".autocomplete-entry-value", $entry).textContent = value;
    $entry.addEventListener("click", () => {
      $entry.classList.toggle("autocomplete-entry-ticked",
        autocomplete_toggle_value(autocomplete_current_control, value));
    });
  };

  const autocomplete_load_control = $control => {
    autocomplete_clear_list();
    for (const val of autocomplete_get_values($control)) {
      autocomplete_append_entry(val, true);
    }
  };

  const autocomplete_values = new WeakMap();
  const autocomplete_control_init = $control => {
    $control.readOnly = true;
    autocomplete_values.set($control, new Set());
    $control.addEventListener("click", () => {
      $autocomplete_search.value = "";
      $autocomplete_backdrop.classList.add(AUTOCOMPLETE_OPEN_CLASS);
      autocomplete_current_control = $control;
      autocomplete_load_control($control);
    });
  };

  const autocomplete_has_value = ($control, test) => {
    return autocomplete_values.get($control).has(test);
  };

  const autocomplete_get_values = $control => {
    return Array.from(autocomplete_values.get($control)).sort();
  };

  const autocomplete_toggle_value = ($control, value) => {
    if (!autocomplete_values.get($control).delete(value)) {
      autocomplete_values.get($control).add(value);
      return true;
    }
    return false;
  };

  const autocomplete_set_values = ($control, values) => {
    autocomplete_values.set($control, new Set(values));
    $control.value = autocomplete_get_values($control).join(" ");
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
    autocomplete_control_init($autocomplete);
    if (words) {
      autocomplete_set_values($autocomplete, words);
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
        ga("send", "pageview", {
          "page": `${location.pathname}${location.search}${location.hash}`,
        });
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
    let ue_description = encodeURIComponent(window.msc_description);

    const shareLinkedIn = `https://www.linkedin.com/shareArticle?mini=true&url=${ue_url}&title=${ue_title}&summary=${ue_description}&source=${ue_hostname}`;
    const shareFacebook = `https://www.facebook.com/sharer/sharer.php?u=${ue_url}`;
    const shareTwitter = `https://twitter.com/home?status=${ue_title}%20${ue_url}`;
    const shareEmail = `mailto:?&subject=${ue_title}&body=${ue_title}%0A${ue_url}`;

    for (const $link of $$share_links) {
      $link.href = {
        "LinkedIn": shareLinkedIn,
        "Facebook": shareFacebook,
        "Twitter": shareTwitter,
        "Email": shareEmail,
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
    // Always query for latest set of .search-term elements
    const parts = $$(".search-term").map($term => {
      const field = $term.dataset.field;
      const prefix = {
        "require": "",
        "contain": "~",
        "exclude": "!",
      }[$term.children[0].value];
      const words = $term.children[1].value.trim();
      // Replace `%20` with nicer looking `+`
      return `${prefix}${field}:${encodeURIComponent(words).replace(/%20/g, "+")}`;
    });

    update_title_or_url(`${location.pathname}${!parts.length ? "" : `#${parts.join("|")}`}`, "Microsoft Careers");
    $jobs_heading.textContent = "Searching";
    for (const $job of $$(".job", $jobs)) {
      $job.remove();
    }
    $filter_form_submit.disabled = true;

    fetch(`/search?q=${parts.join("|")}`)
      .then(res => res.json())
      .then(({jobs, overflow}) => {
        const count = `${jobs.length}${overflow ? "+" : ""}`;
        const title = `${jobs.length == 1 ? "1 result" : `${count} results`} | Microsoft Careers`;
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
        console.error(err);
        // TODO
      })
      .then(() => {
        $filter_form_submit.disabled = false;
      });
  };

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

    for (const part of decodeURIComponent(location.hash.slice(1).replace(/\+/g, "%20")).trim().split("|")) {
      const mode = /^!/.test(part) ? "exclude" :
                   /^~/.test(part) ? "contain" :
                   "require";

      const [field, words_raw] = part.slice(mode != "require").split(":", 2);

      const words = (words_raw || "").replace(/[;:,]/g, " ")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(w => /^[!-z]+$/.test(w));
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
  const $header_text_init = $("#header-text-init");
  const $header_text_name = $("#header-text-name");
  const $header_brands = $("#header-brands");
  const $$header_brand_icons = $$("li", $header_brands);

  const animate = (target, opts) =>
    anime({
      targets: target,
      duration: 1000,
      easing: "easeOutCubic",
      ...opts,
    }).finished;

  Promise.all([
    ...$$header_brand_icons.map(($icon, no) => animate($icon, {
      translateX: -(no * 40),
      opacity: 0,
      delay: 450 + (no * 50),
    })),
    animate($header_logo, {
      opacity: 1,
      delay: 750,
    }),
    ...$$header_logo_quads.map(([$quad, to], no) => animate($quad, {
      backgroundColor: ["#fff", to],
      delay: 950 + (no * 100),
    })),
  ]).then(() => animate($header_text_init, {
    opacity: 1,
  })).then(() => animate($header_text_init, {
    width: 0,
    delay: 2000,
  })).then(() => $header_text_init.remove()).then(() => animate($header_text_name, {
    width: "100%",
    delay: 500,
  })).then(() => {
    $header_brands.classList.remove("header-brands-init");
  }).then(() => Promise.all($$header_brand_icons.map(($icon, no) => animate($icon, {
    translateY: ["-100%", 0],
    opacity: 1,
    delay: no * 100,
  }))));
})();
