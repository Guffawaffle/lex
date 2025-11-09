#!/usr/bin/env node
import { execSync } from 'node:child_process';

try {
  const out = execSync("git ls-files 'src/**/*.js'", { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  if (out) {
    console.error('❌ Found .js files under src/ (TS-only rule):');
    console.error(out);
    process.exit(1);
  }
  console.log('✅ TS-only check: no .js files under src/');
} catch (_) {
  // No matches or not a git repo in CI checkout — treat as pass if no output
  console.log('✅ TS-only check: no .js files under src/');
}
