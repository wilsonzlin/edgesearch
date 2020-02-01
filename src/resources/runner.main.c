#define BITFIELD_BYTES (BITFIELD_LENGTH * BITFIELD_BITS_PER_ELEM / 8)
#define FILTER_MSB_MASK (1ull << (BITFIELD_BITS_PER_ELEM - 1))

// The type of each element in a bit field array; should be large enough to hold BITFIELD_BITS_PER_ELEM; must be unsigned.
typedef uint64_t bf_elem_t;
// A type large enough to hold BITFIELDS_COUNT as well as special negative values (so it must be signed).
typedef int16_t bitfield_idx_t;
// A type large enough to hold BITFIELD_LENGTH as well as special negative values.
typedef int32_t entry_idx_t;
// A type large enough to hold BITFIELD_BITS_PER_ELEM.
// NOTE: This is NOT to hold a value of an element, just the bit position, so this value should only ever be at most 64.
typedef uint8_t bf_elem_bit_pos_t;

typedef struct {
  // One -1 terminator for each mode.
	bitfield_idx_t words[MAX_WORDS + 3];
} query_t;

typedef struct {
  // Will return up to MAX_RESULTS + 1, terminated with -1.
  // Returns one more so that overflow is detectable.
	entry_idx_t entries[MAX_RESULTS + 2];
} results_t;

typedef enum {
  REQUIRE = 0,
  CONTAIN = 1,
  EXCLUDE = 2,
} mode_t;

void bf_op_and(bf_elem_t* a, bf_elem_t* b) {
	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		a[n] &= b[n];
	}
}

void bf_op_or(bf_elem_t* a, bf_elem_t* b) {
	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		a[n] |= b[n];
	}
}

void bf_op_not(bf_elem_t* bitfield) {
	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		bitfield[n] = ~bitfield[n];
	}
}

// Exported functions callable from JavaScript.
query_t* init(void) WASM_EXPORT;
results_t* search(void) WASM_EXPORT;

static query_t* query;

query_t* init(void) {
	heap = &__heap_base;

	query = malloc(sizeof(query_t));

	return query;
}

static bf_elem_t bitfields[BITFIELDS_COUNT][BITFIELD_LENGTH] = __BITFIELDS_ARRAY_INITIALISER;
static bf_elem_t bf_working[3][BITFIELD_LENGTH];
static bf_elem_t bf_result[BITFIELD_LENGTH];

results_t* search(void) {
	bool copied_to_result = false;

	mode_t mode = REQUIRE;
	bool copied_to_working = false;

	for (size_t word_idx = 0;; word_idx++) {
		bitfield_idx_t bitfield_idx = query->words[word_idx];

		if (bitfield_idx == -1) {
			if (copied_to_working) {
				if (mode == EXCLUDE) bf_op_not(bf_working[mode]);
				if (!copied_to_result) {
					memcpy(bf_result, bf_working[mode], BITFIELD_BYTES);
					copied_to_result = true;
				} else {
					bf_op_and(bf_result, bf_working[mode]);
				}
			}

			mode++;
			copied_to_working = false;
			if (mode == 3) break;
			continue;
		}

		if (!copied_to_working) {
			memcpy(bf_working[mode], bitfields[bitfield_idx], BITFIELD_BYTES);
			copied_to_working = true;
		} else {
			switch (mode) {
			case REQUIRE:
				bf_op_and(bf_working[mode], bitfields[bitfield_idx]);
				break;
			case CONTAIN:
			case EXCLUDE:
				bf_op_or(bf_working[mode], bitfields[bitfield_idx]);
				break;
			}
		}
	}

	results_t* results = malloc(sizeof(results_t));
	size_t results_count = 0;

	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		entry_idx_t anchor = n * BITFIELD_BITS_PER_ELEM;
		bf_elem_t elem = bf_result[n];
		for (bf_elem_bit_pos_t bit = 0; elem; bit++) {
			if (elem & FILTER_MSB_MASK) {
			  // Don't increment results_count in index operator, as behaviour is undefined and randomly causes issues.
				results->entries[results_count] = anchor + bit;
				results_count++;
				// Get up to MAX_RESULTS + 1 so that overflow is detectable.
				if (results_count == MAX_RESULTS + 1) goto done;
			}
			elem <<= 1;
		}
	}

done:
	results->entries[results_count] = -1;

	return results;
}
