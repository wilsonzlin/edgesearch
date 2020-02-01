#!/usr/bin/env bash

set -e

err() {
  echo "$1"
  exit 1
}

if [ -z "$CF_ACCOUNT_ID" ]; then
  err 'CF_ACCOUNT_ID missing'
fi

if [ -z "$CF_SCRIPT_NAME" ]; then
  err 'CF_SCRIPT_NAME missing'
fi

if [ -z "$CF_API_TOKEN" ]; then
  err 'CF_API_TOKEN missing'
fi

if [ -z "$METADATA_FILE" ]; then
  err 'METADATA_FILE missing'
fi

if [ -z "$SCRIPT_FILE" ]; then
  err 'SCRIPT_FILE missing'
fi

if [ -z "$WASM_FILE" ]; then
  err 'WASM_FILE missing'
fi

curl -X PUT "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts/$CF_SCRIPT_NAME" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -F "metadata=@$METADATA_FILE;type=application/json" \
  -F "script=@$SCRIPT_FILE;type=application/javascript" \
  -F "wasm=@$WASM_FILE;type=application/wasm"
