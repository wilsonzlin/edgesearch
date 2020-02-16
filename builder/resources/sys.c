// NOTE: WASM is a 32-bit little-endian system.
typedef signed char int8_t;
typedef unsigned char uint8_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef int int32_t;
typedef unsigned int uint32_t;
typedef long long int64_t;
typedef unsigned long long uint64_t;
typedef unsigned long size_t;

// Assume running on 64-bit system.
typedef uint64_t word_t;
typedef uint8_t byte;

typedef int32_t intptr_t;
typedef uint32_t uintptr_t;
#define NULL ((void*) 0)

typedef uint8_t bool;
#define true 1
#define false 0

#define INT32_MAX 0x7FFFFFFF
#define UINT16_MAX 65535
#define UINT32_MAX 4294967295u
#define UINT64_MAX 18446744073709551615ull
#define SIZE_MAX 4294967295ul
#define UINT8_C(c) c
#define INT32_C(c) c
#define INT64_C(c) c ## ll
#define UINT64_C(c) c ## ull

void _wasm_import_log(uintptr_t args_ptr);
void _wasm_import_error(uintptr_t args_ptr);

#define WASM_EXPORT __attribute__((visibility("default")))

#define assert(ignore)((void) 0)

extern byte __heap_base;
// Must be initialised by init() before use.
byte* heap = NULL;
byte* last_alloc = NULL;
void* malloc(size_t n) {
  n += (n % sizeof(word_t)) ? n - (n % sizeof(word_t)) : 0;
  // Store length of memory block just before pointer for use when reallocating.
  *((word_t*) heap) = n;
  heap += sizeof(word_t);
  last_alloc = heap;
  heap += n;
  return last_alloc;
}

// TODO
int posix_memalign(void **memptr, size_t alignment, size_t size) {
  (void) alignment;
  *memptr = malloc(size);
  return 0;
}

// TODO
void free(void* ptr) {
  if (ptr == last_alloc) {
    heap = last_alloc;
    // TODO
    last_alloc = NULL;
  }
}

#define MEMCPY_ALIGNED(align_width, align_t) \
  static inline void memcpy##align_width(void* restrict dest, void const* restrict src, size_t n) { \
    uintptr_t srcpos = (uintptr_t) src; \
    size_t head = (srcpos % align_width) ? align_width - (srcpos % align_width) : 0; \
    size_t tail = (srcpos + n) % align_width; \
    size_t blocks = (n - head - tail) / align_width; \
    \
    byte* hdest = (byte*) dest; \
    byte* hsrc = (byte*) src; \
    for (size_t i = 0; i < head; i++) { *hdest = *hsrc; hdest++; hsrc++; } \
    \
    align_t* wdest = (align_t *) (dest + head); \
    align_t* wsrc = (align_t *) (src + head); \
    for (size_t i = 0; i < blocks; i++) { *wdest = *wsrc; wdest++; wsrc++; } \
    \
    byte* tdest = (byte*) (dest + n - tail); \
    byte* tsrc = (byte*) (src + n - tail); \
    for (size_t i = 0; i < tail; i++) { *tdest = *tsrc; tdest++; tsrc++; } \
  }

MEMCPY_ALIGNED(2, uint16_t)
MEMCPY_ALIGNED(4, uint32_t)
MEMCPY_ALIGNED(8, uint64_t)

#define MEMCPY_REVERSE_ALIGNED(align_width, align_t) \
  static inline void memcpy_reverse##align_width(void* restrict dest, void const* restrict src, size_t n) { \
    uintptr_t srcpos = (uintptr_t) src; \
    size_t head = (srcpos % align_width) ? align_width - (srcpos % align_width) : 0; \
    size_t tail = (srcpos + n) % align_width; \
    size_t blocks = (n - head - tail) / align_width; \
    \
    byte* tdest = (byte*) (dest + n - 1); \
    byte* tsrc = (byte*) (src + n - 1); \
    for (size_t i = 0; i < tail; i++) { *tdest = *tsrc; tdest--; tsrc--; } \
    \
    align_t* wdest = (align_t *) (dest + n - tail - align_width); \
    align_t* wsrc = (align_t *) (src + n - tail - align_width); \
    for (size_t i = 0; i < blocks; i++) { *wdest = *wsrc; wdest--; wsrc--; } \
    \
    byte* hdest = (byte*) (dest + head - 1); \
    byte* hsrc = (byte*) (src + head - 1); \
    for (size_t i = 0; i < head; i++) { *hdest = *hsrc; hdest--; hsrc--; } \
  }

