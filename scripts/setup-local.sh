#!/bin/bash
# Initialize .smartergpt/lex/ with working files
# This script is idempotent and safe to run multiple times

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Create working directory
mkdir -p "$REPO_ROOT/.smartergpt/lex"

# Initialize working policy if it doesn't exist
if [ ! -f "$REPO_ROOT/.smartergpt/lex/lexmap.policy.json" ]; then
  if [ -f "$REPO_ROOT/src/policy/policy_spec/lexmap.policy.json.example" ]; then
    cp "$REPO_ROOT/src/policy/policy_spec/lexmap.policy.json.example" \
       "$REPO_ROOT/.smartergpt/lex/lexmap.policy.json"
    echo "✅ Created working policy at .smartergpt/lex/lexmap.policy.json"
  elif [ -f "$REPO_ROOT/src/policy/policy_spec/lexmap.policy.json" ]; then
    # Fallback for transition period
    cp "$REPO_ROOT/src/policy/policy_spec/lexmap.policy.json" \
       "$REPO_ROOT/.smartergpt/lex/lexmap.policy.json"
    echo "✅ Created working policy at .smartergpt/lex/lexmap.policy.json"
  else
    echo "⚠️  Warning: No policy template found, skipping policy initialization"
  fi
else
  echo "✓ Working policy already exists at .smartergpt/lex/lexmap.policy.json"
fi

# Note about database - will be created automatically by the application
echo "ℹ️  Database will be created at .smartergpt/lex/memory.db on first use"

# Set up git hooks
if [ -d "$REPO_ROOT/.githooks" ]; then
  git config core.hooksPath .githooks
  chmod +x "$REPO_ROOT/.githooks/"* 2>/dev/null || true
  echo "✅ Git hooks enabled (pre-commit, pre-push)"
else
  echo "⚠️  Warning: .githooks directory not found, skipping hooks setup"
fi
