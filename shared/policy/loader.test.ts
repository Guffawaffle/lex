/**
 * Tests for Policy Loader
 * 
 * Run with: node shared/policy/loader.test.mjs
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { loadPolicy, clearPolicyCache } from './loader.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('loadPolicy', () => {
  test('loads policy from default path', () => {
    // Clear cache to ensure we're loading fresh
    clearPolicyCache();
    
    const policy = loadPolicy();
    
    assert.ok(policy);
    assert.ok(policy.modules);
    assert.equal(typeof policy.modules, 'object');
    
    // Verify it has the expected modules from lexmap.policy.json
    assert.ok(policy.modules['indexer']);
    assert.ok(policy.modules['ts']);
    assert.ok(policy.modules['php']);
    assert.ok(policy.modules['mcp']);
  });

  test('caches policy on subsequent loads', () => {
    clearPolicyCache();
    
    const policy1 = loadPolicy();
    const policy2 = loadPolicy();
    
    // Should return the same cached object
    assert.strictEqual(policy1, policy2);
  });

  test('custom path overrides default', () => {
    clearPolicyCache();
    
    const customPath = resolve(__dirname, '../../policy/policy_spec/lexmap.policy.json');
    const policy = loadPolicy(customPath);
    
    assert.ok(policy);
    assert.ok(policy.modules);
  });

  test('throws error for non-existent file', () => {
    clearPolicyCache();
    
    assert.throws(() => {
      loadPolicy('/nonexistent/path/policy.json');
    }, /Policy file not found/);
  });

  test('throws error for invalid JSON', () => {
    // This test would need a temp file with invalid JSON
    // Skipping for now as it requires more setup
  });

  test('environment variable works for custom path', () => {
    clearPolicyCache();
    
    const originalEnv = process.env.LEX_POLICY_PATH;
    
    try {
      process.env.LEX_POLICY_PATH = resolve(__dirname, '../../policy/policy_spec/lexmap.policy.json');
      const policy = loadPolicy();
      
      assert.ok(policy);
      assert.ok(policy.modules);
    } finally {
      // Restore original env
      if (originalEnv) {
        process.env.LEX_POLICY_PATH = originalEnv;
      } else {
        delete process.env.LEX_POLICY_PATH;
      }
      clearPolicyCache();
    }
  });

  test('clearPolicyCache clears the cache', () => {
    clearPolicyCache();
    
    const policy1 = loadPolicy();
    clearPolicyCache();
    const policy2 = loadPolicy();
    
    // Should be different objects since cache was cleared
    assert.notStrictEqual(policy1, policy2);
    
    // But content should be the same
    assert.deepEqual(policy1.modules, policy2.modules);
  });
});
