import React from 'react';
import {BasicArticle} from '../BasicArticle/BasicArticle';
import {FullArticle} from '../FullArticle/FullArticle';
import {useSearch} from '../search/search';
import styles from './App.module.css';

export const App = () => {
  const search = useSearch();

  return (
    <div>
      <header className={styles.header}>
        <form
          className={styles.searchForm}
          onSubmit={e => {
            e.preventDefault();
            search.setQuery(search.input);
          }}
        >
          <input
            className={styles.queryInput}
            value={search.input}
            onChange={e => search.setInput(e.target.value)}
            placeholder="Search Wikipedia"
          />
          <button
            className={styles.searchButton}
          >Search
          </button>
        </form>
      </header>
      <main className={styles.main}>
        {!search.query
          ? 'Enter a query to search'
          : !search.results
            ? <p className={styles.status}>Searching&hellip;</p>
            : <>
              <p className={styles.status}>{search.results.count}{search.results.more ? '+' : ''} result{search.results.count === 1 ? '' : 's'}</p>
              <ul className={styles.fullArticlesList}>
                {search.results.fullArticles.map(result => <li className={styles.resultsListEntry} key={result.id}><FullArticle {...result}/></li>)}
              </ul>
              <ul className={styles.basicArticlesList}>
                {search.results.basicArticles.map(result => <li className={styles.resultsListEntry} key={result.id}><BasicArticle {...result}/></li>)}
              </ul>
            </>}
      </main>
    </div>
  );
};
