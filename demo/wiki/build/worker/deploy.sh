#!/usr/bin/env bash

set -euo pipefail

pushd "$(dirname "$0")" >/dev/null

../../../../target/release/edgesearch deploy \
  --default-results ../data/default-results.txt \
  --account-id $CF_ACCOUNT_ID \
  --account-email $CF_ACCOUNT_EMAIL \
  --global-api-key $CF_GLOBAL_API_KEY \
  --name $CF_WORKER_NAME \
  --output-dir ../../dist/worker \
  --namespace $CF_KV_NAMESPACE_ID \
  --upload-data

popd >/dev/null
