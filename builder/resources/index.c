typedef struct {
  // This is a flattened form of (size_t, byte*)[][].
  // There's a subarray for each mode, and they are ordered according to their numeric value (see mode_t).
  // Each mode contains array lengths followed by pointers to byte arrays containing serialised Roaring Bitmaps representing a term.
  // Each mode is terminated by NULL.
  // For example: `{
  //   200, &bitmapForHello, 100, &bitmapForWorld, NULL,
  //   60, &bitmapForThe, 130, &bitmapForQuick, 140, &bitmapForFox, NULL,
  //   5, &bitmapForAstronaut, NULL,
  // }`.
  uint32_t serialised[MAX_QUERY_TERMS * 2 + 3];
} index_query_t;

// Function to be called from JS that allocates enough memory for a query and returns the pointer to it.
WASM_EXPORT index_query_t* index_query_init(void) {
  return malloc(sizeof(index_query_t));
}

// Function to be called from JS that allocates enough memory to copy over the bytes of a serialised bitmap from JS to WASM and returns the pointer to it.
WASM_EXPORT byte* index_alloc_serialised(size_t size) {
  return malloc(size);
}

// Internal function used to deserialise multiple bitmaps from a `index_query_t->serialised` value.
// `mode_query_data` should point to `index_query_t->serialised`, and `mode_query_data_next` should be the next offset to process.
// `deserialised_holding` must be provided as a scratch space so that pointers to deserialised bitmaps (which are allocated on the heap) can be stored somewhere temporarily.
// The deserialised bitmaps are then combined using OR on the heap and the pointer to it will be returned. If there are no bitmaps to combine, NULL is returned instead.
inline roaring_bitmap_t* index_deserialise_and_combine(roaring_bitmap_t** deserialised_holding, uint32_t* mode_query_data, size_t* mode_query_data_next) {
  size_t bitmaps_to_combine_count = 0;
  while (mode_query_data[*mode_query_data_next]) {
    size_t serialised_size = mode_query_data[*mode_query_data_next];
    char const* serialised = (char const*) mode_query_data[*mode_query_data_next + 1];
    roaring_bitmap_t* bitmap = roaring_bitmap_portable_deserialize_safe(serialised, serialised_size);
    deserialised_holding[bitmaps_to_combine_count] = bitmap;
    bitmaps_to_combine_count++;
    *mode_query_data_next += 2;
  }
  (*mode_query_data_next)++;
  if (bitmaps_to_combine_count) {
    roaring_bitmap_t* combined = roaring_bitmap_or_many(bitmaps_to_combine_count, (roaring_bitmap_t const**) deserialised_holding);
    return combined;
  }
  return NULL;
}

// Function to be called from JS that executes a query. May return NULL if an error occurred.
WASM_EXPORT results_t* index_query(index_query_t* query) {
  // Portable deserialisation method is used as the source code for croaring-rs seems to use the portable serialisation method.
  roaring_bitmap_t* result_bitmap = NULL;
  size_t i = 0;

  // REQUIRE.
  while (query->serialised[i]) {
    size_t serialised_size = query->serialised[i];
    char const* serialised = (char const*) query->serialised[i + 1];
    roaring_bitmap_t* bitmap = roaring_bitmap_portable_deserialize_safe(serialised, serialised_size);
    if (result_bitmap == NULL) result_bitmap = bitmap;
    else roaring_bitmap_and_inplace(result_bitmap, bitmap);
    i += 2;
  }
  i++;

  // CONTAIN.
  // Repurpose query data array for storing pointers to deserialised bitmaps.
  roaring_bitmap_t* contain_bitmaps_combined = index_deserialise_and_combine((roaring_bitmap_t**) &query->serialised[i], query->serialised, &i);
  if (contain_bitmaps_combined != NULL) {
    if (result_bitmap == NULL) result_bitmap = contain_bitmaps_combined;
    else roaring_bitmap_and_inplace(result_bitmap, contain_bitmaps_combined);
  }

  // EXCLUDE.
  // Repurpose query data array for storing pointers to deserialised bitmaps.
  roaring_bitmap_t* exclude_bitmaps_combined = index_deserialise_and_combine((roaring_bitmap_t**) &query->serialised[i], query->serialised, &i);
  if (exclude_bitmaps_combined != NULL) {
    if (result_bitmap == NULL) result_bitmap = exclude_bitmaps_combined;
    else roaring_bitmap_andnot_inplace(result_bitmap, exclude_bitmaps_combined);
  }

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
