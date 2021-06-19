#!/usr/bin/env node

const express = require('express');
const fs = require('fs');
const minimist = require('minimist');
const path = require('path');

const args = minimist(process.argv.slice(2));

const OUTPUT_DIR = args['output-dir'];
const PORT = args['port'];

const workerScript = fs.readFileSync(path.join(OUTPUT_DIR, 'worker.js'), 'utf8');
const runnerWasm = fs.readFileSync(path.join(OUTPUT_DIR, 'runner.wasm'));

let onFetch;

const readBuffer = path => fs.promises.readFile(path).then(res => res.buffer);

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

global.TransformStream = class TransformStream {
  constructor () {
    this.bufferedWrites = [];
    this.writer = {
      write: data => this.bufferedWrites.push(data),
      releaseLock: () => void 0,
    };
  }

  get readable() {
    return Buffer.concat(this.bufferedWrites);
  }

  get writable() {
    return {
      getWriter: () => this.writer,
    };
  }
}

global.KV = {
  async get (key) {
    const [prefix, id] = key.split('/');
    if (!['documents', 'terms'].includes(prefix) || !/^[0-9]+$/.test(id)) {
      throw new Error(`Unknown KV key: ${key}`);
    }
    return readBuffer(path.join(OUTPUT_DIR, prefix, id));
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
