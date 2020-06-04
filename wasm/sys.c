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

// Assume running on 64-bit host system.
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

// These will be imported from JS.
void _wasm_import_log(uintptr_t args_ptr);
void _wasm_import_error(uintptr_t args_ptr);

// Use this to make any function visible to JS.
#define WASM_EXPORT __attribute__((visibility("default")))

// This is used by roaring.c, but let's just ignore assertions.
#define assert(ignore)((void) 0)

// __heap_base is provided by host and its position is the start of the heap area.
extern byte __heap_base;
// Must be initialised by reset() before use.
byte* heap = NULL;
byte* last_alloc = NULL;
// Basic allocator that bumps downwards. Stores bytes allocated in word before allocation for realloc().
// Each query simply resets the bump allocation offset so we are not concerned about moving and freeing memory during execution.
void* malloc(size_t n) {
  n += (n % sizeof(word_t)) ? n - (n % sizeof(word_t)) : 0;
  // Store length of memory block just before pointer for use when reallocating.
  *((word_t*) heap) = n;
  heap += sizeof(word_t);
  last_alloc = heap;
  heap += n;
  return last_alloc;
}

// We could optimise this in the future.
int posix_memalign(void **memptr, size_t alignment, size_t size) {
  (void) alignment;
  *memptr = malloc(size);
  return 0;
}

// Other than a trivial memory reclaiming, we do not do any freeing during execution.
void free(void* ptr) {
  if (ptr == last_alloc) {
    heap = last_alloc;
    last_alloc = NULL;
  }
}

// The following implementations of standard library functions are not efficient.
// They could be optimised in the future if performance becomes very bad.

static inline void memcpy_dir(void* restrict dest, void const* restrict src, size_t n, bool forwards) {
  byte* bdest; byte* bsrc;
  if (forwards) {
      bdest = (byte*) dest;
      bsrc = (byte*) src;
      while (n-- > 0) *bdest++ = *bsrc++;
  } else {
      bdest = (byte*) (dest + n - 1);
      bsrc = (byte*) (src + n - 1);
      while (n-- > 0) *bdest-- = *bsrc--;
  }
}

void* memcpy(void* restrict dest, void const* restrict src, size_t n) {
  memcpy_dir(dest, src, n, true);
  return dest;
}

void* memmove(void* dest, void const* src, size_t n) {
  if (src != dest) {
    memcpy_dir(dest, src, n, src < dest);
  }
  return dest;
}

void* memset(void* s, int c, size_t n) {
  byte* bs = (byte*) s;
  while (n--) *bs++ = (byte) c;
  return s;
}

void* realloc(void* ptr, size_t size) {
  size += (size % sizeof(word_t)) ? sizeof(word_t) - (size % sizeof(word_t)) : 0;
  // Get original size.
  word_t* orig_size_ptr = ((word_t*) ptr) - 1;
  word_t orig_size = *orig_size_ptr;
  if (size <= orig_size) {
    return ptr;
  }
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

// Basic stdio functions, necessary for roaring.c.

#define PRIu32 "u"
#define PRId32 "d"

typedef uint8_t FILE;
FILE stderr_fileno = 2;
FILE* stderr = &stderr_fileno;

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
