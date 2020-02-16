export const boolAsInt = (b: any): number => b ? 1 : 0;

export function exists<T> (val: T | null | undefined): val is T {
  return val != null;
}
