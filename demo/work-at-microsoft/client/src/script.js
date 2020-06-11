'use strict';

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
   * CLIENT
   *
   */

  const client = new Edgesearch.Client('https://work-at-microsoft.wlin.workers.dev');
  const msc_fields = new Set(['title', 'location', 'description']);
  const msc_extract_words_fn = query => query.split(/\s+/).filter(w => w).map(w => w.toLowerCase());

  /*
   *
   *  AUTOCOMPLETE
   *
   */

  const $template_autocomplete_entry = $('#template-autocomplete-entry');
  const autocomplete_init = $auto => {
    const $list = $('.autocomplete-list', $auto);

    const $input = $('.autocomplete-input', $auto);
    let last_selection_start;
    let last_selection_end;

    const $$entries = [];
    let entry_focus;

    let search_timeout;

    const focus_entry = idx => {
      if (entry_focus != undefined) {
        $$entries[entry_focus].classList.remove('autocomplete-entry-focus');
      }
      entry_focus = idx;
      if (idx != undefined) {
        $$entries[idx].classList.add('autocomplete-entry-focus');
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

      $li.addEventListener('click', use_focused_entry);

      $li.addEventListener('mouseover', () => {
        focus_entry(id);
      });
      $li.addEventListener('mouseout', () => {
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
      $input.value = msc_extract_words_fn($input.value).join(' ');
    };
    sanitise();

    $input.addEventListener('keydown', e => {
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

    // Don't clean on "change" as that will break autocomplete insertion
    $input.addEventListener('paste', () => setTimeout(sanitise, 100));
    $input.addEventListener('input', () => {
      clearTimeout(search_timeout);
      // Necessary to invalidate previous fetch requests (see below)
      search_timeout = undefined;

      empty_list();
      const pos = $input.selectionStart - 1; // val[pos] == new_char
      const val = $input.value;

      if (val[pos] == ' ') {
        return;
      }

      let start = pos;
      while (start > 0 && val[start - 1] != ' ') {
        start--;
      }

      let end = pos;
      while (end < val.length - 1 && val[end + 1] != ' ') {
        end++;
      }

      // val[start, end] == word (NOT [start, end)]
      const term = val.slice(start, end + 1);

      last_selection_start = start;
      last_selection_end = end;

      // Cache $search_timeout locally so that when results come back,
      // we will know if another search has already been made and therefore
      // these results are stale
      const this_search_timeout = search_timeout = setTimeout(() => {
        /* TODO
        client.autocomplete($auto.dataset.field, term).then(results => {
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
       */
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

  const $pane = $('#pane');
  const $pane_toggle_button = $('#pane-toggle-button');
  $pane_toggle_button.addEventListener('click', () => {
    $pane.classList.toggle('pane-open');
  });

  /*
   *
   *  SEARCH TERMS
   *
   */

  const $template_search_term = $('#template-search-term');

  const clear_search_terms = () => {
    for (const $term of $$('.search-term', $filter_form)) {
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
      $('.search-term-mode', $new).value = mode;
    }

    const $autocomplete = $('.search-term-words', $new);
    $autocomplete.dataset.field = field;
    const {set_value} = autocomplete_init($autocomplete);
    if (words) {
      set_value(words);
    }

    $('.search-term-button', $new).addEventListener('click', () => {
      $new.remove();
    });
  };

  // Don't use capture event listener as it is buggy and slow
  for (const $button of $$('.search-category-button')) {
    $button.addEventListener('click', () => {
      const field = $button.dataset.field;
      new_search_term(field);
    });
  }

  /*
   *
   *  SHARING
   *
   */

  const $$share_links = $$('[data-service]');
  const $share_URL = $('#share-URL');
  const reflect_url = () => {
    $share_URL.value = location.href;
    let ue_title = encodeURIComponent(document.title);
    let ue_url = encodeURIComponent(location.href);
    let ue_hostname = encodeURIComponent(location.hostname);
    let ue_description = encodeURIComponent('Explore Microsoft careers');

    for (const $link of $$share_links) {
      $link.href = {
        LinkedIn: `https://www.linkedin.com/shareArticle?mini=true&url=${ue_url}&title=${ue_title}&summary=${ue_description}&source=${ue_hostname}`,
        Facebook: `https://www.facebook.com/sharer/sharer.php?u=${ue_url}`,
        Twitter: `https://twitter.com/home?status=${ue_title}%20${ue_url}`,
        Email: `mailto:?&subject=${ue_title}&body=${ue_title}%0A${ue_url}`,
      }[$link.dataset.service];
    }
  };

  const $template_job = $('#template-job');
  const $jobs_list = $('#jobs-list');
  const $jobs_next_page = $('#jobs-next-page');
  const $filter_form = $('#filter-form');
  const $filter_form_submit = $('#filter-form-submit');
  const $jobs_heading = $('#jobs-heading');
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const left_pad = (s, n, p = '0') => {
    s = `${s}`;
    const delta = n - s.length;
    if (delta <= 0) {
      return s;
    }
    // String.prototype.repeat not compatible with IE 11
    return `${Array(delta + 1).join(p)}${s}`;
  };

  const set_title_and_heading = (title, heading) => {
    // TODO Abstract title suffix
    document.title = `${title ? `${title} | ` : ''}Work @ Microsoft`;
    $jobs_heading.textContent = heading;
  };

  // It's possible to have concurrent searches when using the Back and Forward history buttons,
  // as well as hitting Enter to submit form
  let current_request_no = 0;
  let next_continuation;
  const search = query => {
    const request_no = ++current_request_no;
    next_continuation = undefined;

    set_title_and_heading(undefined, 'Searching');
    $jobs_list.innerHTML = '';
    $jobs_next_page.disabled = true;
    $filter_form_submit.disabled = true;

    client.search(query).then(data => {
      if (current_request_no !== request_no) {
        // Stale results
        return;
      }

      $filter_form_submit.disabled = false;

      if (!data) {
        set_title_and_heading('Error', 'Something went wrong');
        return;
      }

      const {results: jobs, continuation, total: count} = data;
      next_continuation = continuation;
      if (next_continuation) {
        $jobs_next_page.disabled = false;
      }

      const plural = count != 1;
      const title = `${count} result${plural ? 's' : ''}`;
      const heading = `${count} match${plural ? 'es' : ''}`;

      set_title_and_heading(title, heading);

      for (const job of jobs) {
        const $job = import_template($template_job);
        $('.job-title-link', $job).textContent = job.title;
        $('.job-title-link', $job).href = job.url;
        $('.job-location', $job).textContent = job.location;
        $('.job-description', $job).textContent = job.description;
        const [year, month, day] = job.date.split('-').map(v => Number.parseInt(v, 10));
        $('.job-date', $job).textContent = [MONTHS[month - 1], day, year].join(' ');
        $('.job-date', $job).dateTime = `${year}-${left_pad(month, 2)}-${left_pad(day, 2)}T00:00:00.000Z`;
        $jobs_list.appendChild($job);
      }
    });
  };

  $jobs_next_page.addEventListener('click', () => {
    location.hash = location.hash
        .replace(/\|?from:\d+/g, '')
      + '|from:' + next_continuation;
  });

  const handle_form = e => {
    // NOTE: Don't rerender or normalise form on submit, as user might be
    // in middle of typing or quickly switching terms
    e.preventDefault();

    // Always query for latest set of .search-term elements
    // Only find in form to avoid finding in templates on unsupported browsers
    const query = new Edgesearch.Query();
    const hash = '#' + $$('.search-term', $filter_form).map($term => {
      const mode = $term.children[0].value;
      const field = $term.dataset.field;
      const prefix = {
        '0': '',
        '1': '~',
        '2': '!',
      }[mode];
      const words = msc_extract_words_fn($term.children[1].children[0].value);
      if (!words.length) {
        return null;
      }

      query.add(mode, ...words.map(w => [field, w].join('_')));

      // Replace `%20` with nicer looking `+`
      return `${prefix}${field}:${encodeURIComponent(words.join(' ')).replace(/%20/g, '+')}`;
    }).filter(w => w).join('|');

    history.pushState(null, undefined, hash);
    reflect_url();
    search(query);
  };

  $filter_form.addEventListener('submit', handle_form);

  /*
   *
   *  HASH
   *
   */

  const handle_hash = () => {
    reflect_url();
    clear_search_terms();
    const query = new Edgesearch.Query();

    for (const part_raw of location.hash.slice(1).split('|').filter(p => p)) {
      const [_, mode_sign, field, terms_raw] = /^([!~]?)([a-z]+):(.*)$/.exec(part_raw);
      const mode = {
        '!': '2',
        '~': '1',
      }[mode_sign] || '0';

      const terms_joined = decodeURIComponent(terms_raw.replace(/\+/g, '%20'));

      if (field == 'from') {
        query.setContinuation(Number.parseInt(terms_joined, 10));
        continue;
      }

      if (!msc_fields.has(field)) {
        continue;
      }

      const terms = msc_extract_words_fn(terms_joined);
      if (!terms.length) {
        continue;
      }

      query.add(mode, ...terms.map(term => [field, term].join('_')));
      new_search_term(field, mode, terms);
    }

    search(query);
  };

  window.addEventListener('popstate', handle_hash);
  handle_hash();

  /*
   *
   *  SHARING
   *
   */

  new ClipboardJS('#share-copy-button');

  /*
   *
   *  ANIMATIONS
   *
   */

  const $header_logo = $('#header-logo');
  const $$header_logo_quads = [
    [$('#ms-logo-nw'), '#f24f1c'],
    [$('#ms-logo-ne'), '#80bb00'],
    [$('#ms-logo-se'), '#ffba00'],
    [$('#ms-logo-sw'), '#00a6f0'],
  ];
  const $header_text = $('#header-text');
  const $header_brands = $('#header-brands');
  const $$header_brand_icons = $$('li', $header_brands);

  const animate = (target, opts) =>
    anime({
      targets: target,
      duration: 1000,
      easing: 'easeOutCubic',
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
      backgroundColor: ['#fff', to],
      delay: INIT_DELAY + 950 + (no * 100),
    })),
  ]).then(() => animate($header_text, {
    width: '100%',
  })).then(() => {
    $header_brands.classList.remove('header-brands-init');
  }).then(() => Promise.all($$header_brand_icons.map(($icon, no) => animate($icon, {
    translateY: ['-100%', 0],
    opacity: 1,
    delay: no * 100,
  }))));
})();
