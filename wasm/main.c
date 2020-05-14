typedef uint32_t doc_id_t;

// NOTE: This is used in many places and its order and values are intentional.
typedef enum {
  REQUIRE = 0,
  CONTAIN = 1,
  EXCLUDE = 2,
} mode_t;

// This should be called before every query.
WASM_EXPORT void reset(void) {
  heap = &__heap_base;
}
