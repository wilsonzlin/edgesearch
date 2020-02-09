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

#define WASM_EXPORT __attribute__((visibility("default")))

#define assert(ignore)((void) 0)

extern byte __heap_base;
// Must be initialised by init() before use.
byte* heap = NULL;
byte* last_alloc = NULL;
void* malloc(size_t n) {
  // TODO Alignment?
  // Store length of memory block just before pointer for use when reallocating.
  *((size_t*) heap) = n;
  heap += sizeof(size_t);
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

void* memcpy(void* restrict dest, void const* restrict src, size_t n) {
  byte* bdest = (byte*) dest;
  byte* bsrc = (byte*) src;
  while (n-- > 0) *bdest++ = *bsrc++;
  return dest;
}

void* memmove(void* dest, void const* src, size_t n) {
  if (src < dest) {
    memcpy(dest, src, n);
  } else if (src > dest) {
    byte* bdest = (byte*) (dest + n);
    byte* bsrc = (byte*) (src + n);
    while (n-- > 0) *bdest-- = *bsrc--;
  }
  return dest;
}

void* memset(void* s, int c, size_t n) {
  byte* bs = (byte*) s;
  while (n--) *bs++ = (byte) c;
  return s;
}

void* realloc(void* ptr, size_t size) {
  // Get original size.
  size_t orig_size = ((size_t*) ptr)[-1];
  byte* bptr = (byte*) ptr;
  if (bptr == last_alloc) {
    heap += size - (heap - last_alloc);
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

// TODO
typedef uint8_t FILE;
#define stderr NULL
#define PRIu32 "u"
#define PRId32 "d"

int printf(char const* format, ...) {
  // TODO
  (void) format;
  return 0;
}

int fprintf(FILE* stream, char const* format, ...) {
  // TODO
  (void) stream;
  (void) format;
  return 0;
}
