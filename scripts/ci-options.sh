#!/usr/bin/env bash

LEX_CI_PRETTY=0

lex_ci_usage() {
  cat >&2 <<'EOF'
Usage: ./scripts/ci.sh [--pretty|--prettier]

  --pretty    Add a check-only repository-wide Prettier audit.
  --prettier  Exact alias for --pretty.
EOF
}

lex_ci_parse_options() {
  local option
  for option in "$@"; do
    case "$option" in
      --pretty | --prettier)
        LEX_CI_PRETTY=1
        ;;
      *)
        echo "Unknown developer-validation option: $option" >&2
        lex_ci_usage
        return 2
        ;;
    esac
  done
}

lex_ci_run_optional_audits() {
  if [[ "$LEX_CI_PRETTY" -eq 1 ]]; then
    echo "==> Required validation completed OK"
    echo "==> Optional repository-wide Prettier audit (check-only)"
    npm run format:check
  fi
}
