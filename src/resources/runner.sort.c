inline void swap(uint64_t* values, size_t i, size_t j) {
  size_t tmp = values[i];
  values[i] = values[j];
  values[j] = tmp;
}

void quicksort(uint64_t* values, size_t start, size_t end) {
  size_t len = end - start + 1;

  switch (len) {
  case 0:
  case 1:
    return;
  case 2:
    if (values[start] > values[end]) swap(values, start, end);
    return;
  }

  size_t mid = start + (len / 2);
  uint64_t pivot = values[mid];

  size_t l = start;
  size_t r = end;

  while (true) {
    while (values[l] < pivot) l++;
    while (values[r] > pivot) r--;
    if (l >= r) break;
    swap(values, l++, r--);
  }

  quicksort(values, start, r);
  quicksort(values, r + 1, end);
}
