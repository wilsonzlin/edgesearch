import {extendSet, mapSet} from './util';

export type Entry = {
  [field: string]: string;
};

export type Field<E extends Entry> = keyof E & string;

export type Data<E extends Entry, Searchable extends Field<E>> = {
  entries: ReadonlyArray<E>;
  searchable: Set<Searchable>;
  // Words across all entries that appear in a field.
  fieldWords: Map<Searchable, Set<string>>;
  // Words in a specific entry's specific field's value. The entry is represented by its index.
  entryFieldValueWords: Map<number, Map<Searchable, Set<string>>>;
};

export const buildData = <E extends Entry, Searchable extends Field<E>> (entries: E[], searchable: Set<Searchable>, {
  wordsExtractor = s => new Set(s.split(/\W+/)),
}: {
  wordsExtractor: (str: string) => Set<string>;
}): Data<E, Searchable> => {
  const fieldWords = new Map<Searchable, Set<string>>(mapSet(searchable, s => [s, new Set<string>()]));
  const entryFieldValueWords = new Map<number, Map<Searchable, Set<string>>>(entries.map((_, i) => [i, new Map()]));

  for (const [entryIdx, entry] of entries.entries()) {
    for (const field of searchable) {
      const words = wordsExtractor(entry[field]);
      extendSet(fieldWords.get(field)!, words);
      entryFieldValueWords.get(entryIdx)!.set(field, words);
    }
  }

  return {entries, searchable, fieldWords, entryFieldValueWords};
};
