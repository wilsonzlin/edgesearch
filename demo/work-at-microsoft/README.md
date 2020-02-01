# [work-at-microsoft.wilsonl.in](https://work-at-microsoft.wilsonl.in/jobs)

An at-edge web service + app for finding careers at Microsoft.
Faster and more precise than the official website, and comes with a nice UI.
The result of a weekend project trying to find a better way to search.

## Features

- Uses bit fields to search for keywords very quickly, efficiently, and accurately
- All data is stored in a few MBs of memory as code&mdash;no database or storage required
- Runs on Cloudflare Workers and WebAssembly for extremely fast, scalable performance
- Clean, responsive UI using vanilla JS and Microsoft Fabric design

## Improvements

This app allows the combining of simple filters to form advanced, precise queries.
Combined with the performance optimisations, it delivers far more filtered results in usually under a second.

As an example, during a test run, searching for "machine learning researcher engineer" returned over 3000 results, while taking around 2 seconds.
Searching for `title requires machine learning + title contains researcher or engineer` gave 8 results in less than 50 milliseconds.

For a UI comparison, see the [screenshots folder](screenshots).

## Technical

### Data

All jobs available on careers.microsoft.com are scraped and transformed into an array of simpler JSON objects.
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

The `title`, `location`, and `description` fields are searchable. This means that their words have to be indexed using bit fields.

### Bit fields

All words in a searchable field (not bit field) are combined to form a set of words.
A bit field of *n* bytes, where *n* is the amount of jobs, is created for each word in the field.
A bit is set to 1 if its corresponding job has the word in its field, otherwise it is set to 0.

A bit field has some advantages:

- Space efficient, as it can represent 8 jobs per byte
- Very fast, as searching involves bitwise vector operations, which can be even faster with SIMD
- 100% accurate compared to bloom filters
- Consistent performance compared to hash-based structures

Dedicated C code is used to do the bitwise operations (via WebAssembly),
with all the bit fields directly stored in code,
for extremely fast performance.

### Searching

Searching is done by looking for words in a field.
There are three modes for each word:

- require: the word must exist in the field
- contain: at least one word with this mode must exist in the field
- exclude: the word must not exist in the field

The results are generated by doing bitwise operations across multiple bit fields.
The general algorithm can be summarised as:

```c
result = (req_a & req_b & req_c & ...) & (con_a | con_b | con_c | ...) & ~(exc_a | exc_b | exc_c | ...)
```

Bits set in the resulting bit field are mapped to the job at their corresponding positions.

### Cloudflare

The entire app runs off a single JS script + accompanying WASM code. It does not need any database or storage, and uses Cloudflare Workers. This allows some cool features:

- faster than a VM or container with less cold starts, as code is run on a V8 Isolate
- naturally distributed to the edge for very low latency, despite being dynamic code
- takes advantage of Cloudflare for SSL, caching, and protection
- no need to worry about scaling, networking, or servers

The job listings data is embedded within the JS code, and the bit fields are `uint64_t` array literals in the C code.

## Code

### Back-end

The worker code can be found in the [`worker`](worker/) directory. The JS worker is called `worker.js` and the WASM code is in `worker.c`.

### Front-end

All the app files are located in [`client`](client/):

- `page.hbs`: main HTML file, written as a Handlebars template to remove repetition and allow conditional content
- `script.js`: custom JS that contains logic for autocomplete, animations, searching, and general UX
- `style.css`: styling for the app
- various external libraries and styles
- `assets/*`: files relating to app metadata, such as `favicon.ico`

All files except for `assets/*` are minified and bundled together into one HTML file to reduce the file size and amount of round trips required for the end user.

### Data

Data retrieval is done by [`data/data.ts`](build/data/retrieve.js), while processing is done by [`data/process.js`](build/data/process.js).

### Build

Both the worker and client app need to be built. [`client.ts`](build-client.js) and [`build-worker.js`](build-worker.js) take care of building.

Building the worker requires at least clang 7 and lld 7. 