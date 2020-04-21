# [wilsonl.in/msft](https://wilsonl.in/msft)

An at-edge web service + app for finding careers at Microsoft, built as a demo for [Edgesearch](https://github.com/wilsonzlin/edgesearch).

Faster and more precise than the official website, and comes with a nice UI.

![Screenshot of UI](./screenshots/this.png)

## Improvements

This app allows the combining of simple filters to form advanced, precise queries.
Combined with the performance optimisations of [Edgesearch](https://github.com/wilsonzlin/edgesearch), it delivers more filtered results in usually under a second.

For a UI comparison, see the [screenshots folder](./screenshots).

## Technical

### Data

All jobs available on careers.microsoft.com are fetched and processed into an array of JSON objects.
Each object represents a job, with fields describing some aspect of the job:

```json
{
  "ID": "19234",
  "title": "Azure Service Engineer",
  "description": "Hello world",
  "date": "2018-1-3",
  "location": "Redmond, Washington, United States"
}
```

The `title`, `location`, and `description` fields are searchable.

## Code

### Backend

The worker code is built using [Edgesearch](https://github.com/wilsonzlin/edgesearch). See the project for more details. To build and deploy the worker, see the [package.json scripts](./build/package.json).

Building the worker requires at least clang 7 and lld 7. The build scripts use a release build of Edgesearch from this repository, so build Edgesearch using `cargo build --release` before running them.

### Frontend

All the app files are located in [client](./client/):

- `page.hbs`: main HTML file, written as a Handlebars template to remove repetition and allow conditional content
- `script.js`: custom JS that contains logic for autocomplete, animations, searching, and general UX
- `style.css`: styling for the app
- various external libraries and styles
- `assets/*`: files relating to app metadata, such as `favicon.ico`

All files except for `assets/*` are minified and bundled together into one HTML file to reduce the file size and amount of round trips required for the end user. [client.ts](./build/client/client.ts) takes care of building, invoked by [npm run build-client](./build/package.json).

### Data

Data fetching and processing is done by [data.ts](./build/data/data.ts), invoked by [npm run build-data](./build/package.json).
