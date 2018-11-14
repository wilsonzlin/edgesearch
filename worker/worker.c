typedef   signed char        int8_t;
typedef unsigned char       uint8_t;
typedef          short      int16_t;
typedef unsigned short     uint16_t;
typedef          int        int32_t;
typedef unsigned int       uint32_t;
typedef          long long  int64_t;
typedef unsigned long long uint64_t;

typedef unsigned long size_t;
typedef unsigned char byte;

typedef uint8_t bool;
#define true 1;
#define false 0;

#define NULL ((void*)0)

// string.h. These implementations are poorly-optimized. Oh well.
void* memcpy(void* restrict dst, const void* restrict src, size_t n) {
  byte* bdst = (byte*)dst;
  byte* bsrc = (byte*)src;
  while (n-- > 0) {
    *bdst++ = *bsrc++;
  }
  return dst;
}

void* memset(void* restrict ptr, int c, size_t n) {
  byte* cptr = (byte*)ptr;
  while (n-- > 0) {
    *cptr++ = c;
  }
  return ptr;
}

// Try extra-hard to make sure the compiler uses its built-in intrinsics rather than
// our crappy implementations.
#define memcpy __builtin_memcpy
#define memset __builtin_memset

// Really trivial malloc() implementation. We just allocate bytes sequentially from the start of
// the heap, and reset the whole heap to empty at the start of each request.
extern byte __heap_base;   // Start of heap -- symbol provided by compiler.

byte* heap = NULL;         // Current heap position.
void* last_malloc = NULL;  // Last value returned by malloc(), for trivial optimizations.

void* malloc(size_t n) {
  last_malloc = heap;
  heap += n;
  return last_malloc;
}

void filter_and(uint64_t* a, uint64_t* b) {
  for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
    a[n] &= b[n];
  }
}

void filter_or(uint64_t* a, uint64_t* b) {
  for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
    a[n] |= b[n];
  }
}

void filter_not(uint64_t* filter) {
  for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
    filter[n] = ~filter[n];
  }
}

static uint64_t filters[FILTERS_COUNT][BITFIELD_LENGTH] = {/* {{{{{ FILTERS }}}}} */};

static uint64_t working_require[BITFIELD_LENGTH];
static uint64_t working_contain[BITFIELD_LENGTH];
static uint64_t working_exclude[BITFIELD_LENGTH];
#define BITFIELD_BYTES BITFIELD_LENGTH * BITFIELD_BITS_PER_ELEM

static uint64_t working_final[BITFIELD_LENGTH];
#define FILTER_MSB_MASK (1ull << (BITFIELD_BITS_PER_ELEM - 1))

typedef struct {
  int16_t requires[MAX_WORDS_PER_MODE + 1];
  int16_t contains[MAX_WORDS_PER_MODE + 1];
  int16_t excludes[MAX_WORDS_PER_MODE + 1];
} query_t;

typedef struct {
  /* If last is -1, then overflow */
  int32_t jobs[MAX_RESULTS + 1];
} results_t;

#define WASM_EXPORT __attribute__((visibility("default")))
query_t* init(void) WASM_EXPORT;
results_t* search(void) WASM_EXPORT;

query_t* query;

query_t* init(void) {
  heap = &__heap_base;

  query = malloc(sizeof(query_t));

  return query;
}

results_t* search(void) {
  bool using_requires = query->requires[0] != -1;
  bool using_contains = query->contains[0] != -1;
  bool using_excludes = query->excludes[0] != -1;

  bool copied_to_final = false;

  if (using_requires) {
    memcpy(working_require, filters[query->requires[0]], BITFIELD_BYTES);
    for (int i = 1; query->requires[i] != -1 ; i++) {
      filter_and(working_require, filters[query->requires[i]]);
    }
    memcpy(working_final, working_require, BITFIELD_BYTES);
    copied_to_final = true;
  }

  if (using_contains) {
    memcpy(working_contain, filters[query->contains[0]], BITFIELD_BYTES);
    for (int i = 1; query->contains[i] != -1 ; i++) {
      filter_or(working_contain, filters[query->contains[i]]);
    }
    if (!copied_to_final) {
      memcpy(working_final, working_contain, BITFIELD_BYTES);
      copied_to_final = true;
    } else {
      filter_and(working_final, working_contain);
    }
  }

  if (using_excludes) {
    memcpy(working_exclude, filters[query->excludes[0]], BITFIELD_BYTES);
    for (int i = 1; query->excludes[i] != -1 ; i++) {
      filter_or(working_exclude, filters[query->excludes[i]]);
    }
    filter_not(working_exclude);
    if (!copied_to_final) {
      memcpy(working_final, working_exclude, BITFIELD_BYTES);
      copied_to_final = true;
    } else {
      filter_and(working_final, working_exclude);
    }
  }

  results_t* results = malloc(sizeof(results_t));
  size_t results_count = 0;

  for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
    uint32_t anchor = n * BITFIELD_BITS_PER_ELEM;
    uint64_t elem = working_final[n];
    bool done = false;
    for (uint8_t bit = 0; elem; bit++) {
      if (elem & FILTER_MSB_MASK) {
        results->jobs[results_count] = anchor + bit;
        results_count++;
        if (results_count >= MAX_RESULTS) {
          done = true;
          break;
        }
      }
      elem <<= 1;
    }
    if (done) {
      break;
    }
  }
  results->jobs[results_count] = -1;

  return results;
}
