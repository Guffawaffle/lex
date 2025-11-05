# Phase 3: Unique Substring Matching - Usage Guide

## Quick Start

The Phase 3 substring matching feature is now available in the `shared/aliases/` module.

### Basic Usage

```typescript
import { resolveModuleId } from '@lex/aliases';
import { loadPolicy } from '@lex/policy';

const policy = loadPolicy();

// Exact match (always preferred)
const result1 = resolveModuleId('services/auth-core', policy);
// { canonical: 'services/auth-core', confidence: 1.0, source: 'exact' }

// Unique substring match
const result2 = resolveModuleId('auth-core', policy);
// { canonical: 'services/auth-core', confidence: 0.9, source: 'substring',
//   warning: "ℹ️  Expanded substring 'auth-core' → 'services/auth-core' (unique match)" }

// Always check and display warnings
if (result2.warning) {
  console.warn(result2.warning);
}
```

### Error Handling

```typescript
import { AmbiguousSubstringError, NoMatchFoundError } from '@lex/aliases';

try {
  const result = resolveModuleId('auth', policy);
} catch (err) {
  if (err instanceof AmbiguousSubstringError) {
    console.error(`❌ ${err.message}`);
    console.error(`Matches: ${err.matches.join(', ')}`);
  } else if (err instanceof NoMatchFoundError) {
    console.error(`❌ ${err.message}`);
  }
}
```

### CLI Usage

```bash
# Normal mode - substring matching enabled
lex remember --modules "auth-core,user-panel"

# Strict mode - substring matching disabled (for CI)
lex remember --no-substring --modules "services/auth-core,ui/user-panel"
```

### Configuration Options

```typescript
interface ResolverOptions {
  noSubstring?: boolean;        // Disable substring matching (default: false)
  minSubstringLength?: number;  // Minimum substring length (default: 3)
  maxAmbiguousMatches?: number; // Max matches before truncating (default: 5)
}

// Custom configuration
const result = resolveModuleId('auth', policy, {
  minSubstringLength: 5,  // Require longer substrings
  maxAmbiguousMatches: 3  // Show fewer matches in error
});
```

## Test Results

All 20 tests passing:

```
✔ Exact matches (confidence 1.0)
  ✔ exact match returns confidence 1.0
  ✔ exact match takes priority over substring match

✔ Unique substring matches (confidence 0.9)
  ✔ unique substring expands correctly
  ✔ unique substring with path separator
  ✔ partial path substring matches

✔ Ambiguous substring handling
  ✔ ambiguous substring lists all matches
  ✔ ambiguous substring error message is helpful
  ✔ too many matches truncated with message

✔ Substring disabled with --no-substring flag
  ✔ substring matching disabled when noSubstring is true
  ✔ exact match still works when substring disabled

✔ Minimum substring length
  ✔ short substring rejected by default
  ✔ custom minimum substring length

✔ No match found
  ✔ no match throws NoMatchFoundError
  ✔ no match when substring disabled

✔ Edge cases
  ✔ empty string throws NoMatchFoundError
  ✔ substring that matches nothing
  ✔ case-sensitive substring matching
  ✔ special characters in module IDs work

✔ Future phases compatibility
  ✔ resolver options include Phase 1 and 2 flags

✔ Adding new module breaks previous unique substring
  ✔ previously unique substring becomes ambiguous
```

## Demo

Run the interactive demo:

```bash
cd /home/runner/work/lex/lex
node shared/aliases/demo.mjs
```

This demonstrates:
1. Exact match priority
2. Unique substring expansion
3. Ambiguous substring errors
4. --no-substring flag behavior
5. Minimum length filtering

## Integration Pattern

For integrating into existing code (like `remember.ts`):

```typescript
import { resolveModuleId } from '../aliases/resolver.js';

const resolvedModules = [];
for (const moduleId of inputModules) {
  try {
    const result = resolveModuleId(moduleId, policy, { 
      noSubstring: options.noSubstring 
    });
    
    // Display warning if substring was used
    if (result.warning) {
      console.warn(result.warning);
    }
    
    // Use canonical ID
    resolvedModules.push(result.canonical);
  } catch (err) {
    if (err instanceof AmbiguousSubstringError) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    } else if (err instanceof NoMatchFoundError) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    } else {
      throw err;
    }
  }
}
```

## Acceptance Criteria Status

- [x] Extend `resolveModuleId()` to check substring matches
- [x] Accept if substring matches exactly ONE module ID
- [x] Reject with helpful list if substring matches multiple modules
- [x] Return confidence 0.9 for unique substring match
- [x] Emit warning about substring expansion
- [x] Add `--no-substring` flag to disable this feature
- [x] Update unit tests for substring resolution (20 tests)
- [x] Document risks and benefits in README

## Future Work

This implementation is ready to be extended with:

**Phase 1: Alias Table**
- Explicit module ID aliases with confidence 1.0
- Historical name tracking for refactored modules

**Phase 2: Fuzzy Typo Correction**
- Edit distance-based matching
- Confidence 0.7-0.9 based on similarity

The resolver already has placeholder hooks for these features.
