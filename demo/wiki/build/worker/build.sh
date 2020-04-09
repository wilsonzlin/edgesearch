#!/usr/bin/env bash

set -euo pipefail

pushd "$(dirname "$0")" >/dev/null

mkdir -p ../../dist/worker
../../../../target/release/edgesearch build \
  --documents ../data/documents.txt \
  --document-encoding text \
  --document-terms ../data/terms.txt \
  --maximum-query-results 50 \
  --output-dir ../../dist/worker

popd >/dev/null
