# Testing Alias Resolution

This document describes how to run and maintain tests for the alias resolution system.

## Overview

The alias resolution system has comprehensive test coverage across multiple test suites:

- **`substring.spec.mjs`** - Pattern/wildcard matching and substring resolution
- **`collision.spec.mjs`** - Collision detection and resolution strategies
- **`case-sensitivity.spec.mjs`** - Case sensitivity behavior and normalization
- **`resolution.spec.mjs`** - Snapshot tests for regression detection

## Running Tests

### Run All Alias Tests

```bash
npm run test:aliases
```

### Run Individual Test Suites

```bash
# Substring/pattern matching tests
node --test src/shared/aliases/substring.spec.mjs

# Collision detection tests
node --test src/shared/aliases/collision.spec.mjs

# Case sensitivity tests
node --test src/shared/aliases/case-sensitivity.spec.mjs

# Snapshot tests
node --test src/shared/aliases/resolution.spec.mjs
```

### Run All Project Tests

The alias tests are included in the main test suite:

```bash
npm test
```

## Snapshot Tests

Snapshot tests capture the complete output of alias resolution to detect breaking changes.

### What Are Snapshots?

Snapshots are saved JSON representations of test outputs stored in `__snapshots__/resolution.spec.mjs.snap`. They help detect:

- Changes to the `AliasResolution` interface
- Changes to resolution algorithm behavior
- Breaking changes in alias table structure
- Unintended output modifications

### Updating Snapshots

When you intentionally change the resolution behavior or output format:

```bash
LEX_UPDATE_SNAPSHOTS=1 node --test src/shared/aliases/resolution.spec.mjs
```

**⚠️ Important:** Always review snapshot diffs carefully in your PR to ensure changes are intentional.

### When to Update Snapshots

- Adding new fields to `AliasResolution` interface
- Changing the resolution algorithm
- Modifying canonical module IDs in policy
- Updating alias table structure

### When NOT to Update Snapshots

- Random test failures (investigate the cause first)
- CI failures without understanding why
- If snapshot diff shows unexpected changes

## Interpreting Test Results

### Collision Errors

When two modules would map to the same alias:

```
Error: Alias collision detected for 'auth-core'
  - services/auth-core
  - core/authentication
```

**Resolution:** Choose a unique alias for each module or remove one mapping.

### Case Sensitivity Warnings

```
Error: Alias "Auth-Core" should be lowercase: "auth-core"
```

**Resolution:** Use lowercase aliases for consistency. Run the linter:

```javascript
import { lintAliasTableCase } from './case-sensitivity.spec.mjs';

const errors = lintAliasTableCase(aliasTable);
console.log(errors);
```

### Ambiguous Substring Matches

When substring matching finds multiple candidates:

```
Warning: Ambiguous substring 'user' matches:
  - services/user-access-api
  - api/user-service
```

**Resolution:** Use the full module ID or add an explicit alias to `aliases.json`.

## Test Coverage

### Coverage Requirements

The alias resolution system requires **90%+ branch coverage** for the `shared/aliases/` directory.

### Checking Coverage

```bash
# Run tests with coverage
npm run coverage

# Check coverage report
c8 report --reporter=text
```

### Coverage Areas

- ✅ Exact match resolution (100%)
- ✅ Alias table lookups (100%)
- ✅ Substring matching (100%)
- ✅ Case sensitivity (100%)
- ✅ Collision detection (100%)
- ✅ Edge cases (100%)

## Writing New Tests

### Test File Structure

```javascript
import { strict as assert } from "assert";
import { test, describe } from "node:test";
import {
  resolveModuleId,
  clearAliasTableCache,
} from "../../../dist/shared/aliases/resolver.js";

describe("Feature Name", () => {
  test("should do something specific", async () => {
    clearAliasTableCache(); // Always clear cache in tests

    const policy = { modules: { /* ... */ } };
    const aliasTable = { aliases: { /* ... */ } };

    const result = await resolveModuleId("input", policy, aliasTable);

    assert.equal(result.canonical, "expected-output");
    assert.equal(result.confidence, 1.0);
    assert.equal(result.source, "alias");
  });
});
```

### Best Practices

1. **Always clear cache:** Call `clearAliasTableCache()` at the start of each test
2. **Use descriptive names:** Test names should clearly describe what they verify
3. **Test one thing:** Each test should verify a single behavior
4. **Include edge cases:** Test empty inputs, special characters, Unicode, etc.
5. **Document why:** Add comments explaining non-obvious test scenarios

## CI Integration

### GitHub Actions Workflow

The alias tests run automatically on every PR via `.github/workflows/test-aliasing.yml`:

- Runs on Node 20 and 22
- Checks test passing
- Verifies 90%+ branch coverage
- Fails PR if any tests fail

### Local CI Simulation

```bash
# Run the same checks as CI
npm run local-ci
```

## Debugging Test Failures

### Enable Debug Logging

```bash
LEX_DEBUG=1 node --test src/shared/aliases/substring.spec.mjs
```

### Isolate Failing Test

```bash
# Run just one test file
node --test src/shared/aliases/collision.spec.mjs

# Or use Node's --test-name-pattern
node --test --test-name-pattern="collision" src/shared/aliases/*.spec.mjs
```

### Common Issues

1. **Cache not cleared:** Tests interfere with each other
   - **Fix:** Add `clearAliasTableCache()` at start of test

2. **Module not found:** Import paths incorrect
   - **Fix:** Ensure paths point to `dist/` output, not `src/`

3. **Snapshot mismatch:** Output changed unexpectedly
   - **Fix:** Review changes and update snapshots if intentional

4. **Timeout:** Test takes too long
   - **Fix:** Check for infinite loops or missing async/await

## Maintenance

### Regular Maintenance Tasks

- Review and update snapshots when interfaces change
- Add tests for new resolution strategies
- Update documentation when behavior changes
- Monitor coverage to catch untested edge cases

### Breaking Changes

When making breaking changes to the alias system:

1. Update affected tests
2. Update snapshots with `LEX_UPDATE_SNAPSHOTS=1`
3. Document changes in PR description
4. Update this TESTING.md if test procedures change

## Performance

### Performance Benchmarks

The alias system should maintain fast resolution times:

- Single resolution: < 1ms
- Batch resolution (100 aliases): < 10ms
- Alias table linting (1000 aliases): < 100ms

### Performance Tests

Performance assertions are included in the test suites:

```javascript
test("alias table linting is fast enough for CI", () => {
  const startTime = Date.now();
  lintAliasTableCase(largeAliasTable);
  const duration = Date.now() - startTime;

  assert.ok(duration < 100, `Took ${duration}ms, should be < 100ms`);
});
```

## Questions?

For questions about alias testing:

1. Check this TESTING.md document
2. Review existing tests for examples
3. See `README.md` for alias system overview
4. See `MAINTENANCE_GUIDE.md` for system maintenance

## Quick Reference

```bash
# Run all alias tests
npm run test:aliases

# Update snapshots
LEX_UPDATE_SNAPSHOTS=1 node --test src/shared/aliases/resolution.spec.mjs

# Check coverage
npm run coverage

# Debug mode
LEX_DEBUG=1 node --test src/shared/aliases/substring.spec.mjs

# Run specific test
node --test src/shared/aliases/collision.spec.mjs
```
