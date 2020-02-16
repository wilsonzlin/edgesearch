import React from 'react';
import styles from './App.module.css';
import {useSearch} from '../search/search';
import {FullArticle} from '../FullArticle/FullArticle';
import {BasicArticle} from '../BasicArticle/BasicArticle';

export const App = () => {
  const search = useSearch();

  return (
    <div>
      <header className={styles.header}>
        <input
          className={styles.queryInput}
          value={search.query}
          onChange={e => search.setQuery(e.target.value)}
          placeholder="Search Wikipedia"
        />
      </header>
      <main className={styles.main}>
        {!search.results
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
