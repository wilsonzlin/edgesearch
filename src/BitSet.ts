import {arrayOf, uint64CArrayInitialiser} from './util';
import * as long from 'long';

const BITSET_ELEMENT_SIZE = 64;

export class BitSet {
  // 2-dimensional array of the form values[element][bit].
  private readonly values: number[][];

  constructor (
    private readonly bits: number,
  ) {
    this.values = arrayOf(this.elementsLength, () => Array(BITSET_ELEMENT_SIZE).fill(0));
  }

  get elementsLength () {
    return Math.ceil(this.bits / BITSET_ELEMENT_SIZE);
  }

  set (pos: number | long.Long): this {
    let elem, bit;
    if (typeof pos == 'number') {
      if (!Number.isSafeInteger(pos) || pos < 0) {
        throw new TypeError('Position is not a positive integer');
      }
      elem = Math.trunc(pos / BITSET_ELEMENT_SIZE);
      bit = pos % BITSET_ELEMENT_SIZE;
    } else {
      if (!pos.unsigned) {
        throw new TypeError('Position is signed');
      }
      elem = pos.div(BITSET_ELEMENT_SIZE).toNumber();
      bit = pos.mod(BITSET_ELEMENT_SIZE).toNumber();
    }
    this.values[elem][bit] = 1;
    return this;
  }

  elems (): long.Long[] {
    return this.values.map(elem => long.fromString(elem.join(''), true, 2));
  }

  flat (): number[] {
    return this.values.flatMap(e => e).slice(0, this.bits);
  }

  /**
   * Serialise this bit set to a C array initialiser containing unsigned integers of size `uint64_t`.
   */
  serialise (): string {
    return uint64CArrayInitialiser(this.elems());
  }
}
