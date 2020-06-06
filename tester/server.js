const express = require('express');
const fs = require('fs');
const minimist = require('minimist');
const path = require('path');

const args = minimist(process.argv.slice(2));

const OUTPUT_DIR = args['output-dir'];
const DEFAULT_RESULTS = args['default-results'];
const PORT = args['port'];

function* readChunks (file) {
  const fd = fs.openSync(file);
  const u32Buffer = Buffer.alloc(4);
  while (fs.readSync(fd, u32Buffer, 0, 4)) {
    const chunkLen = u32Buffer.readUInt32BE(0);
    const buffer = Buffer.alloc(chunkLen);
    fs.readSync(fd, buffer, 0, chunkLen);
    yield buffer.buffer;
  }
}

const workerScript = fs.readFileSync(path.join(OUTPUT_DIR, 'worker.js'), 'utf8');
const runnerWasm = fs.readFileSync(path.join(OUTPUT_DIR, 'runner.wasm'));

let onFetch;

global.Response = class Response {
  constructor (body = null, init = {}) {
    this.body = body;
    this.init = init;
  }

  headers () {
    return this.init.headers || {};
  }

  status () {
    return this.init.status || 200;
  }
};

const defaultResults = fs.readFileSync(DEFAULT_RESULTS, 'utf8');
const documentsChunks = [...readChunks(path.join(OUTPUT_DIR, 'documents.packed'))];
const termsChunks = [...readChunks(path.join(OUTPUT_DIR, 'terms.packed'))];

global.KV = {
  async get (key) {
    if (key === 'default') {
      return defaultResults;
    } else if (key.startsWith('doc_')) {
      return documentsChunks[key.slice(4)];
    } else if (key.startsWith('terms_')) {
      return termsChunks[key.slice(13)];
    } else {
      throw new Error(`Unknown KV key: ${key}`);
    }
  },
};

global.QUERY_RUNNER_WASM = new WebAssembly.Module(runnerWasm);

global.self = {
  addEventListener (eventName, handler) {
    switch (eventName) {
    case 'fetch':
      onFetch = handler;
      break;
    default:
      throw new TypeError(`Unknown event name: ${eventName}`);
    }
  },
};

Function(workerScript)();

const server = express();

server.use(async (req, res) => {
  onFetch({
    request: {
      url: `http://localhost:${PORT}${req.url}`,
    },
    async respondWith (responsePromise) {
      const response = await responsePromise;
      res.status(response.status());
      for (const [name, value] of Object.entries(response.headers())) {
        res.setHeader(name, value);
      }
      res.send(response.body);
    },
  });
});

server.listen(PORT, () => console.log(`Test server started on ${PORT}`));
