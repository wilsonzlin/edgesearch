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

  for (const $select of $$("[data-value]")) {
    $select.value = $select.dataset.value;
  }

  Sortable.create($search_terms, {
    handle: ".search-term-drag",
    ghostClass: "search-term-dragging",
  });
})();
