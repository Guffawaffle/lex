#!/usr/bin/env bash
set -euo pipefail
# Run ci.sh in the same container image but disable network
IMAGE="${1:-lex-ci:local}"
docker run --rm --network=none -v "$PWD":/work -w /work "${IMAGE}" bash -lc "./scripts/ci.sh"
