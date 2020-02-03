#define BITSET_BYTES (BITSET_ELEMS_LENGTH * 64 / 8)
#define BITSET_ELEM_MSB (1ull << (64 - 1))

// The type of each element in a bit set array; must be unsigned.
typedef uint64_t bitset_elem_t;

inline void bitset_copy(bitset_elem_t* src, bitset_elem_t* dst) {
  memcpy(dst, src, BITSET_BYTES);
}

// AND two bit sets in place, mutating {@param a}. If the resulting bit set is all zeroes, `false` is returned. Otherwise, `true` is returned.
inline bool bitset_op_and(bitset_elem_t* a, bitset_elem_t* b) {
  bitset_elem_t nonzero = 0;
	for (size_t n = 0; n < BITSET_ELEMS_LENGTH; n++) {
		nonzero |= (a[n] &= b[n]);
	}
	return nonzero != 0;
}

// OR two bit sets in place, mutating {@param a}. If the resulting bit set is all zeroes, `false` is returned. Otherwise, `true` is returned.
inline bool bitset_op_or(bitset_elem_t* a, bitset_elem_t* b) {
  bitset_elem_t nonzero = 0;
	for (size_t n = 0; n < BITSET_ELEMS_LENGTH; n++) {
		nonzero |= (a[n] |= b[n]);
	}
	return nonzero != 0;
}

// Flip all bits in a bit set in place, mutating {@param bitset}.
inline void bitset_op_not(bitset_elem_t* bitset) {
	for (size_t n = 0; n < BITSET_ELEMS_LENGTH; n++) {
		bitset[n] = ~bitset[n];
	}
}

inline size_t bitset_collect_results(bitset_elem_t* bitset, doc_id_t* append_results_to, size_t max_results) {
	size_t results_count = 0;
	for (size_t n = 0; n < BITSET_ELEMS_LENGTH; n++) {
		doc_id_t anchor = n * 64;
		bitset_elem_t elem = bitset[n];
		for (uint8_t bit = 0; elem; bit++) {
			if (elem & BITSET_ELEM_MSB) {
			  // Don't increment results_count in index operator, as behaviour is undefined and causes unpredictable issues.
				append_results_to[results_count] = anchor + bit;
				results_count++;
				if (results_count == max_results) goto done;
			}
			elem <<= 1;
		}
	}

done:
  return results_count;
}

bitset_elem_t bitset_working[BITSET_ELEMS_LENGTH];

// Performs AND or OR on one or more bit sets and stores the result in `bitset_working`.
// If {@param mode} is `REQUIRE`, AND is performed.
// If {@param mode} is `CONTAIN`, OR is performed.
// If {@param mode} is `EXCLUDE`, OR is performed and `bitset_working` is inverted at the end.
// {@param bitset_indices} should be sorted ascending.
// {@param words_count} must not be zero.
void bitset_query(bitset_elem_t const* const* bitsets, mode_t mode, size_t const* bitset_indices, size_t bitset_indices_count) {
  bool require = mode == REQUIRE;

  // Copy first bit set to working area.
  bitset_copy(bitsets[bitset_indices[0]], bitset_working);
  for (size_t i = 1; i < bitset_indices_count; i++) {
    size_t idx = bitset_indices[i];
    if (idx == bitset_indices[i - 1]) {
      continue;
    }
    // TODO Possible optimisation: reduce range of bit set operated upon to [first nonzero byte, last nonzero byte] if AND.
    bool nonzero = require
      ? bitset_op_and(bitset_working, bitsets[idx])
      : bitset_op_or(bitset_working, bitsets[idx])
    if (!nonzero && require) {
      break;
    }
  }

  if (mode == EXCLUDE) bitset_op_not(bitset_working);
}
