#!/usr/bin/env node
/**
 * Lint alias table for case sensitivity issues
 * Used in CI to validate alias table follows best practices
 */

import { loadAliasTable } from '../dist/shared/aliases/resolver.js';
import { lintAliasTableCase } from '../test/shared/aliases/case-sensitivity.spec.mjs';

try {
  const aliasTable = loadAliasTable();
  const errors = lintAliasTableCase(aliasTable);

  if (errors.length === 0) {
    console.log('✅ Alias table passes case sensitivity checks');
    process.exit(0);
  } else {
    console.error('❌ Alias table has case sensitivity issues:');
    errors.forEach((err) => console.error('  -', err.message));
    process.exit(1);
  }
} catch (error) {
  console.error('Error linting alias table:', error.message);
  process.exit(1);
}
