#!/usr/bin/env bash

set -e

pushd "$(dirname "$0")"

pushd script
npm i
npm run build
popd

popd
