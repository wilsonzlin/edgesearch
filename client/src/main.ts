// Synchronise mode IDs with mode_t enum in resources/main.c.
export enum Mode {
  REQUIRE = '0',
  CONTAIN = '1',
  EXCLUDE = '2',
}

const sorted = <T> (iter: Iterable<T>): T[] => Array.from(iter).sort();

export class Query {
  private readonly modeTerms: ReadonlyArray<Set<string>> = Array(3).fill(void 0).map(() => new Set());

  public add (mode: Mode, ...terms: ReadonlyArray<string>): this {
    for (const w of terms) {
      this.modeTerms[mode].add(w);
    }
    return this;
  }

  public build (): string {
    return `?q=${this.modeTerms
      .map((terms, mode) => sorted(terms).map(t => `${mode}_${encodeURIComponent(t)}`).join('&'))
      // Filter after mapping as otherwise mode IDs are incorrect.
      .filter(p => p)
      .join('&')}`;
  }
}

export class BadStatusError extends Error {
  public constructor (
    private readonly status: number,
  ) {
    super(`Received a bad status of ${status}`);
  }
}

const httpGet = <T> (url: string): Promise<T> => new Promise<T>((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.onreadystatechange = () => {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      const status = xhr.status;
      if (status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new BadStatusError(status));
      }
    }
  };
  xhr.onerror = reject;
  xhr.open('GET', url);
  xhr.send();
});

export type SearchResponse<E> = {
  results: E[];
  more: boolean;
};

export class Client<E> {
  constructor (
    private readonly host: string,
    private readonly protocol: string = 'https',
    private readonly agent: <T>(url: string) => Promise<T> = httpGet,
  ) {
  }

  search (query: Query): Promise<SearchResponse<E>> {
    return this.agent<SearchResponse<E>>(`${this.protocol}://${this.host}/search${query.build()}`);
  }
}
