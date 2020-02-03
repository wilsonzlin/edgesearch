typedef struct {
  size_t bits;
  size_t entries;
  bitset_elem_t** bf;
  uint8_t hashes;
} bloom_t;

bloom_t bloom = __BLOOM_INITIALISER;

size_t bit_idxes_working[MAX_WORDS];

inline void bloom_hash_word(size_t word_idx, size_t* out_a, size_t* out_b) {
  word_t word = words[word_idx];
  murmur3_x64_128(word.val, word.len, 0, out_a, out_b);
}

inline size_t bloom_hash_bit(size_t a, size_t b, uint8_t hash_no) {
  return (a + i * b) % bloom.bits;
}

// {@param words_count} must not be zero.
void bloom_query_require(fieldword_idx_t const* word_indices, size_t words_count) {
  size_t bits_count = 0;
  for (size_t word_no = 0; word_no < words_count; word_no++) {
    size_t a, b;
    bloom_hash_word(word_indices[word_no], &a, &b);

    for (uint8_t i = 0; i < bloom.hashes; i++) {
      size_t bit = bloom_hash_bit(a, b, i);
      bit_idxes_working[bits_count] = bit;
      bits_count++;
    }
  }

  // Sort so that duplicate indices can be avoided.
  quicksort(bit_idxes_working, 0, bits_count - 1);
  bitset_query(bloom.bf, REQUIRE, bit_idxes_working, bits_count);
}

bitset_elem_t bloom_working[BITSET_ELEMS_LENGTH];

// {@param words_count} must not be zero.
void bloom_query_contain_or_exclude(mode_t mode, fieldword_idx_t const* word_indices, size_t words_count) {
  for (size_t word_no = 0; word_no < words_count; word_no++) {
    size_t a, b;
    bloom_hash_word(word_indices[word_no], &a, &b);

    for (uint8_t i = 0; i < bloom.hashes; i++) {
      size_t bit = bloom_hash_bit(a, b, i);
      bit_idxes_working[i] = bit;
    }

    bitset_query(bloom.bf, REQUIRE, bit_idxes_working, bloom.hashes);
    if (word_no == 0) {
      memcpy(bloom_working, bitset_working, BITSET_BYTES);
    } else {
      bitset_op_or(bloom_working, bitset_working);
    }
  }

  if (mode == EXCLUDE) bitset_op_not(bloom_working);
  memcpy(bitset_working, bloom_working, BITSET_BYTES);
}

void bloom_sublist_handler(mode_t mode, fieldword_idx_t const* start, size_t count) {
  switch (mode) {
  case REQUIRE:
    bloom_query_require(start, count);
    break;
  case CONTAIN:
  case EXCLUDE:
    bloom_query_contain_or_exclude(mode, start, count);
    break;
  }
}

results_t* search(void) {
  return bitset_search_template(&bloom_sublist_handler);
}
