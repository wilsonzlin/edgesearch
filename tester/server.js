const express = require('express');
const fs = require('fs');
const minimist = require('minimist');
const path = require('path');
const request = require('request');

const args = minimist(process.argv.slice(2));

const OUTPUT_DIR = args['output-dir'];
const PORT = args['port'];
const KV_PORT = args['kv-port'];

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

const makeKvRequest = path => new Promise((resolve, reject) => request(`http://localhost:${KV_PORT}${path}`, {encoding: null}, (err, res, body) => {
  if (err) {
    return reject(err);
  }
  if (res.statusCode === 404) {
    return resolve(null);
  }
  if (res.statusCode !== 200) {
    return reject(new Error(`Bad status from KV server: ${res.statusCode}`));
  }
  return resolve(body);
}));

global.KV = {
  async get (key, format) {
    let value;
    if (key === 'default') {
      value = await makeKvRequest(`/default`);
    } else if (key.startsWith('doc_')) {
      value = await makeKvRequest(`/doc/${key.slice(4)}`);
    } else if (key.startsWith('normal_terms_')) {
      value = await makeKvRequest(`/normal_terms/${key.slice(13)}`);
    } else if (key.startsWith('popular_terms_')) {
      value = await makeKvRequest(`/popular_terms/${key.slice(14)}`);
    } else {
      throw new Error(`Unknown KV key: ${key}`);
    }
    if (value === null) {
      return null;
    }
    switch (format) {
    case 'text':
      return value.toString();
    case 'json':
      return JSON.parse(value.toString());
    case 'arrayBuffer':
      return value.buffer;
    default:
      throw new Error(`Unimplemented format: ${format}`);
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
