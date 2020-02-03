// A type large enough to hold any document index.
typedef size_t doc_id_t;

typedef enum {
  REQUIRE = 0,
  CONTAIN = 1,
  EXCLUDE = 2,
} mode_t;

typedef struct {
  // `words` is a serialised form of char[][].
  // There's a subarray for each mode.
  // Each mode contains null-terminated words, and is terminated by '\0'.
  // For example: {
  //   'h', 'e', 'l', 'l', 'o', '\0', 'w', 'o', 'r', 'l', 'd', '\0', '\0',
  //   't', 'h', 'e', '\0', 'q', 'u', 'i', 'c', 'k', '\0', 'f', 'o' 'x', '\0', '\0',
  //   'a', 's', 't', 'r', 'o', 'n', 'a', 'u', 't', '\0', '\0',
  // }.
	byte words[MAX_QUERY_BYTES];
} query_t;

typedef struct {
  uint8_t count;
  bool more;
	doc_id_t entries[MAX_RESULTS];
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
