#!/usr/bin/env bash

set -euo pipefail

pushd "$(dirname "$0")" >/dev/null

../../../deployer/cloudflare/dist/main.js \
  --account-id $CF_ACCOUNT_ID \
  --account-email $CF_ACCOUNT_EMAIL \
  --global-api-key $CF_GLOBAL_API_KEY \
  --name $CF_WORKER_NAME \
  --output-dir build

b2 sync build/documents/ b2://$B2_BUCKET/$B2_PATH/documents/
b2 sync build/terms/ b2://$B2_BUCKET/$B2_PATH/terms/

popd >/dev/null
