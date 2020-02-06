typedef struct {
  uint64_t bits;
  uint8_t hashes;
  bitset_elem_t const matrix[BITS_COUNT][BITSET_ELEMS_LENGTH];
} bloom_t;

bloom_t bloom = __BLOOM_INITIALISER;

// MAX_QUERY_BYTES must be at least `bloom.hashes`.
// MAX_QUERY_BYTES is probably way too excessive, considering the max is really how many words per mode, but it's safe.
uint64_t bit_idxes_working[MAX_QUERY_BYTES];
bitset_elem_t bloom_AND_working[BITSET_ELEMS_LENGTH];
bitset_elem_t bloom_OR_working[BITSET_ELEMS_LENGTH];
bitset_elem_t bloom_result[BITSET_ELEMS_LENGTH];

// Performs AND on one or more bit sets and stores the result in `bloom_AND_working`.
// {@param bitset_indices} should be sorted ascending.
// {@param bitset_indices_count} must not be zero.
inline void bloom_and(uint64_t const* bitset_indices, size_t bitset_indices_count) {
  // Copy first bit set to working area.
  bitset_copy(bloom.matrix[bitset_indices[0]], bloom_AND_working);
  for (size_t i = 1; i < bitset_indices_count; i++) {
    uint64_t idx = bitset_indices[i];
    if (idx == bitset_indices[i - 1]) {
      continue;
    }
    // TODO Possible optimisation: reduce range of bit set operated upon to [first nonzero byte, last nonzero byte] if AND.
    bool nonzero = bitset_op_and(bloom_AND_working, bloom.matrix[idx]);
    if (!nonzero) {
      break;
    }
  }
}


// {@param words} is multiple null-terminated char[], terminated by '\0'.
// For example: {'h', 'e', 'l', 'l', 'o', '\0', 'w', 'o', 'r', 'l', 'd', '\0', '\0'}.
byte const* bloom_query_mode(mode_t mode, byte const* words) {
  bool require = mode == REQUIRE;
  size_t bits_count = 0;
  byte const* next_word = words;
  bool copied_to_working = false;
  while (*next_word) {
    size_t word_len = strlen((char const*) next_word);
    uint64_t a, b;
    murmur3_x64_128(next_word, word_len, 0, &a, &b);
    next_word = &next_word[word_len + 1];

    for (uint8_t i = 0; i < bloom.hashes; i++) {
      uint64_t bit = (a + i * b) % bloom.bits;
      if (require) {
        bit_idxes_working[bits_count] = bit;
        bits_count++;
      } else {
        bit_idxes_working[i] = bit;
      }
    }

    if (!require) {
      bloom_and(bit_idxes_working, bloom.hashes);
      if (!copied_to_working) {
        bitset_copy(bloom_AND_working, bloom_OR_working);
        copied_to_working = true;
      } else {
        bitset_op_or(bloom_OR_working, bloom_AND_working);
      }
    }
  }

  switch (mode) {
  case REQUIRE:
    // Sort so that duplicate indices can be avoided.
    quicksort(bit_idxes_working, 0, bits_count - 1);
    // Run AND on all bit sets with indices referenced in `bit_idxes_working`. Result is stored in `bloom_AND_working`.
    bloom_and(bit_idxes_working, bits_count);
    // Since REQUIRE is the first mode, initialise `bloom_result` with result of AND from `bloom_AND_working`.
    bitset_copy(bloom_AND_working, bloom_result);
    break;

  case EXCLUDE:
    bitset_op_not(bloom_OR_working);
    // Fall through.
  case CONTAIN:
    // Since this mode is not the first (which is REQUIRE), `bloom_result` has already been initialised.
    // Therefore, AND it with the results of this mode.
    bitset_op_and(bloom_result, bloom_OR_working);
    break;
  }

  return &next_word[1];
}

results_t* search(void) {
  mode_t mode = REQUIRE;

  byte const* next_word = query->words;
	while (mode < 3) {
	  next_word = bloom_query_mode(mode, next_word);
    mode++;
  }

	results_t* results = malloc(sizeof(results_t));
  // Get up to MAX_RESULTS + 1 so that overflow is detectable.
  // For example, if MAX_RESULTS is 200, then returning 201 results means that the actual amount of results could be 201, 202, 250, or 1 million, but is definitely > 200.
  size_t results_count = bitset_collect_results(bloom_result, results->documents, MAX_RESULTS + 1);
  results->count = (uint8_t) results_count;
  results->more = results_count == MAX_RESULTS + 1;

	return results;
}