MEMCPY_REVERSE_ALIGNED(2, uint16_t)
MEMCPY_REVERSE_ALIGNED(4, uint32_t)
MEMCPY_REVERSE_ALIGNED(8, uint64_t)

static inline void memcpy_aligned(void* restrict dest, void const* restrict src, size_t n, bool forwards) {
#if USE_ALIGNED_MALLOC
  intptr_t align_dist = (((intptr_t) dest) % sizeof(word_t)) - (((intptr_t) src) % sizeof(word_t));
  if (align_dist < 0) align_dist = -align_dist;
#endif
  byte* bdest; byte* bsrc;
  if (forwards) {
#if USE_ALIGNED_MALLOC
    switch (align_dist) {
    case 0: memcpy8(dest, src, n); break;
    case 2: memcpy2(dest, src, n); break;
    case 4: memcpy4(dest, src, n); break;
    case 6: memcpy2(dest, src, n); break;
    default:
#endif
      bdest = (byte*) dest;
      bsrc = (byte*) src;
      while (n-- > 0) *bdest++ = *bsrc++;
#if USE_ALIGNED_MALLOC
      break;
    }
#endif
  } else {
#if USE_ALIGNED_MALLOC
    switch (align_dist) {
    case 0: memcpy_reverse8(dest, src, n); break;
    case 2: memcpy_reverse2(dest, src, n); break;
    case 4: memcpy_reverse4(dest, src, n); break;
    case 6: memcpy_reverse2(dest, src, n); break;
    default:
#endif
      bdest = (byte*) (dest + n - 1);
      bsrc = (byte*) (src + n - 1);
      while (n-- > 0) *bdest-- = *bsrc--;
#if USE_ALIGNED_MALLOC
      break;
    }
#endif
  }
}

void* memcpy(void* restrict dest, void const* restrict src, size_t n) {
  memcpy_aligned(dest, src, n, true);
  return dest;
}

void* memmove(void* dest, void const* src, size_t n) {
  if (src != dest) {
    memcpy_aligned(dest, src, n, src < dest);
  }
  return dest;
}

void* memset(void* s, int c, size_t n) {
  // TODO Aligned-block set
  byte* bs = (byte*) s;
  while (n--) *bs++ = (byte) c;
  return s;
}

void* realloc(void* ptr, size_t size) {
  size += (size % sizeof(word_t)) ? sizeof(word_t) - (size % sizeof(word_t)) : 0;
  // Get original size.
  word_t* orig_size_ptr = ((word_t*) ptr) - 1;
  word_t orig_size = *orig_size_ptr;
  if (size <= orig_size) return ptr;
  if (ptr == last_alloc) {
    *orig_size_ptr = size;
    heap += size - orig_size;
    return ptr;
  } else {
    void* newptr = malloc(size);
    memcpy(newptr, ptr, orig_size);
    return newptr;
  }
}

void* calloc(size_t nmemb, size_t size) {
  size_t bytes = size * nmemb;
  void* newptr = malloc(bytes);
  memset(newptr, 0, bytes);
  return newptr;
}

int memcmp(void const* s1, void const* s2, size_t n) {
  // TODO Aligned-block compare
  byte* bs1 = (byte*) s1;
  byte* bs2 = (byte*) s2;
  while (n-- > 0) {
    byte cmp = (*bs1 > *bs2) - (*bs1 < *bs2);
    if (cmp) return cmp;
    bs1++; bs2++;
  }
  return 0;
}

size_t strlen(char const* bytes) {
  size_t len = 0;
  while (bytes[len]) len++;
  return len;
}

uint8_t stderr_fileno = 2;
void* stderr = &stderr_fileno;

// TODO
typedef uint8_t FILE;
#define PRIu32 "u"
#define PRId32 "d"

int printf(char const* format, ...) {
  _wasm_import_log((uintptr_t) &format);
  return 0;
}

int fprintf(FILE* stream, char const* format, ...) {
  if (stream != stderr) {
    _wasm_import_log((uintptr_t) &format);
  } else {
    _wasm_import_error((uintptr_t) &format);
  }
  return 0;
}
