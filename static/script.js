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

  const init_toggle = $toggle => {
    const $input = document.createElement("input");
    $toggle.appendChild($input);
    // Don't use checkbox as it won't send anything if unchecked
    $input.type = "hidden";
    $input.name = $toggle.dataset.name;
    set_toggle($toggle, $toggle.dataset.checked);
    $toggle.addEventListener("click", () => {
      set_toggle($toggle, !$toggle.classList.contains("checked"));
    });
  };

  const set_toggle = ($toggle, state) => {
    const $input = $toggle.children[0];
    $input.value = state || false;
    $toggle.classList.toggle("checked", $input.value === "true");
  };

  for (const $toggle of $$(".toggle")) {
    init_toggle($toggle);
  }

  const $$search_category_buttons = $$(".search-category-button");
  const $template_search_term = $("#template-search-term");
  for (const $button of $$search_category_buttons) {
    $button.addEventListener("click", () => {
      const field = $button.dataset.field;
      const $new = $template_search_term.content.cloneNode(true);
      for (const $elem of $$("[name*=\"<FIELD>\"]", $new)) {
        $elem.name = $elem.name.replace(/<FIELD>/g, field);
      }
      $button.parentNode.parentNode.nextElementSibling.appendChild($new);
    });
  }

  for (const $select of $$("select[data-value]")) {
    $select.value = $select.dataset.value;
  }

  window.addEventListener("click", e => {
    if (e.target.classList.contains("search-term-button")) {
      const $button = e.target;
      switch ($button.value) {
      case "delete":
        $button.parentNode.remove();
        break;
      }
    }
  }, true);

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
