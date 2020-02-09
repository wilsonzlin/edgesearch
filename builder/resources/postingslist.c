typedef struct {
  // `words` is a sequentialised form of (size_t, byte*)[][].
  // There's a subarray for each mode.
  // Each mode contains array lengths followed by pointers to byte arrays containing serialised Roaring Bitmaps representing a term.
  // Each mode is terminated by NULL.
  // For example: {
  //   200, &bitmapForHello, 100, &bitmapForWorld, NULL,
  //   60, &bitmapForThe, 130, &bitmapForQuick, 140, &bitmapForFox, NULL,
  //   5, &bitmapForAstronaut, NULL,
  // }.
  uint32_t serialised[MAX_QUERY_TERMS * 2 + 3];
} postingslist_query_t;

WASM_EXPORT postingslist_query_t* postingslist_query_init(void) {
  return malloc(sizeof(postingslist_query_t));
}

#define UPDATE_BITMAP(bitmap, update) \
  if (bitmap == NULL) bitmap = update; \
  else roaring_bitmap_and_inplace(bitmap, update)

WASM_EXPORT byte* postingslist_alloc_serialised(size_t size) {
  return malloc(size);
}

WASM_EXPORT results_t* postingslist_query(postingslist_query_t* query) {
  // Portable deserialisation method is used as the source code for croaring-rs seems to use the portable serialisation method.
  roaring_bitmap_t* result_bitmap = NULL;
  size_t i = 0;

  // REQUIRE.
  while (query->serialised[i]) {
    size_t serialised_size = query->serialised[i];
    char const* serialised = (char const*) query->serialised[i + 1];
    roaring_bitmap_t* bitmap = roaring_bitmap_portable_deserialize_safe(serialised, serialised_size);
    UPDATE_BITMAP(result_bitmap, bitmap);
    i += 2;
  }
  i++;

  // CONTAIN.
  // Repurpose array for storing pointers to deserialised bitmaps.
  roaring_bitmap_t** bitmaps_to_or = (roaring_bitmap_t**) query->serialised[i];
  size_t bitmaps_to_or_count = 0;
  while (query->serialised[i]) {
    size_t serialised_size = query->serialised[i];
    char const* serialised = (char const*) query->serialised[i + 1];
    bitmaps_to_or[bitmaps_to_or_count] = roaring_bitmap_portable_deserialize_safe((char const*) serialised, serialised_size);
    bitmaps_to_or_count++;
    i += 2;
  }
  i++;
  if (bitmaps_to_or_count) {
    roaring_bitmap_t *combined = roaring_bitmap_or_many(
        bitmaps_to_or_count, (roaring_bitmap_t const **)bitmaps_to_or);
    UPDATE_BITMAP(result_bitmap, combined);
  }

  // TODO NOT

  if (result_bitmap == NULL) {
    return NULL;
  }

  uint64_t doc_count = roaring_bitmap_get_cardinality(result_bitmap);
  results_t* results = malloc(sizeof(results_t));
  results->more = doc_count > MAX_RESULTS;
  if (results->more) {
    // Only get first MAX_RESULTS.
    doc_id_t last_doc;
    roaring_bitmap_select(result_bitmap, MAX_RESULTS - 1, &last_doc);
    roaring_bitmap_range_uint32_array(result_bitmap, 0, last_doc + 1, results->documents);
    results->count = MAX_RESULTS;
  } else {
    // Get all results as there are fewer than or exactly MAX_RESULTS.
    roaring_bitmap_to_uint32_array(result_bitmap, results->documents);
    results->count = doc_count;
  }

  return results;
}
