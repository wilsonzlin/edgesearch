typedef uint32_t doc_id_t;

typedef enum {
  REQUIRE = 0,
  CONTAIN = 1,
  EXCLUDE = 2,
} mode_t;

typedef struct {
  uint8_t count;
  bool more;
  doc_id_t documents[MAX_RESULTS];
} results_t;

WASM_EXPORT void init(void) {
  heap = &__heap_base;
  uintptr_t align_pad = ((uintptr_t) heap % sizeof(word_t));
  if (align_pad) heap += sizeof(word_t) - tail;
}
