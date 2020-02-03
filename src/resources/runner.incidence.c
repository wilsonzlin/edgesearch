bitset_elem_t incidence_matrix[BITSETS_COUNT][BITSET_ELEMS_LENGTH] = __INCIDENCE_MATRIX_INITIALISER;

void incidence_sublist_handler(mode_t mode, fieldword_idx_t const* start, size_t count) {
	bitset_query(incidence_matrix, mode, start, count);
}

results_t* search(void) {
  return bitset_search_template(&incidence_sublist_handler);
}
