#!/usr/bin/env bash

set -euo pipefail

pushd "$(dirname "$0")" >/dev/null

node ../../../tester/server.js \
  --output-dir build \
  --port 8180 \
  --default-results ../data/build/default.json

popd >/dev/null
