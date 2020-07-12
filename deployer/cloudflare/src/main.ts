#!/usr/bin/env node

import {deploy} from './deploy';
import * as sacli from 'sacli';

const cli = sacli.build({
  name: 'edgesearch-deploy-cloudflare',
  commands: [
    {
      name: '',
      description: 'Deploy a built Edgesearch worker to Cloudflare Workers and Cloudflare Workers KV',
      options: [
        {
          name: 'account-email',
          alias: 'e',
          type: String,
          typeLabel: 'me@email.com',
          description: 'Cloudflare account email address',
        },
        {
          name: 'account-id',
          alias: 'i',
          type: String,
          typeLabel: '<id>',
          description: 'Cloudflare account ID',
        },
        {
          name: 'global-api-key',
          alias: 'k',
          type: String,
          typeLabel: '<key>',
          description: 'Cloudflare global API key',
        },
        {
          name: 'name',
          alias: 'n',
          type: String,
          typeLabel: 'my-worker',
          description: 'Cloudflare worker name',
        },
        {
          name: 'namespace',
          alias: 's',
          type: String,
          typeLabel: '<id>',
          description: 'Cloudflare Workers KV namespace ID',
        },
        {
          name: 'output-dir',
          alias: 'o',
          type: String,
          typeLabel: '<path>',
          description: 'Path to build output directory',
        },
        {
          name: 'upload-data',
          alias: 'u',
          type: Boolean,
          description: 'Upload KV entries alongside worker',
        },
      ],
      action: (args: any) => {
        deploy({
          accountEmail: args['account-email'],
          accountId: args['account-id'],
          globalApiKey: args['global-api-key'],
          name: args['name'],
          kvNamespaceId: args['namespace'],
          outputDir: args['output-dir'],
          uploadData: !!args['upload-data'],
        }).catch(err => {
          console.error(err);
          process.exit(1);
        });
      },
    },
  ],
});

sacli.exec(process.argv.slice(2), cli);
