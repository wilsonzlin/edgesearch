// A type large enough to hold any field-word index as well as special negative values (so it must be signed).
// For bit sets, this represents the index of the word-in-field's bit set.
// For others, this represents the index of the word in the words array, which can be used to retrieve the char[] key for lookup.
typedef int32_t fieldword_idx_t;

typedef struct {
  byte* val;
  size_t len;
} word_t;

word_t words[WORDS_COUNT] = __WORDS_INITIALISER;
