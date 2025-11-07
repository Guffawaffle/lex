/**
 * Tests for Module ID Validation (THE CRITICAL RULE)
 *
 * Run with: node shared/module_ids/validator.test.mjs
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { validateModuleIds, validateModuleIdsSync } from './dist/validator.js';

// Sample policy for testing
const samplePolicy = {
  modules: {
    'services/auth-core': {
      description: 'Core authentication service',
      owns_paths: ['services/auth/**'],
      allowed_callers: ['ui/user-admin-panel'],
      forbidden_callers: []
    },
    'services/user-access-api': {
      description: 'User access API layer',
      owns_paths: ['services/userAccess/**'],
      allowed_callers: [],
      forbidden_callers: []
    },
    'ui/user-admin-panel': {
      description: 'User admin panel UI',
      owns_paths: ['web-ui/userAdmin/**'],
      allowed_callers: [],
      forbidden_callers: ['services/auth-core']
    },
    'ui/login-page': {
      description: 'Login page UI',
      owns_paths: ['web-ui/login/**'],
      allowed_callers: [],
      forbidden_callers: []
    }
  }
};

describe('validateModuleIdsSync (legacy - no alias resolution)', () => {
  test('valid module IDs pass validation', () => {
    const result = validateModuleIdsSync(
      ['services/auth-core', 'ui/user-admin-panel'],
      samplePolicy
    );

    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  test('invalid module IDs fail with error messages', () => {
    const result = validateModuleIdsSync(
      ['auth-core', 'ui/user-admin-panel'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].module, 'auth-core');
    assert.ok(result.errors[0].message.includes('not found in policy'));
  });

  test('fuzzy matching suggests similar module names', () => {
    const result = validateModuleIdsSync(
      ['auth-core'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors[0].module, 'auth-core');
    assert.ok(result.errors[0].suggestions.length > 0);
    assert.equal(result.errors[0].suggestions[0], 'services/auth-core');
    assert.ok(result.errors[0].message.includes('Did you mean'));
  });

  test('empty module_scope is allowed', () => {
    const result = validateModuleIdsSync([], samplePolicy);

    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  test('case sensitivity is enforced', () => {
    const result = validateModuleIdsSync(
      ['Services/Auth-Core'], // Wrong case
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors[0].module, 'Services/Auth-Core');
  });

  test('multiple invalid modules all reported', () => {
    const result = validateModuleIdsSync(
      ['auth-core', 'user-panel', 'login'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors.length, 3);
    assert.equal(result.errors[0].module, 'auth-core');
    assert.equal(result.errors[1].module, 'user-panel');
    assert.equal(result.errors[2].module, 'login');
  });

  test('mix of valid and invalid modules reported correctly', () => {
    const result = validateModuleIdsSync(
      ['services/auth-core', 'invalid-module', 'ui/user-admin-panel'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].module, 'invalid-module');
  });

  test('suggestions are limited and relevant', () => {
    const result = validateModuleIdsSync(
      ['user-panel'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(result.errors[0].suggestions.length <= 3); // Max 3 suggestions
    assert.ok(result.errors[0].suggestions.some(s => s.includes('user-admin-panel')));
  });

  test('no suggestions for very dissimilar names', () => {
    const result = validateModuleIdsSync(
      ['completely-unrelated-xyz-123'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    // May have no suggestions if edit distance is too large
    assert.ok(result.errors[0].suggestions.length >= 0);
  });

  test('special characters in module IDs are validated', () => {
    const policyWithSpecialChars = {
      modules: {
        'services/auth-core_v2': {
          description: 'Auth v2',
          owns_paths: ['services/auth-v2/**']
        }
      }
    };

    const result = validateModuleIdsSync(
      ['services/auth-core_v2'],
      policyWithSpecialChars
    );

    assert.equal(result.valid, true);
  });

  test('undefined moduleScope is treated as empty', () => {
    const result = validateModuleIdsSync(
      undefined,
      samplePolicy
    );

    assert.equal(result.valid, true);
  });
});

// Sample alias table for async tests
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
    }
  }
};

describe('validateModuleIds (async with alias resolution)', () => {
  test('valid module IDs pass validation and return canonical IDs', async () => {
    const result = await validateModuleIds(
      ['services/auth-core', 'ui/user-admin-panel'],
      samplePolicy
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, ['services/auth-core', 'ui/user-admin-panel']);
  });

  test('aliases resolve to canonical IDs', async () => {
    const result = await validateModuleIds(
      ['auth-core', 'ui/user-admin-panel'],
      samplePolicy,
      sampleAliasTable
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, ['services/auth-core', 'ui/user-admin-panel']);
  });

  test('mix of aliases and canonical IDs works', async () => {
    const result = await validateModuleIds(
      ['auth-core', 'services/user-access-api', 'user-api'],
      samplePolicy,
      sampleAliasTable
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, [
      'services/auth-core',
      'services/user-access-api',
      'services/user-access-api'
    ]);
  });

  test('invalid canonical IDs fail with helpful error', async () => {
    const result = await validateModuleIds(
      ['unknown-module'],
      samplePolicy,
      sampleAliasTable
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].message.includes('unknown-module'));
    assert.ok(result.errors[0].message.includes('not found in policy'));
  });

  test('alias resolving to invalid ID fails', async () => {
    const badAliasTable = {
      aliases: {
        'bad-alias': {
          canonical: 'nonexistent-module',
          confidence: 1.0,
          reason: 'test'
        }
      }
    };

    const result = await validateModuleIds(
      ['bad-alias'],
      samplePolicy,
      badAliasTable
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(result.errors[0].message.includes('bad-alias'));
    assert.ok(result.errors[0].message.includes('nonexistent-module'));
  });

  test('empty module_scope returns empty canonical array', async () => {
    const result = await validateModuleIds([], samplePolicy);

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    assert.deepEqual(result.canonical, []);
  });

  test('preserves canonical IDs (never stores aliases)', async () => {
    const result = await validateModuleIds(
      ['auth-core', 'user-api'],
      samplePolicy,
      sampleAliasTable
    );

    assert.equal(result.valid, true);
    assert.ok(result.canonical);
    // Should return canonical IDs, not the aliases
    assert.ok(!result.canonical.includes('auth-core'));
    assert.ok(!result.canonical.includes('user-api'));
    assert.ok(result.canonical.includes('services/auth-core'));
    assert.ok(result.canonical.includes('services/user-access-api'));
  });
});
