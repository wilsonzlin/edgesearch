/*
 * The following libc replacement code is partially copied from
 * https://github.com/cloudflare/cloudflare-workers-wasm-demo.git
 * using the following license:
 *
 * Copyright (c) 2018 Cloudflare, Inc. and contributors
 * Licensed under the MIT License:
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

typedef signed char int8_t;
typedef unsigned char uint8_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef int int32_t;
typedef unsigned int uint32_t;
typedef long long int64_t;
typedef unsigned long long uint64_t;

typedef unsigned long size_t;
typedef unsigned char byte;

typedef uint8_t bool;
#define true 1
#define false 0

#define NULL ((void*) 0)

// string.h. These implementations are poorly-optimized. Oh well.
void* memcpy(void* restrict dst, void const* restrict src, size_t n) {
	byte* bdst = (byte*) dst;
	byte* bsrc = (byte*) src;
	while (n-- > 0) {
		*bdst++ = *bsrc++;
	}
	return dst;
}

size_t strlen(char const* bytes) {
  size_t len = 0;
  while (bytes[len]) len++;
  return len;
}

// Try extra-hard to make sure the compiler uses its built-in intrinsics rather than our crappy implementations.
#define memcpy __builtin_memcpy

// Start of heap -- symbol provided by compiler.
extern byte __heap_base;

// Current heap position.
byte* heap = NULL;
// Last value returned by malloc(), for trivial optimizations.
void* last_malloc =	NULL;

// Really trivial malloc() implementation. We just allocate bytes sequentially
// from the start of the heap, and reset the whole heap to empty at the start of
// each request.
void* malloc(size_t n) {
	last_malloc = heap;
	heap += n;
	return last_malloc;
}

#define WASM_EXPORT __attribute__((visibility("default")))
