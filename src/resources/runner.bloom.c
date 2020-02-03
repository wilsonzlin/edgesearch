typedef struct {
  size_t bits;
  size_t entries;
  bitset_elem_t** matrix;
  uint8_t hashes;
} bloom_t;

bloom_t bloom = __BLOOM_INITIALISER;

inline void bloom_hash_word(byte const* word, size_t word_len, size_t* out_a, size_t* out_b) {
  murmur3_x64_128(word, word.len, 0, out_a, out_b);
}

inline size_t bloom_hash_bit(size_t a, size_t b, uint8_t hash_no) {
  return (a + i * b) % bloom.bits;
}

// MAX_QUERY_BYTES must be at least `bloom.hashes`.
// MAX_QUERY_BYTES is probably way too excessive, considering the max is really how many words per mode, but it's safe.
size_t bit_idxes_working[MAX_QUERY_BYTES];
bitset_elem_t bloom_working[BITSET_ELEMS_LENGTH];

// {@param words} is multiple null-terminated char[], terminated by '\0'.
// For example: {'h', 'e', 'l', 'l', 'o', '\0', 'w', 'o', 'r', 'l', 'd', '\0', '\0'}.
inline byte const* bloom_query(mode_t mode, byte const* words) {
  bool require = mode == REQUIRE;
  size_t bits_count = 0;
  byte const* next_word = words;
  while (*next_word) {
    size_t word_len = strlen(next_word);
    size_t a, b;
    bloom_hash_word(next_word, word_len, &a, &b);
    next_word = &next_word[word_len + 1];

    for (uint8_t i = 0; i < bloom.hashes; i++) {
      size_t bit = bloom_hash_bit(a, b, i);
      if (require) {
        bit_idxes_working[bits_count] = bit;
        bits_count++;
      } else {
        bit_idxes_working[i] = bit;
      }
    }

    if (!require) {
      bitset_query(bloom.matrix, REQUIRE, bit_idxes_working, bloom.hashes);
      if (word_no == 0) {
        bitset_copy(bitset_working, bloom_working);
      } else {
        bitset_op_or(bloom_working, bitset_working);
      }
    }
  }

  switch (mode) {
  case REQUIRE:
    // Sort so that duplicate indices can be avoided.
    quicksort(bit_idxes_working, 0, bits_count - 1);
    // Run AND on all bit sets with indices referenced in `bit_idxes_working`. Result is stored in `bitset_working`.
    bitset_query(bloom.matrix, REQUIRE, bit_idxes_working, bits_count);
    // Since REQUIRE is the first mode, initialise `bloom_result` with result of AND from `bitset_working`.
    bitset_copy(bitset_working, bloom_result);
    break;

  case EXCLUDE:
    bitset_op_not(bloom_working);
    // Fall through.
  case CONTAIN:
    // Since this mode is not the first (which is REQUIRE), `bloom_result` has already been initialise.
    // Therefore, AND it with the results of this mode.
    bitset_op_and(bloom_result, bloom_working);
    break;
  }

  return &next_word[1];
}

bitset_elem_t bloom_result[BITSET_ELEMS_LENGTH];

results_t* search(void) {
  mode_t mode = REQUIRE;

  byte const* next_word = query->words;
	while (mode < 3) {
	  next_word = bloom_query(mode, next_word);
    mode++;
  }

	results_t* results = malloc(sizeof(results_t));
  // Get up to MAX_RESULTS + 1 so that overflow is detectable.
  // For example, if MAX_RESULTS is 200, then returning 201 results means that the actual amount of results could be 201, 202, 250, or 1 million, but is definitely > 200.
  size_t results_count = bitset_collect_results(bloom_result, &results->entries, MAX_RESULTS + 1);
  results->count = (uint8_t) results_count;
  results->more = results_count == MAX_RESULTS + 1;

	return results;
}
