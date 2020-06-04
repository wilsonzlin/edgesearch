// Synchronise mode IDs with mode_t enum in wasm/index.c.
export enum Mode {
  REQUIRE = '0',
  CONTAIN = '1',
  EXCLUDE = '2',
}

const sorted = <T> (iter: Iterable<T>): T[] => Array.from(iter).sort();

export class Query {
  private readonly modeTerms: ReadonlyArray<Set<string>> = Array(3).fill(void 0).map(() => new Set());

  private continuation: number = 0;

  public add (mode: Mode, ...terms: ReadonlyArray<string>): this {
    for (const w of terms) {
      this.modeTerms[mode].add(w);
    }
    return this;
  }

  public setContinuation (c: number): this {
    this.continuation = c;
    return this;
  }

  public build (): string {
    return [
      `c=${this.continuation}`,
      ...this.modeTerms
        .map((terms, mode) => sorted(terms).map(t => `t=${mode}_${encodeURIComponent(t)}`))
        .reduce((flat, modeTerms) => flat.concat(modeTerms), [])
    ].join('&');
  }
}

export type Agent<T> = (url: string) => Promise<T>;

export const fetchGet = <T> (url: string): Promise<T> => fetch(url).then(res => res.json());

export type SearchResponse<D> = {
  results: D[];
  continuation: number | null;
  total: number;
};

export class Client<D> {
  constructor (
    private readonly prefix: string,
    private readonly agent: Agent<SearchResponse<D>> = fetchGet,
  ) {
  }

  search (query: Query): Promise<SearchResponse<D>> {
    return this.agent(`${this.prefix}/search?${query.build()}`);
  }
}
