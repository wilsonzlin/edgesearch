typedef uint32_t doc_id_t;

// NOTE: This is used in many places and its order and values are intentional.
typedef enum {
  REQUIRE = 0,
  CONTAIN = 1,
  EXCLUDE = 2,
} mode_t;

// Result of a query executed within WASM.
typedef struct {
  // How many documents.
  uint8_t count;
  // Whether there are more documents.
  bool more;
  // IDs of the documents in the result.
  doc_id_t documents[MAX_RESULTS];
} results_t;

// This should be called before every query.
WASM_EXPORT void reset(void) {
  heap = &__heap_base;
}
