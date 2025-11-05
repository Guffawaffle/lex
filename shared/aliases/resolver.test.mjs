/**
 * Tests for Module ID Alias Resolver
 *
 * Run with: node shared/aliases/resolver.test.mjs
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { resolveModuleId, loadAliasTable, clearAliasTableCache } from './dist/aliases/resolver.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Sample policy for testing
const samplePolicy = {
  modules: {
    'services/auth-core': {
      description: 'Core authentication service',
      owns_paths: ['services/auth/**']
    },
    'services/user-access-api': {
      description: 'User access API layer',
      owns_paths: ['services/userAccess/**']
    },
    'ui/user-admin-panel': {
      description: 'User admin panel UI',
      owns_paths: ['web-ui/userAdmin/**']
    }
  }
};

// Sample alias table for testing
const sampleAliasTable = {
  aliases: {
    'auth-core': {
      canonical: 'services/auth-core',
      confidence: 1.0,
      reason: 'shorthand'
    },
    'user-api': {
      canonical: 'services/user-access-api',
      confidence: 1.0,
      reason: 'shorthand'
    },
    'old-auth-service': {
      canonical: 'services/auth-core',
      confidence: 1.0,
      reason: 'refactored 2025-10-15'
    }
  }
};

describe('resolveModuleId', () => {
  test('exact match bypasses alias lookup (performance optimization)', async () => {
    const result = await resolveModuleId('services/auth-core', samplePolicy);

    assert.equal(result.canonical, 'services/auth-core');
    assert.equal(result.confidence, 1.0);
    assert.equal(result.original, 'services/auth-core');
    assert.equal(result.source, 'exact');
  });

  test('alias maps to canonical ID with confidence 1.0', async () => {
    const result = await resolveModuleId('auth-core', samplePolicy, sampleAliasTable);

    assert.equal(result.canonical, 'services/auth-core');
    assert.equal(result.confidence, 1.0);
    assert.equal(result.original, 'auth-core');
    assert.equal(result.source, 'alias');
  });

  test('multiple aliases can point to same canonical ID', async () => {
    const result1 = await resolveModuleId('auth-core', samplePolicy, sampleAliasTable);
    const result2 = await resolveModuleId('old-auth-service', samplePolicy, sampleAliasTable);

    assert.equal(result1.canonical, 'services/auth-core');
    assert.equal(result2.canonical, 'services/auth-core');
    assert.equal(result1.source, 'alias');
    assert.equal(result2.source, 'alias');
  });

  test('unknown input returns original with confidence 0', async () => {
    const result = await resolveModuleId('unknown-module', samplePolicy, sampleAliasTable);

    assert.equal(result.canonical, 'unknown-module');
    assert.equal(result.confidence, 0);
    assert.equal(result.original, 'unknown-module');
    assert.equal(result.source, 'fuzzy');
  });

  test('empty alias table returns unknowns with confidence 0', async () => {
    const emptyAliasTable = { aliases: {} };
    const result = await resolveModuleId('auth-core', samplePolicy, emptyAliasTable);

    assert.equal(result.canonical, 'auth-core');
    assert.equal(result.confidence, 0);
    assert.equal(result.original, 'auth-core');
    assert.equal(result.source, 'fuzzy');
  });

  test('case sensitivity is preserved', async () => {
    const result = await resolveModuleId('Auth-Core', samplePolicy, sampleAliasTable);

    // 'Auth-Core' doesn't match 'auth-core' in alias table
    assert.equal(result.canonical, 'Auth-Core');
    assert.equal(result.confidence, 0);
    assert.equal(result.source, 'fuzzy');
  });
});

describe('loadAliasTable', () => {
  test('loads alias table from custom path', () => {
    // Create temporary alias table file
    const tmpDir = join(tmpdir(), 'lex-test-aliases-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const testAliasPath = join(tmpDir, 'test-aliases.json');
    
    const testAliasTable = {
      aliases: {
        'test-alias': {
          canonical: 'services/test',
          confidence: 1.0,
          reason: 'test'
        }
      }
    };
    
    writeFileSync(testAliasPath, JSON.stringify(testAliasTable, null, 2));

    // Clear cache and load from custom path
    clearAliasTableCache();
    const loaded = loadAliasTable(testAliasPath);

    assert.ok(loaded.aliases['test-alias']);
    assert.equal(loaded.aliases['test-alias'].canonical, 'services/test');

    // Cleanup
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('alias table caching works correctly', () => {
    clearAliasTableCache();
    
    const table1 = loadAliasTable();
    const table2 = loadAliasTable();

    // Should return same cached instance
    assert.strictEqual(table1, table2);
  });

  test('returns empty table if file not found', () => {
    clearAliasTableCache();
    const table = loadAliasTable('/nonexistent/path/aliases.json');

    assert.ok(table);
    assert.deepEqual(table.aliases, {});
  });
});

describe('integration with /remember flow', () => {
  test('resolves module IDs before validation', async () => {
    // Simulate user input with aliases
    const userInput = ['auth-core', 'services/user-access-api', 'user-api'];
    
    const resolved = await Promise.all(
      userInput.map(id => resolveModuleId(id, samplePolicy, sampleAliasTable))
    );

    // All should resolve to canonical IDs
    assert.equal(resolved[0].canonical, 'services/auth-core');
    assert.equal(resolved[1].canonical, 'services/user-access-api');
    assert.equal(resolved[2].canonical, 'services/user-access-api');

    // Extract canonical IDs for storage
    const canonicalIds = resolved.map(r => r.canonical);
    assert.deepEqual(canonicalIds, [
      'services/auth-core',
      'services/user-access-api',
      'services/user-access-api'
    ]);
  });

  test('unknown aliases should be detected after resolution', async () => {
    const userInput = ['auth-core', 'invalid-module'];
    
    const resolved = await Promise.all(
      userInput.map(id => resolveModuleId(id, samplePolicy, sampleAliasTable))
    );

    // Check which ones are unknown (confidence 0)
    const unknowns = resolved.filter(r => r.confidence === 0);
    assert.equal(unknowns.length, 1);
    assert.equal(unknowns[0].original, 'invalid-module');
  });
});
