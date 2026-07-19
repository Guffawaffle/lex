#!/usr/bin/env bash
set -euo pipefail
# Run ci.sh in the same container image but disable network
IMAGE="lex-ci:local"
if [[ $# -gt 0 && "$1" != --* ]]; then
  IMAGE="$1"
  shift
fi
docker run --rm --network=none \
  --user "$(id -u):$(id -g)" \
  -v "$PWD":/work -w /work \
  "${IMAGE}" \
  ./scripts/ci.sh "$@"
