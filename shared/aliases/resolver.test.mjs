/**
 * Tests for Module ID Resolution - Phase 3 (Unique Substring Matching)
 * 
 * Run with: node shared/aliases/resolver.test.mjs
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { resolveModuleId } from './dist/aliases/resolver.js';
import { AmbiguousSubstringError, NoMatchFoundError } from './dist/aliases/types.js';

// Sample policy for testing
const samplePolicy = {
  modules: {
    'services/auth-core': {
      description: 'Core authentication service',
      owns_paths: ['services/auth/**'],
      allowed_callers: ['ui/user-admin-panel'],
      forbidden_callers: []
    },
    'services/auth-admin': {
      description: 'Admin authentication endpoints',
      owns_paths: ['services/auth-admin/**'],
      allowed_callers: ['ui/admin-panel'],
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
    'ui/auth-panel': {
      description: 'Auth configuration panel',
      owns_paths: ['web-ui/auth/**'],
      allowed_callers: [],
      forbidden_callers: []
    },
    'ui/login-page': {
      description: 'Login page UI',
      owns_paths: ['web-ui/login/**'],
      allowed_callers: [],
      forbidden_callers: []
    }
  }
};

describe('resolveModuleId - Phase 3 Substring Matching', () => {
  describe('Exact matches (confidence 1.0)', () => {
    test('exact match returns confidence 1.0', () => {
      const result = resolveModuleId('services/auth-core', samplePolicy);
      
      assert.equal(result.canonical, 'services/auth-core');
      assert.equal(result.confidence, 1.0);
      assert.equal(result.original, 'services/auth-core');
      assert.equal(result.source, 'exact');
      assert.equal(result.warning, undefined);
    });
    
    test('exact match takes priority over substring match', () => {
      // Even though 'ui/auth-panel' contains 'auth-panel',
      // exact match should be used
      const result = resolveModuleId('ui/auth-panel', samplePolicy);
      
      assert.equal(result.canonical, 'ui/auth-panel');
      assert.equal(result.confidence, 1.0);
      assert.equal(result.source, 'exact');
      assert.equal(result.warning, undefined);
    });
  });
  
  describe('Unique substring matches (confidence 0.9)', () => {
    test('unique substring expands correctly', () => {
      const result = resolveModuleId('user-access-api', samplePolicy);
      
      assert.equal(result.canonical, 'services/user-access-api');
      assert.equal(result.confidence, 0.9);
      assert.equal(result.original, 'user-access-api');
      assert.equal(result.source, 'substring');
      assert.ok(result.warning);
      assert.ok(result.warning.includes('user-access-api'));
      assert.ok(result.warning.includes('services/user-access-api'));
    });
    
    test('unique substring with path separator', () => {
      const result = resolveModuleId('auth-core', samplePolicy);
      
      assert.equal(result.canonical, 'services/auth-core');
      assert.equal(result.confidence, 0.9);
      assert.equal(result.source, 'substring');
      assert.ok(result.warning);
      assert.ok(result.warning.includes('ℹ️'));
    });
    
    test('partial path substring matches', () => {
      const result = resolveModuleId('login-page', samplePolicy);
      
      assert.equal(result.canonical, 'ui/login-page');
      assert.equal(result.confidence, 0.9);
      assert.equal(result.source, 'substring');
      assert.ok(result.warning);
    });
  });
  
  describe('Ambiguous substring handling', () => {
    test('ambiguous substring lists all matches', () => {
      // 'auth' matches multiple modules
      assert.throws(
        () => resolveModuleId('auth', samplePolicy),
        (err) => {
          assert.ok(err instanceof AmbiguousSubstringError);
          assert.equal(err.substring, 'auth');
          assert.ok(err.matches.includes('services/auth-core'));
          assert.ok(err.matches.includes('services/auth-admin'));
          assert.ok(err.matches.includes('ui/auth-panel'));
          assert.ok(err.message.includes('Ambiguous substring'));
          assert.ok(err.message.includes('Please use full module ID'));
          return true;
        }
      );
    });
    
    test('ambiguous substring error message is helpful', () => {
      try {
        resolveModuleId('admin', samplePolicy);
        assert.fail('Should have thrown AmbiguousSubstringError');
      } catch (err) {
        assert.ok(err instanceof AmbiguousSubstringError);
        assert.ok(err.message.includes('services/auth-admin'));
        assert.ok(err.message.includes('ui/user-admin-panel'));
        assert.ok(err.message.includes('   - ')); // Check formatting
      }
    });
    
    test('too many matches truncated with message', () => {
      // Create policy with many matching modules
      const manyModulesPolicy = {
        modules: {
          'module-a': { owns_paths: ['a/**'] },
          'module-b': { owns_paths: ['b/**'] },
          'module-c': { owns_paths: ['c/**'] },
          'module-d': { owns_paths: ['d/**'] },
          'module-e': { owns_paths: ['e/**'] },
          'module-f': { owns_paths: ['f/**'] },
          'module-g': { owns_paths: ['g/**'] }
        }
      };
      
      try {
        resolveModuleId('module', manyModulesPolicy, { maxAmbiguousMatches: 5 });
        assert.fail('Should have thrown AmbiguousSubstringError');
      } catch (err) {
        assert.ok(err instanceof AmbiguousSubstringError);
        assert.ok(err.message.includes('... and 2 more'));
      }
    });
  });
  
  describe('Substring disabled with --no-substring flag', () => {
    test('substring matching disabled when noSubstring is true', () => {
      assert.throws(
        () => resolveModuleId('auth-core', samplePolicy, { noSubstring: true }),
        (err) => {
          assert.ok(err instanceof NoMatchFoundError);
          assert.equal(err.moduleId, 'auth-core');
          return true;
        }
      );
    });
    
    test('exact match still works when substring disabled', () => {
      const result = resolveModuleId(
        'services/auth-core',
        samplePolicy,
        { noSubstring: true }
      );
      
      assert.equal(result.canonical, 'services/auth-core');
      assert.equal(result.confidence, 1.0);
      assert.equal(result.source, 'exact');
    });
  });
  
  describe('Minimum substring length', () => {
    test('short substring rejected by default', () => {
      // Default minSubstringLength is 3
      assert.throws(
        () => resolveModuleId('au', samplePolicy),
        (err) => {
          assert.ok(err instanceof NoMatchFoundError);
          return true;
        }
      );
    });
    
    test('custom minimum substring length', () => {
      // Allow shorter substrings
      const result = resolveModuleId('login-page', samplePolicy, { minSubstringLength: 2 });
      assert.equal(result.canonical, 'ui/login-page');
      
      // But still reject very short ones
      assert.throws(
        () => resolveModuleId('ui', samplePolicy, { minSubstringLength: 3 }),
        NoMatchFoundError
      );
    });
  });
  
  describe('No match found', () => {
    test('no match throws NoMatchFoundError', () => {
      assert.throws(
        () => resolveModuleId('nonexistent-module', samplePolicy),
        (err) => {
          assert.ok(err instanceof NoMatchFoundError);
          assert.equal(err.moduleId, 'nonexistent-module');
          assert.ok(err.message.includes('No match found'));
          return true;
        }
      );
    });
    
    test('no match when substring disabled', () => {
      assert.throws(
        () => resolveModuleId('partial', samplePolicy, { noSubstring: true }),
        NoMatchFoundError
      );
    });
  });
  
  describe('Edge cases', () => {
    test('empty string throws NoMatchFoundError', () => {
      assert.throws(
        () => resolveModuleId('', samplePolicy),
        NoMatchFoundError
      );
    });
    
    test('substring that matches nothing', () => {
      assert.throws(
        () => resolveModuleId('xyz123', samplePolicy),
        NoMatchFoundError
      );
    });
    
    test('case-sensitive substring matching', () => {
      // 'Auth' (capital A) should not match 'auth'
      assert.throws(
        () => resolveModuleId('Auth-core', samplePolicy),
        NoMatchFoundError
      );
    });
    
    test('special characters in module IDs work', () => {
      const specialPolicy = {
        modules: {
          'services/auth-core_v2': {
            owns_paths: ['services/auth-v2/**']
          }
        }
      };
      
      const result = resolveModuleId('auth-core_v2', specialPolicy);
      assert.equal(result.canonical, 'services/auth-core_v2');
      assert.equal(result.source, 'substring');
    });
  });
  
  describe('Future phases compatibility', () => {
    test('resolver options include Phase 1 and 2 flags', () => {
      // These should not cause errors even though not implemented yet
      const result = resolveModuleId('services/auth-core', samplePolicy, {
        noAlias: true,
        noFuzzy: true
      });
      
      assert.equal(result.canonical, 'services/auth-core');
    });
  });
  
  describe('Adding new module breaks previous unique substring', () => {
    test('previously unique substring becomes ambiguous', () => {
      // Initially 'auth-core' is unique
      const initialPolicy = {
        modules: {
          'services/auth-core': { owns_paths: ['services/auth/**'] }
        }
      };
      
      const result1 = resolveModuleId('auth-core', initialPolicy);
      assert.equal(result1.canonical, 'services/auth-core');
      
      // After adding 'ui/auth-core-panel', it becomes ambiguous
      const extendedPolicy = {
        modules: {
          'services/auth-core': { owns_paths: ['services/auth/**'] },
          'ui/auth-core-panel': { owns_paths: ['ui/auth-core/**'] }
        }
      };
      
      assert.throws(
        () => resolveModuleId('auth-core', extendedPolicy),
        (err) => {
          assert.ok(err instanceof AmbiguousSubstringError);
          assert.ok(err.message.includes('services/auth-core'));
          assert.ok(err.message.includes('ui/auth-core-panel'));
          assert.ok(err.message.includes('Please use full module ID'));
          return true;
        }
      );
    });
  });
});
