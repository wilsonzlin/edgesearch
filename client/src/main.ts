// Synchronise mode IDs with mode_t enum in runner.main.c.
export enum Mode {
  REQUIRE = '1',
  CONTAIN = '2',
  EXCLUDE = '3',
}

const sorted = <T> (iter: Iterable<T>): T[] => Array.from(iter).sort();

export class Query {
  private readonly modeTerms: ReadonlyArray<Set<string>> = Array(3).fill(0).map(() => new Set());

  public add (mode: Mode, terms: ReadonlyArray<string>): this {
    for (const w of terms) {
      this.modeTerms[mode].add(w);
    }
    return this;
  }

  public build (): string {
    return `?q=${this.modeTerms
      .map((terms, i) =>
        sorted(terms)
          .map(t => `${i + 1}_${encodeURIComponent(t)}`)
          .join('&'))
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

export type Entry = {
  [field: string]: string;
};

export type SearchResponse<E extends Entry> = {
  results: E[];
  overflow: boolean;
};

export class Client<E extends Entry> {
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
