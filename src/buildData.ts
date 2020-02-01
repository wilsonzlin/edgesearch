import {arrayOf, mapSet, uniq} from './util';
import * as long from 'long';

export type Entry = {
  [field: string]: string;
};

export type Field<E extends Entry> = keyof E & string;

export enum BitFieldElementSize {
  uint8_t = 8,
  uint16_t = 16,
  uint32_t = 32,
  uint64_t = 64,
}

class BitField {
  // 2-dimensional array of the form values[element][bit].
  private readonly values: number[][];
  readonly elementsLength: number;

  constructor (
    private readonly length: number,
    readonly elementSize: BitFieldElementSize,
  ) {
    this.elementsLength = Math.ceil(length / elementSize);
    this.values = arrayOf(this.elementsLength, () => Array(elementSize).fill(0));
  }

  set (pos: number): this {
    this.values[Math.floor(pos / this.elementSize)][pos % this.elementSize] = 1;
    return this;
  }

  /**
   * Serialise this bit field to a C array initialiser containing unsigned integers of size `elementSize`.
   */
  serialise (): string {
    return `{${this.values.map(elem => `${long.fromString(elem.join(''), true, 2).toString()}u`).join(',')}}`;
  }
}

export type BitFieldIds<E extends Entry, Searchable extends Field<E>> = {
  [field in Searchable]: {
    [word: string]: number;
  };
};

export type Data<E extends Entry, Searchable extends Field<E>> = {
  bitFields: BitField[];
  bitFieldIds: BitFieldIds<E, Searchable>;
};

export const buildData = <E extends Entry, Searchable extends Field<E>> (entries: E[], searchable: Set<Searchable>, {
  wordsExtractor = s => new Set(s.split(/\W+/)),
  bitfieldElementSize,
}: {
  wordsExtractor: (str: string) => Set<string>;
  bitfieldElementSize: BitFieldElementSize,
}): Data<E, Searchable> => {
  const wordsInSpecificEntrySpecificField = new Map<string, Set<string>>();
  for (const [entryIdx, entry] of entries.entries()) {
    for (const field of searchable) {
      wordsInSpecificEntrySpecificField.set([entryIdx, field].join('|'), wordsExtractor(entry[field]));
    }
  }

  // We create a bitfield for each distinct word in each searchable field across all entries.
  // Each bitfield has n elements, where n is the amount of entries. A bit is set to true if the entry it represents contains the word-in-field represented by the bitfield.
  // A bitfield is identified by its index in this array. The ID of the corresponding bitfield for a word-in-field is set at bitFieldIds[field][word].
  // First bit field is the one used for non-existent words and should be fully zero.
  const bitFields: BitField[] = [new BitField(entries.length, bitfieldElementSize)];
  // Create BitFieldIds object.
  const bitFieldIds: BitFieldIds<E, Searchable> = Object.fromEntries(mapSet(searchable, field => [
    field,
    // Create filters for field.
    Object.fromEntries(uniq(entries.flatMap(e => [...wordsExtractor(e[field])])).map(word => [
      word,
      // The index of the bitfield is equal to the new length after pushing minus one.
      bitFields.push(
        [...entries.keys()]
          // Find indices of entries that have this word in its field's value.
          .filter(entryIdx => wordsInSpecificEntrySpecificField.get([entryIdx, field].join('|'))!.has(word))
          // Set indices to true in bitfield.
          .reduce((bitField, entryIdx) => bitField.set(entryIdx), new BitField(entries.length, bitfieldElementSize)),
      ) - 1,
    ])),
  ])) as BitFieldIds<E, Searchable>;

  return {bitFields, bitFieldIds};
};
