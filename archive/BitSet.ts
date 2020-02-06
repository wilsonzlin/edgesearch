import {arrayOf} from './util';

const BITSET_ELEMENT_SIZE = 64;

const popcnt = (val: bigint): number => {
  let count = 0;
  while (val) {
    count += Number(val & 1n);
    val >>= 1n;
  }
  return count;
};

export class BitSet {
  readonly elementsLength: number;
  readonly effectiveBits: number;
  private readonly values: bigint[];

  constructor (
    private readonly bits: number,
  ) {
    this.elementsLength = Math.ceil(this.bits / BITSET_ELEMENT_SIZE);
    this.effectiveBits = this.elementsLength * BITSET_ELEMENT_SIZE;
    this.values = arrayOf(this.elementsLength, () => 0n);
  }

  countZeros (): number {
    return this.values.reduce((sum, elem) => sum + popcnt(elem), 0);
  }

  set (pos: number): this {
    let elem, bit;
    if (!Number.isSafeInteger(pos) || pos < 0) {
      throw new TypeError('Position is not a positive integer');
    }
    elem = Math.trunc(pos / BITSET_ELEMENT_SIZE);
    bit = pos % BITSET_ELEMENT_SIZE;
    this.values[elem] |= (1n << BigInt(bit));
    return this;
  }

  elems (): ReadonlyArray<bigint> {
    return this.values;
  }
}
