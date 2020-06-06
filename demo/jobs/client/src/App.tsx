import * as Edgesearch from 'edgesearch-client';
import {OomlClass, ViewTemplate} from 'ooml';
import styles from './App.css';

type EdgesearchResult = {
  company: string;
  date: string;
  description: string;
  id: string;
  location: string;
  preview: string;
  title: string;
  url: string;
};

const client = new Edgesearch.Client<EdgesearchResult>('https://jobs.wlin.workers.dev');

@OomlClass
class Result {
  company: string = '';
  date: string = '';
  description: string = '';
  id: string = '';
  location: string = '';
  preview: string = '';
  title: string = '';
  url: string = '';

  expanded: boolean = false;

  expandButtonClickHandler = () => {
    this.expanded = true;
  };

  collapseButtonClickHandler = () => {
    this.expanded = false;
  };

  [ViewTemplate] = (
    <div className={styles.Result}>
      <h2 className={styles.ResultTitle}><a href={this.url} target="_blank" rel="noopener">{this.title}</a></h2>
      <div className={styles.ResultSubtitle}>
        <p>{this.date} | {this.company}</p>
        <p>{this.location}</p>
      </div>
      <p hidden={this.expanded}>{this.preview}</p>
      <button hidden={this.expanded} onClick={this.expandButtonClickHandler}>More</button>
      <p hidden={!this.expanded}>{this.description}</p>
      <button hidden={!this.expanded} onClick={this.collapseButtonClickHandler}>Less</button>
    </div>
  );
}

@OomlClass
export class App {
  results: EdgesearchResult[] = [];

  formSubmitHandler = (e: Event) => {
    e.preventDefault();
    const $form = e.target as HTMLFormElement;

    const query = new Edgesearch.Query();
    for (const $input of $form.elements) {
      if ($input instanceof HTMLInputElement) {
        for (const term of $input.value.split(/\s+/)) {
          const [_, prefix, word] = /^([-~]?)([a-zA-Z0-9]+)$/.exec(term) || [];
          if (!word) {
            continue;
          }
          query.add(
            prefix === '-' ? Edgesearch.Mode.EXCLUDE : prefix === '~' ? Edgesearch.Mode.CONTAIN : Edgesearch.Mode.REQUIRE,
            `${$input.name}_${word.toLowerCase()}`,
          );
        }
      }
    }

    client.search(query)
      .then(results => this.results = results.results.map(r => Object.assign(new Result(), r)));
  };

  [ViewTemplate] = (
    <div className={styles.App}>
      <form className={styles.Form} onSubmit={this.formSubmitHandler}>
        <input name="company" placeholder="Company"/>
        <input name="title" placeholder="Title"/>
        <input name="location" placeholder="Location"/>
        <input name="description" placeholder="Description"/>
        <button type="submit">Search</button>
      </form>
      <div className={styles.Results}>
        {this.results}
      </div>
    </div>
  );
}
