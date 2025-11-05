/**
 * Demo: Module ID Resolution with Substring Matching
 * 
 * Run with: node shared/aliases/demo.mjs
 * 
 * This demonstrates Phase 3 substring matching functionality.
 */

import { resolveModuleId } from './dist/aliases/resolver.js';
import { AmbiguousSubstringError, NoMatchFoundError } from './dist/aliases/types.js';

// Sample policy for demonstration
const demoPolicy = {
  modules: {
    'services/auth-core': {
      description: 'Core authentication service',
      owns_paths: ['services/auth/**']
    },
    'services/auth-admin': {
      description: 'Admin authentication endpoints',
      owns_paths: ['services/auth-admin/**']
    },
    'services/user-access-api': {
      description: 'User access API layer',
      owns_paths: ['services/userAccess/**']
    },
    'ui/user-admin-panel': {
      description: 'User admin panel UI',
      owns_paths: ['web-ui/userAdmin/**']
    },
    'ui/auth-panel': {
      description: 'Auth configuration panel',
      owns_paths: ['web-ui/auth/**']
    },
    'ui/login-page': {
      description: 'Login page UI',
      owns_paths: ['web-ui/login/**']
    }
  }
};

console.log('=== Module ID Resolution Demo ===\n');

// Demo 1: Exact match
console.log('Demo 1: Exact match (highest priority)');
try {
  const result = resolveModuleId('services/auth-core', demoPolicy);
  console.log(`Input: 'services/auth-core'`);
  console.log(`Output:`, result);
  console.log(`✓ Exact match found with confidence ${result.confidence}\n`);
} catch (err) {
  console.error(`✗ Error:`, err.message, '\n');
}

// Demo 2: Unique substring match
console.log('Demo 2: Unique substring match');
try {
  const result = resolveModuleId('user-access-api', demoPolicy);
  console.log(`Input: 'user-access-api'`);
  console.log(`Output:`, result);
  if (result.warning) {
    console.log(result.warning);
  }
  console.log(`✓ Unique substring expanded to '${result.canonical}' with confidence ${result.confidence}\n`);
} catch (err) {
  console.error(`✗ Error:`, err.message, '\n');
}

// Demo 3: Another unique substring
console.log('Demo 3: Another unique substring');
try {
  const result = resolveModuleId('login-page', demoPolicy);
  console.log(`Input: 'login-page'`);
  console.log(`Output:`, result);
  if (result.warning) {
    console.log(result.warning);
  }
  console.log(`✓ Unique substring expanded to '${result.canonical}'\n`);
} catch (err) {
  console.error(`✗ Error:`, err.message, '\n');
}

// Demo 4: Ambiguous substring (matches multiple modules)
console.log('Demo 4: Ambiguous substring');
try {
  const result = resolveModuleId('auth', demoPolicy);
  console.log(`Input: 'auth'`);
  console.log(`Output:`, result);
} catch (err) {
  if (err instanceof AmbiguousSubstringError) {
    console.log(`Input: 'auth'`);
    console.log(`✗ Ambiguous substring error (expected):`);
    console.log(err.message);
    console.log(`Matches found: ${err.matches.join(', ')}\n`);
  } else {
    console.error(`✗ Unexpected error:`, err.message, '\n');
  }
}

// Demo 5: No match found
console.log('Demo 5: No match found');
try {
  const result = resolveModuleId('nonexistent-module', demoPolicy);
  console.log(`Input: 'nonexistent-module'`);
  console.log(`Output:`, result);
} catch (err) {
  if (err instanceof NoMatchFoundError) {
    console.log(`Input: 'nonexistent-module'`);
    console.log(`✗ No match error (expected):`);
    console.log(err.message, '\n');
  } else {
    console.error(`✗ Unexpected error:`, err.message, '\n');
  }
}

// Demo 6: Substring disabled
console.log('Demo 6: Substring matching disabled (--no-substring)');
try {
  const result = resolveModuleId('auth-core', demoPolicy, { noSubstring: true });
  console.log(`Input: 'auth-core' with noSubstring=true`);
  console.log(`Output:`, result);
} catch (err) {
  if (err instanceof NoMatchFoundError) {
    console.log(`Input: 'auth-core' with noSubstring=true`);
    console.log(`✗ No match error (expected when substring disabled):`);
    console.log(err.message, '\n');
  } else {
    console.error(`✗ Unexpected error:`, err.message, '\n');
  }
}

// Demo 7: Short substring rejected
console.log('Demo 7: Short substring rejected (< 3 chars)');
try {
  const result = resolveModuleId('au', demoPolicy);
  console.log(`Input: 'au'`);
  console.log(`Output:`, result);
} catch (err) {
  if (err instanceof NoMatchFoundError) {
    console.log(`Input: 'au'`);
    console.log(`✗ No match error (expected - too short):`);
    console.log(err.message);
    console.log(`(Minimum substring length is 3 by default)\n`);
  } else {
    console.error(`✗ Unexpected error:`, err.message, '\n');
  }
}

console.log('=== Demo Complete ===');
console.log('\nKey Takeaways:');
console.log('1. Exact matches always win (confidence 1.0)');
console.log('2. Unique substrings work well (confidence 0.9) with warnings');
console.log('3. Ambiguous substrings give clear error messages');
console.log('4. Use --no-substring flag for strict mode (CI)');
console.log('5. Minimum substring length prevents over-matching');
