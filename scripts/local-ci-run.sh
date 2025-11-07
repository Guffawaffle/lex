#!/usr/bin/env bash
set -euo pipefail
IMAGE="lex-ci:local"

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  echo "==> Building ${IMAGE} from ci.Dockerfile"
  docker build -f ci.Dockerfile -t "${IMAGE}" .
fi

echo "==> Running local CI replica (network enabled)"
docker run --rm -it \
  -v "$PWD":/work -w /work \
  "${IMAGE}" \
  bash -lc "./scripts/ci.sh"
