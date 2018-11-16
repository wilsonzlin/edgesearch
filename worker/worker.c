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
 *
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
#define true 1;
#define false 0;

#define NULL ((void*) 0)

// string.h. These implementations are poorly-optimized. Oh well.
void* memcpy(void* restrict dst, const void* restrict src, size_t n)
{
	byte* bdst = (byte*) dst;
	byte* bsrc = (byte*) src;
	while (n-- > 0) {
		*bdst++ = *bsrc++;
	}
	return dst;
}

void* memset(void* restrict ptr, int c, size_t n)
{
	byte* cptr = (byte*) ptr;
	while (n-- > 0) {
		*cptr++ = c;
	}
	return ptr;
}

// Try extra-hard to make sure the compiler uses its built-in intrinsics rather
// than our crappy implementations.
#define memcpy __builtin_memcpy
#define memset __builtin_memset

// Really trivial malloc() implementation. We just allocate bytes sequentially
// from the start of the heap, and reset the whole heap to empty at the start of
// each request.
extern byte __heap_base; // Start of heap -- symbol provided by compiler.

byte* heap = NULL; // Current heap position.
void* last_malloc =
	NULL; // Last value returned by malloc(), for trivial optimizations.

void* malloc(size_t n)
{
	last_malloc = heap;
	heap += n;
	return last_malloc;
}

#define WASM_EXPORT __attribute__((visibility("default")))
#define BITFIELD_BYTES (BITFIELD_LENGTH * BITFIELD_BITS_PER_ELEM / 8)
#define FILTER_MSB_MASK (1ull << (BITFIELD_BITS_PER_ELEM - 1))

// One -1 terminator for each mode
#define MAX_INPUT_ARR_LEN (MAX_WORDS + MODES_COUNT)
// Will return up to MAX_RESULTS + 1, terminated with -1
// Returns one more so that overflow is detectable
#define MAX_OUTPUT_ARR_LEN (MAX_RESULTS + 2)

// The type of each element in a bit field array; should be large enough
// to hold BITFIELD_BITS_PER_ELEM; must be unsigned
typedef uint64_t bf_elem_t;
// A type large enough to hold FILTERS_COUNT as well as special negative
// values (so it must be signed)
typedef int16_t filter_idx_t;
// A type large enough to hold BITFIELD_LENGTH as well as speical negative
// values
typedef int32_t job_idx_t;
// A type large enough to hold BITFIELD_BITS_PER_ELEM
// NOTE: This is NOT to hold a value of an element, just the bit position,
// so this value should be maximum 64
typedef uint8_t bf_elem_bit_pos_t;

typedef struct {
	filter_idx_t words[MAX_INPUT_ARR_LEN];
} query_t;

typedef struct {
	job_idx_t jobs[MAX_OUTPUT_ARR_LEN];
} results_t;

query_t* init(void) WASM_EXPORT;
results_t* search(void) WASM_EXPORT;

void bf_op_and(bf_elem_t* a, bf_elem_t* b)
{
	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		a[n] &= b[n];
	}
}

void bf_op_or(bf_elem_t* a, bf_elem_t* b)
{
	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		a[n] |= b[n];
	}
}

void bf_op_not(bf_elem_t* filter)
{
	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		filter[n] = ~filter[n];
	}
}

static query_t* query;

query_t* init(void)
{
	heap = &__heap_base;

	query = malloc(sizeof(query_t));

	return query;
}

static bf_elem_t filters[FILTERS_COUNT][BITFIELD_LENGTH] = {
	/* {{{{{ FILTERS }}}}} */};
static bf_elem_t bf_working[MODES_COUNT][BITFIELD_LENGTH];
static bf_elem_t bf_result[BITFIELD_LENGTH];

results_t* search(void)
{
	bool copied_to_result = false;

	// 0 == require, 1 == contain, 2 == exclude
	int mode = 0;
	bool copied_to_working = false;

	for (size_t word_idx = 0;; word_idx++) {
		filter_idx_t filter_idx = query->words[word_idx];

		if (filter_idx == -1) {
			if (copied_to_working) {
				if (mode == 2) {
					bf_op_not(bf_working[mode]);
				}
				if (!copied_to_result) {
					memcpy(bf_result, bf_working[mode],
					       BITFIELD_BYTES);
					copied_to_result = true;
				} else {
					bf_op_and(bf_result, bf_working[mode]);
				}
			}

			mode++;
			copied_to_working = false;
			if (mode == MODES_COUNT) {
				break;
			}
			continue;
		}

		if (!copied_to_working) {
			memcpy(bf_working[mode], filters[filter_idx],
			       BITFIELD_BYTES);
			copied_to_working = true;
		} else {
			switch (mode) {
			case 0:
				bf_op_and(bf_working[mode],
					  filters[filter_idx]);
				break;
			case 1:
			case 2:
				bf_op_or(bf_working[mode], filters[filter_idx]);
				break;
			}
		}
	}

	results_t* results = malloc(sizeof(results_t));
	size_t results_count = 0;

	for (size_t n = 0; n < BITFIELD_LENGTH; n++) {
		job_idx_t anchor = n * BITFIELD_BITS_PER_ELEM;
		bf_elem_t elem = bf_result[n];
		for (bf_elem_bit_pos_t bit = 0; elem; bit++) {
			if (elem & FILTER_MSB_MASK) {
				results->jobs[results_count] = anchor + bit;
				results_count++;
				// Get up to MAX_RESULTS + 1 so that overflow is
				// detectable
				if (results_count == MAX_RESULTS + 1) {
					goto done;
				}
			}
			elem <<= 1;
		}
	}

done:
	results->jobs[results_count] = -1;

	return results;
}
