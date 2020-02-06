import {Worker} from './build';
import * as request from 'request-promise-native';

const METADATA = {
  body_part: 'script',
  bindings: [
    {
      name: 'QUERY_RUNNER_WASM',
      type: 'wasm_module',
      part: 'wasm',
    },
  ],
};

const docsKvNamespace = (name: string) => `EDGESEARCH_${name}_DOCS`;

export const deploy = async ({
  accountId,
  apiToken,
  name,
  worker,
}: {
  accountId: string,
  apiToken: string,
  name: string,
  worker: Worker,
}) => {
  const auth = {
    Authorization: `Bearer ${apiToken}`,
  };

  console.log(`Uploading worker...`);
  await request.put(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${name}`, {
    headers: auth,
    formData: {
      metadata: JSON.stringify(METADATA),
      script: worker.js,
      wasm: worker.wasm,
    },
  });

  const kvNs = docsKvNamespace(name);

  let nextDocId = 0;
  while (nextDocId < worker.docs.length) {
    console.log(`Inserting documents from ${nextDocId}...`);
    await request.put(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNs}/bulk`, {
      headers: {
        'Content-Type': 'application/json',
        ...auth,
      },
      body: JSON.stringify(worker.docs.slice(nextDocId, nextDocId += 10000).map((d, i) => ({
        key: `${i}`,
        value: d,
      }))),
    });
  }
};
