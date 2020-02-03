// A type large enough to hold any entry index as well as special negative values (so it must be signed).
typedef int32_t entry_idx_t;

typedef enum {
  REQUIRE = 0,
  CONTAIN = 1,
  EXCLUDE = 2,
} mode_t;

typedef struct {
  // `words` is a  list of bit set (for bit sets) or field-word (for others) indices.
  // The list is like three separate lists, each ending with a -1.
  // Each sublist delimited by -1 represents indices for field-words (or the bit set representing them) to be used as part of a mode.
  // The list has the form { ...REQUIRE_FIELD_WORDS, -1, ...CONTAIN_FIELD_WORDS, -1, ...EXCLUDE_FIELD_WORDS, -1 }.
  // Add three to accommodate one -1 terminator for each mode.
	fieldword_idx_t words[MAX_WORDS + 3];
} query_t;

typedef struct {
  // Will return up to MAX_RESULTS + 1, terminated with -1.
  // Returns one more so that overflow is detectable.
  // For example, if MAX_RESULTS is 200, then returning 201 results means that the actual amount of results could be 201, 202, 250, or 1 million, but is definitely > 200.
	entry_idx_t entries[MAX_RESULTS + 2];
} results_t;

// Exported functions callable from JavaScript.
query_t* init(void) WASM_EXPORT;
results_t* search(void) WASM_EXPORT;

query_t* query;

query_t* init(void) {
	heap = &__heap_base;

	query = malloc(sizeof(query_t));

	return query;
}

// results_t* search(void) needs to be implemented.
