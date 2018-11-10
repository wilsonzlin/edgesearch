"use strict";

(() => {
  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

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

  Sortable.create($search_terms, {
    handle: ".search-term-drag",
    ghostClass: "search-term-dragging",
  });
})();
