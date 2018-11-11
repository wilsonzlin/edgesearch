"use strict";

(() => {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const $pane = $("#pane");
  const $pane_open_button = $("#pane-open-button");
  $pane_open_button.addEventListener("click", () => {
    $pane.classList.add("pane-open");
  });
  const $pane_close_button = $("#pane-close-button");
  $pane_close_button.addEventListener("click", () => {
    $pane.classList.remove("pane-open");
  });

  const $search_terms = $("#search-terms");
  const $search_terms_add_button = $("#search-terms-add-button");
  const $template_search_term = $("#template-search-term");
  $search_terms_add_button.addEventListener("click", () => {
    $search_terms.appendChild($template_search_term.content.cloneNode(true));
  });

  for (const $select of $$("select[data-value]")) {
    $select.value = $select.dataset.value;
  }

  for (const $toggle of $$(".toggle")) {
    const input = document.createElement("input");
    // Don't use checkbox as it won't send anything if unchecked
    input.type = "hidden";
    input.name = $toggle.dataset.name;
    input.value = $toggle.dataset.checked || false;
    // Since this is initial run, only check initially if data-checked provided as "true"
    $toggle.classList.toggle("checked", input.value === "true");
    $toggle.appendChild(input);
    $toggle.addEventListener("click", () => {
      $toggle.classList.toggle("checked");
      input.value = $toggle.classList.contains("checked");
    });
  }

  for (const $button of $$(".search-term-button")) {
    $button.addEventListener("click", () => {
      switch ($button.value) {
      case "delete":
        $button.parentNode.parentNode.remove();
        break;
      }
    });
  }

  Sortable.create($search_terms, {
    handle: ".search-term-drag",
    ghostClass: "search-term-dragging",
  });

  const $header_logo = $("#header-logo");
  const $$header_logo_quads = [
    [$("#ms-logo-nw"), "#f24f1c"],
    [$("#ms-logo-ne"), "#80bb00"],
    [$("#ms-logo-sw"), "#00a6f0"],
    [$("#ms-logo-se"), "#ffba00"],
  ];
  const $header_text_date = $("#header-text-date");
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
      translateX: [-(no * 40)],
      opacity: 0,
      delay: 450 + (no * 50),
    })),
    animate($header_logo, {
      opacity: 1,
      delay: 750,
    }),
    ...$$header_logo_quads.map(([$quad, to], no) => animate($quad, {
      backgroundColor: ["#fff", to],
      delay: 1000 + (no * 50),
    })),
  ]).then(() => animate($header_text_date, {
    opacity: 1,
  })).then(() => animate($header_text_date, {
    width: 0,
    delay: 2000,
  })).then(() => $header_text_date.remove()).then(() => animate($header_text_name, {
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
