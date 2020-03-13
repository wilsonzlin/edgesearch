# Edgesearch

Build a full text search API using Cloudflare Workers and WebAssembly.

## Features

- Uses an [inverted index](https://en.wikipedia.org/wiki/Inverted_index) and [compressed bit sets](https://roaringbitmap.org/) stored in [Cloudflare Workers KV](https://www.cloudflare.com/products/workers-kv/).
- Packs multiple index entries and documents, storing large amounts of data in relatively few keys&mdash;no database or server required.
- Runs on Cloudflare Workers at edge locations with WebAssembly code for fast, scalable performance.

## Demos

Check out the [demo](./demo) folder for live demos with source code.

## How it works

Assume we want to index a collection of documents, where a **document** is simply any nonempty UTF-8 sequence of characters. When searching, we are trying to find any documents that match one or more **terms**, which are also simply any nonempty UTF-8 sequence of characters.

The documents and their associated terms are provided to Edgesearch to build an index using `edgesearch build`. The relation between a document's terms and content is irrelevant to Edgesearch and terms do not necessarily have to be words from the document.

Edgesearch will then use the data to create code and data files ready to be deployed to Cloudflare using `edgesearch deploy`. The worker can also be tested locally by running `edgesearch test`.

### Data

The contents of every document are provided in a file. Each document is sequentially assigned an ID, starting from zero. Another file is provided which has the corresponding terms for each document.

Edgesearch will build a reverse index by mapping each term to a compressed bit set (using Roaring Bitmaps) of document IDs representing documents containing the term.

Each Cloudflare Workers KV entry can hold a value up to 10 MiB in size, and charges per read/write of an entry.

For the top few terms by frequency, their bit sets are packed into the minimum amount of entries able to store them. Their key and byte offset within the entry's value are recorded and stored in the worker's JS code as a map.

The remaining terms and all documents are sorted and also packed into entries. However, instead of storing each term's/document's key and offset, only the first term/document in an entry is stored in the JS code alongside the position of the middle term/document in the key.

When searching for the corresponding bit set for a term, if the term is in the popular terms map, the bit set is simply retrieved directly from Cloudflare Workers KV. If it's not, a binary search is done to find the entry containing the term's bit set, and then a binary search is done in the entry's value to find the bit set. Retrieving the contents of a document uses the same binary search approach.

Packing multiple bit sets/documents reduces costs and deploy times, especially for large datasets. It also improves caching. For example, the [English Wikipedia demo](./demo/wiki/) has 13.4 million documents and 2.3 million terms, which when packed results in only 66 entries.

### Searching

Searching is done by looking for terms in a document.
There are three modes for each term:

- require: the term must exist in the document
- contain: at least one term with this mode must exist in the document
- exclude: the term must not exist in the document

The results are generated by doing bitwise operations across multiple bit sets.
The general computation could be summarised as:

```c
result = (req_a & req_b & req_c & ...) & (con_a | con_b | con_c | ...) & ~(exc_a | exc_b | exc_c | ...)
```

### Cloudflare

The entire app runs off a single JavaScript script + accompanying WASM code. It does not need any database or server, and uses Cloudflare Workers. This allows for some nice advantages:

- Faster than a VM or container with less cold starts, as code is run on a V8 Isolate.
- Naturally distributed to the edge for very low latency.
- Takes advantage of Cloudflare for SSL, caching, and distribution.
- No need to worry about scaling, networking, or servers.

### WebAssembly

The [C implementation](https://github.com/RoaringBitmap/CRoaring) of Roaring Bitmaps is compiled to WebAssembly. A [basic implementation](./wasm/) of essential C standard library functionality is implemented to make compilation possible.

## Usage

### Get the CLI

[Windows](https://wilsonl.in/edgesearch/bin/0.0.6-windows-x86_64.exe) |
[Linux](https://wilsonl.in/edgesearch/bin/0.0.6-linux-x86_64)

### Build the worker

The data needs to be formatted into three files:

- *Documents*: contents of all documents, delimited by NULL ('\0'), including at the end.
- *Document terms*: terms for each corresponding document. Each term and document must end with NULL ('\0').
- *Default results*: the JSON-serialised array of results to return when not querying by any term.

For example:

|File|Contents|
|---|---|
|documents.txt|`{"title":"Stupid Love","artist":"Lady Gaga","year":2020}` `\0` <br> `{"title":"Don't Start Now","artist":"Dua Lipa","year":2020}` `\0` <br> ...|
|document-terms.txt|`title_stupid` `\0` `title_love` `\0` `artist_lady` `\0` `artist_gaga` `\0` `year_2020` `\0` `\0` <br> `title_dont` `\0` `title_start` `\0` `title_now` `\0` `artist_dua` `\0` `artist_lipa` `\0` `year_2020` `\0` `\0` <br> ...|
|default-results.txt|`[{"title":"Stupid Love","artist":"Lady Gaga","year":2020},{"title":"Don't Start Now","artist":"Dua Lipa","year":2020}]`|

An folder needs to be provided for Edgesearch to write temporary and built code and data files. It's advised to provide a folder for the exclusive use of Edgesearch with no other contents.

```bash
edgesearch build \
  --documents documents.txt \
  --document-terms document-terms.txt \
  --maximum-query-results 20 \
  --output-dir dist/worker/
```

### Deploy the worker

This will upload the worker script and associated WASM to Cloudflare Workers, and write every key to Cloudflare Workers KV.

```bash
edgesearch deploy \
  --default-results default.txt \ 
  --account-id CF_ACCOUNT_ID \
  --account-email me@email.com \ 
  --global-api-key CF_GLOBAL_API_KEY \
  --name my-edgesearch \
  --output-dir dist/worker/ \
  --namespace CF_KV_NAMESPACE_ID \
  --upload-data
```

### Calling the API

A [client](./client/) for the browser is available for using a deployed Edgesearch worker:

```typescript
import * as Edgesearch from 'edgesearch-client';

type Document = {
  id: string;
  title: string;
  description: string;
};

const client = new Edgesearch.Client<Document>('my-edgesearch.me.workers.dev');
const query = new Edgesearch.Query();
query.add(Edgesearch.Mode.REQUIRE, 'world');
query.add(Edgesearch.Mode.CONTAIN, 'hello', 'welcome', 'greetings');
query.add(Edgesearch.Mode.EXCLUDE, 'bye', 'goodbye');
const results = await client.search(query);
```

## Performance

The code is reasonably fast, so most of the latency will arise from how cached the script and Workers KV data are at Cloudflare edge locations.

Keys that are not frequently retrieved from Workers KV will take longer to retrieve due to cache misses from edge locations. The script and accompanying WASM binary may not be present at edge locations if not executed frequently. Therefore, for consistent low-latency request responses, ensure that there is constant traffic hitting the worker to keep code and data at the edge.
