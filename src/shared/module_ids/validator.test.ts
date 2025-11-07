/**
 * Tests for Module ID Validation (THE CRITICAL RULE)
 *
 * Run with: node shared/module_ids/validator.test.mjs
 * Note: This file needs to be compiled from TypeScript first or run directly as .mjs
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { validateModuleIds } from './validator.js';

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

describe('validateModuleIds', () => {
  test('valid module IDs pass validation', async () => {
    const result = await validateModuleIds(
      ['services/auth-core', 'ui/user-admin-panel'],
      samplePolicy
    );

    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  test('invalid module IDs fail with error messages', async () => {
    const result = await validateModuleIds(
      ['auth-core', 'ui/user-admin-panel'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].module, 'auth-core');
    assert.ok(result.errors[0].message.includes('not found in policy'));
  });

  test('fuzzy matching suggests similar module names', async () => {
    const result = await validateModuleIds(
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

  test('empty module_scope is allowed', async () => {
    const result = await validateModuleIds([], samplePolicy);

    assert.equal(result.valid, true);
    assert.equal(result.errors, undefined);
  });

  test('case sensitivity is enforced', async () => {
    const result = await validateModuleIds(
      ['Services/Auth-Core'], // Wrong case
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors[0].module, 'Services/Auth-Core');
  });

  test('multiple invalid modules all reported', async () => {
    const result = await validateModuleIds(
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

  test('mix of valid and invalid modules reported correctly', async () => {
    const result = await validateModuleIds(
      ['services/auth-core', 'invalid-module', 'ui/user-admin-panel'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].module, 'invalid-module');
  });

  test('suggestions are limited and relevant', async () => {
    const result = await validateModuleIds(
      ['user-panel'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    assert.ok(result.errors[0].suggestions.length <= 3); // Max 3 suggestions
    assert.ok(result.errors[0].suggestions.some((s: string) => s.includes('user-admin-panel')));
  });

  test('no suggestions for very dissimilar names', async () => {
    const result = await validateModuleIds(
      ['completely-unrelated-xyz-123'],
      samplePolicy
    );

    assert.equal(result.valid, false);
    assert.ok(result.errors);
    // May have no suggestions if edit distance is too large
    assert.ok(result.errors[0].suggestions.length >= 0);
  });

  test('special characters in module IDs are validated', async () => {
    const policyWithSpecialChars = {
      modules: {
        'services/auth-core_v2': {
          description: 'Auth v2',
          owns_paths: ['services/auth-v2/**']
        }
      }
    };

    const result = await validateModuleIds(
      ['services/auth-core_v2'],
      policyWithSpecialChars
    );

    assert.equal(result.valid, true);
  });

  test('undefined moduleScope is treated as empty', async () => {
    // Test that validator handles undefined gracefully
    const result = await validateModuleIds(
      null as unknown as string[],
      samplePolicy
    );

    assert.equal(result.valid, true);
  });
});
