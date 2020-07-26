typedef struct {
  char* val;
  uint8_t len;
} str_t;

typedef union {
  str_t strval;
  uint32_t intval;
} str_or_uint32_t;

typedef struct {
  uint32_t id;
  uint32_t mid_pos;
  str_or_uint32_t first_key;
} bst_chunk_ref_t;

typedef enum {
  KEY_NUM = 0,
  KEY_STR = 1,
} bst_key_t;

bst_chunk_ref_t NORMAL_TERMS_CHUNKS[] = {
  ___NORMAL_TERMS_CHUNKS___
};
uint32_t NORMAL_TERMS_CHUNKS_LEN = ___NORMAL_TERMS_CHUNKS_LEN___;
bst_chunk_ref_t DOCUMENTS_CHUNKS[] = {
  ___DOCUMENTS_CHUNKS___
};
uint32_t DOCUMENTS_CHUNKS_LEN = ___DOCUMENTS_CHUNKS_LEN___;

static inline int compare_int(int a, int b) {
  return (a > b) - (a < b);
}

static inline int compare_str_with_len(char* a, uint8_t alen, char* b, uint8_t blen) {
  uint8_t len = alen < blen ? alen : blen;
  for (int i = 0; i < len; i++) {
    int charcmp = compare_int(a[i], b[i]);
    if (charcmp != 0) return charcmp;
  }
  return compare_int(alen, blen);
}

static inline int compare_str_or_uint32(bst_key_t key, str_or_uint32_t a, str_or_uint32_t b) {
  switch (key) {
  case KEY_NUM: return compare_int(a.intval, b.intval);
  case KEY_STR: return compare_str_with_len(a.strval.val, a.strval.len, b.strval.val, b.strval.len);
  }
}

typedef struct {
  uint32_t len;
  byte* ptr;
} chunk_entry_t;

static inline bst_chunk_ref_t* find_chunk(bst_chunk_ref_t chunks[], uint32_t chunks_len, bst_key_t key_type, str_or_uint32_t key) {
  int32_t lo = 0, hi = chunks_len - 1;
  while (true) {
    int32_t dist = hi + 1 - lo;
    if (dist <= 0) {
      fprintf(stderr, "Search went out of bounds while looking for chunk");
      return NULL;
    }
    if (dist == 1) return &chunks[lo];
    if (dist == 2) return compare_str_or_uint32(key_type, key, chunks[hi].first_key) < 0 ? &chunks[lo] : &chunks[hi];
    int32_t mid = lo + (dist / 2);
    int cmp = compare_str_or_uint32(key_type, key, chunks[mid].first_key);
    if (cmp < 0) hi = mid - 1;
    else if (cmp == 0) return &chunks[mid];
    else lo = mid;
  }
}

WASM_EXPORT bst_chunk_ref_t* find_chunk_containing_term(char* term, uint8_t term_len) {
  str_t term_str;
  term_str.len = term_len;
  term_str.val = term;
  str_or_uint32_t key;
  key.strval = term_str;
  return find_chunk(NORMAL_TERMS_CHUNKS, NORMAL_TERMS_CHUNKS_LEN, KEY_STR, key);
}

WASM_EXPORT bst_chunk_ref_t* find_chunk_containing_doc(doc_id_t doc) {
  str_or_uint32_t key;
  key.intval = doc;
  return find_chunk(DOCUMENTS_CHUNKS, DOCUMENTS_CHUNKS_LEN, KEY_NUM, key);
}
