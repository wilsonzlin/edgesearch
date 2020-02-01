// Synchronise mode IDs with mode_t enum in runner.main.c.
export enum Mode {
  REQUIRE = '1',
  CONTAIN = '2',
  EXCLUDE = '3',
}

const sorted = <T> (iter: Iterable<T>): T[] => Array.from(iter).sort();

export class Query {
  // mode => field => words.
  private readonly terms: Map<Mode, Map<string, Set<string>>> = new Map();

  public add (mode: Mode, field: string, words: ReadonlyArray<string>): this {
    const terms = this.terms;
    if (!terms[mode]) {
      terms[mode] = {};
    }
    if (!terms[mode][field]) {
      terms[mode][field] = new Set();
    }
    for (const w of words) {
      terms[mode][field].add(w);
    }
    return this;
  }

  public build (): string {
    const terms = this.terms;
    const queryParts = [];
    // TODO Abstract modes
    for (const mode of sorted(terms.keys())) {
      for (const field of sorted(terms.get(mode)!.keys())) {
        for (const word of sorted(terms.get(mode)!.get(field)!)) {
          // Mode and field should be URL safe; word should be too but encode just to be sure.
          queryParts.push(encodeURIComponent(`${mode}_${field}_${word}`));
        }
      }
    }
    return `?q=${queryParts.join('&')}`;
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

export type AutocompleteResponse = string[];

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

  autocomplete (field: string, term: string): Promise<AutocompleteResponse> {
    return this.agent<string[]>(`${this.protocol}://${this.host}/autocomplete?f=${encodeURIComponent(field)}&t=${encodeURIComponent(term)}`);
  }
}
