import * as Edgesearch from 'edgesearch-client';
import {OomlClass, ViewTemplate} from 'ooml';
import styles from './App.css';

type EdgesearchResult = {
  id: string;
  url: string;
  title: string;
  date: string;
  location: string;
  preview: string;
  description: string;
};

const client = new Edgesearch.Client<EdgesearchResult>('https://jobs.wlin.workers.dev');

@OomlClass
class Result {
  id: string = '';
  url: string = '';
  title: string = '';
  date: string = '';
  location: string = '';
  preview: string = '';
  description: string = '';

  [ViewTemplate] = (
    <div>
      <h2>{this.title}</h2>
      <p>{this.description}</p>
    </div>
  );
}

@OomlClass
export class App {
  query: string = '';
  results: EdgesearchResult[] = [];

  queryChangeHandler = (e: InputEvent) => {
    const $input = e.target as HTMLInputElement;
    client.search(new Edgesearch.Query().add(
      Edgesearch.Mode.REQUIRE,
      ...$input.value.split(/[^a-zA-Z0-9]+/).filter(t => t).map(t => `title_${t.toLowerCase()}`),
    ))
      .then(results => this.results = results.results.map(r => Object.assign(new Result(), r)));
  };

  [ViewTemplate] = (
    <div className={styles.app}>
      <input value={this.query} onChange={this.queryChangeHandler}/>
      <div>
        {this.results}
      </div>
    </div>
  );
}
