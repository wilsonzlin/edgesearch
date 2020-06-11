#!/usr/bin/env bash

set -euo pipefail

pushd "$(dirname "$0")" >/dev/null

../../../target/release/edgesearch deploy \
  --account-id $CF_ACCOUNT_ID \
  --account-email $CF_ACCOUNT_EMAIL \
  --global-api-key $CF_GLOBAL_API_KEY \
  --name $CF_WORKER_NAME \
  --output-dir build \
  --namespace $CF_KV_NAMESPACE_ID \
  --upload-data

popd >/dev/null
