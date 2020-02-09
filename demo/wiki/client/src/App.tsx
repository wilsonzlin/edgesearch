import React, {useEffect, useState} from 'react';
import styles from './App.module.css';
import * as edgesearch from 'edgesearch-client';

type Result = string;

const client = new edgesearch.Client<Result>('wiki.wlin.workers.dev');

export const App = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<edgesearch.SearchResponse<Result> | undefined>(undefined);

  useEffect(() => {
    const terms = query.split(/[^a-zA-Z0-9]+/).filter(t => t).map(t => t.toLowerCase());
    client.search(new edgesearch.Query().add(edgesearch.Mode.REQUIRE, ...terms))
      .then(results => setResults(results));
  }, [query]);

  return (
    <div>
      <header className={styles.header}>
        <input
          className={styles.queryInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search Wikipedia"
        />
      </header>
      <main>
        {results && <>
          <p>{results.results.length}${results.overflow ? '+' : ''} result${results.results.length === 1 ? '' : 's'}</p>
          <ul>
            {results.results.map(result => (
              <li key={result}>{result}</li>
            ))}
          </ul>
        </>}
      </main>
    </div>
  );
};
