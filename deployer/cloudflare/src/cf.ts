import request from 'request';

export type CFAuth = {
  accountId: string;
  accountEmail: string;
  globalApiKey: string;
};

export type CFResponse<Result> = {
  success: boolean;
  errors: { code: number; message: string; }[];
  messages: string[];
  result: Result;
};

class FormData {
  readonly entries = {};

  add (key: string, value: Buffer | string): this {
    this.entries[key] = value;
    return this;
  }
}

const makeRequest = <Result> ({
  method,
  auth,
  path,
  body,
}: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  auth: CFAuth;
  path: string;
  body: Buffer | FormData;
}): Promise<CFResponse<Result>> =>
  new Promise((resolve, reject) =>
    request({
      method,
      uri: `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}${path}`,
      headers: {
        'X-Auth-Email': auth.accountEmail,
        'X-Auth-Key': auth.globalApiKey,
      },
      ...(body instanceof FormData ? {formData: body.entries} : {body}),
    }, (error, {statusCode, body}) => {
      if (error) {
        return reject(error);
      }

      if (statusCode < 200 || statusCode > 299) {
        return reject(new Error(`Request to ${path} failed with status ${statusCode}: ${body}`));
      }

      if (typeof body != 'string') {
        return reject(new TypeError(`Received response that was not text: ${body}`));
      }

      resolve(JSON.parse(body));
    }));

export const uploadKv = ({
  auth,
  key,
  value,
  namespaceId,
}: {
  auth: CFAuth;
  key: string;
  value: Buffer;
  namespaceId: string;
}) =>
  makeRequest<undefined>({
    auth,
    method: 'PUT',
    path: `/storage/kv/namespaces/${namespaceId}/values/${key}`,
    body: value,
  });

export const publishWorker = ({
  auth,
  name,
  script,
  wasm,
  kvNamespaceId,
}: {
  auth: CFAuth;
  name: string;
  script: Buffer;
  wasm: Buffer;
  kvNamespaceId: string;
}) =>
  makeRequest<{
    script: string;
    etag: string;
    size: number;
    modified_on: string;
  }>({
    auth,
    method: 'PUT',
    path: `/workers/scripts/${name}`,
    body: new FormData()
      .add('metadata', JSON.stringify({
        body_part: 'script',
        bindings: [
          {
            name: 'QUERY_RUNNER_WASM',
            type: 'wasm_module',
            part: 'wasm',
          },
          {
            name: 'KV',
            type: 'kv_namespace',
            namespace_id: kvNamespaceId,
          },
        ],
      }))
      .add('script', script)
      .add('wasm', wasm),
  });
