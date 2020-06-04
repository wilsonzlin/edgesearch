#!/usr/bin/env bash

set -euo pipefail

pushd "$(dirname "$0")" >/dev/null

mkdir -p build
../../../target/release/edgesearch build \
  --documents ../data/build/docs.txt \
  --document-encoding text \
  --document-terms ../data/build/terms.txt \
  --maximum-query-results 50 \
  --output-dir build

popd >/dev/null
