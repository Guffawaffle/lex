# Testing Documentation

This directory contains comprehensive testing documentation for the Lex project.

## Overview

The Lex project uses a multi-layered testing strategy:

1. **Unit Tests** - Test individual components in isolation
2. **Integration Tests** - Test component interactions and full workflows
3. **Performance Benchmarks** - Ensure performance targets are met
4. **CI/CD Integration** - Automated testing on all PRs and commits

## Test Structure

```
lex/
├── memory/
│   ├── integration.test.ts        # Memory integration tests
│   ├── benchmarks.test.ts         # Performance benchmarks
│   ├── store/store.test.ts        # Unit tests for storage
│   ├── mcp_server/
│   │   ├── server.test.ts         # Unit tests for MCP server
│   │   └── integration.test.ts    # MCP integration tests
│   └── renderer/card.test.ts      # Unit tests for rendering
├── policy/
│   ├── integration.test.mjs       # Policy integration tests
│   ├── check/check.test.mjs       # Unit tests for policy check
│   └── merge/merge.test.mjs       # Unit tests for merge
└── .github/workflows/test.yml     # CI/CD workflow
```

## Running Tests

### All Tests

```bash
npm test
```

### Unit Tests Only

```bash
# All unit tests
npm test

# Specific component
npm run test:store          # Frame storage tests
npm run test:mcp-server     # MCP server tests
npm run test:renderer       # Memory card rendering tests
npm run test:check          # Policy check tests
npm run test:merge          # Policy merge tests
```

### Integration Tests

```bash
# Memory integration tests
cd memory && npx tsx --test integration.test.ts

# MCP server integration tests
cd memory/mcp_server && npm run build && node --test dist/integration.test.js

# Policy integration tests
cd policy && node integration.test.mjs
```

### Performance Benchmarks

```bash
cd memory && npx tsx --test benchmarks.test.ts
```

## Integration Test Suites

### Memory Integration Tests (`memory/integration.test.ts`)

Tests the complete Frame lifecycle:

- **Full Frame Lifecycle**: Creation → storage → recall flow
- **Module Validation**: Validates module IDs before storage
- **Atlas Frame Integration**: Tests Atlas Frame generation
- **Memory Card Rendering**: Tests rendering output
- **Multi-Frame Scenarios**: Tests multiple Frames and search
- **Error Handling**: Tests edge cases and error scenarios

**Coverage**: 15+ test cases

### MCP Server Integration Tests (`memory/mcp_server/integration.test.ts`)

Tests the full MCP protocol integration:

- **Request/Response Cycle**: Full remember → recall cycle
- **Module Validation Integration**: Real module validation
- **FTS5 Search Integration**: Full-text search across all fields
- **Frame Filtering**: Filter by module scope and limits
- **Error Handling**: Validates error messages and responses
- **Protocol Compliance**: Tests MCP protocol compliance

**Coverage**: 20+ test cases

### Policy Integration Tests (`policy/integration.test.mjs`)

Tests the complete policy check pipeline:

- **Scanner → Merge → Check Pipeline**: End-to-end flow
- **Atlas Frame Extraction**: Extracts Atlas Frames from policy
- **Violation Detection**: Tests all violation types:
  - forbidden_caller
  - missing_allowed_caller
  - feature_flag
  - permission
  - kill_pattern
- **Report Generation**: Text, JSON, and Markdown reports
- **Edge Cases**: Handles unknown modules and wildcard patterns

**Coverage**: 18+ test cases

## Performance Benchmarks

Target performance metrics:

| Operation | Target | Dataset |
|-----------|--------|---------|
| Frame creation | <50ms | Single frame |
| Frame recall | <100ms | 1,000 frames |
| FTS5 search | <200ms | 10,000 frames |
| Memory card rendering | <500ms | Complex frame |

### Running Benchmarks

```bash
cd memory && npx tsx --test benchmarks.test.ts
```

Benchmarks test:

1. **Frame Creation**: Single and bulk creation
2. **Frame Recall**: ID lookup with 1K frames
3. **FTS5 Search**: Search with 10K frames
4. **Memory Card Rendering**: Complex and minimal frames
5. **Combined Operations**: Full lifecycle timing

## CI/CD Integration

The project uses GitHub Actions for continuous integration.

### Workflow Triggers

- **Pull Requests**: All tests run on every PR
- **Main Branch**: All tests + performance benchmarks
- **Manual**: Can be triggered manually

### Workflow Jobs

1. **unit-tests**: Runs all unit tests
2. **integration-tests**: Runs all integration tests
3. **performance-benchmarks**: Runs benchmarks (main branch only)
4. **coverage**: Generates and reports test coverage
5. **test-summary**: Aggregates results

### Viewing Results

- Check the **Actions** tab in GitHub
- PR comments include coverage summary
- Benchmark results are uploaded as artifacts

## Test Coverage

**Target**: >80% code coverage

Coverage is measured across:

- Frame storage operations
- MCP server protocol handlers
- Policy violation detection
- Atlas Frame extraction
- Memory card rendering

### Coverage Report

Coverage summary is posted as a comment on PRs. To view locally:

```bash
npm test 2>&1 | grep -E "(pass|fail|tests)"
```

## Writing New Tests

### Unit Tests

Use Node.js built-in test runner:

```typescript
import { test, describe } from "node:test";
import assert from "node:assert";

describe("Component Name", () => {
  test("should do something", () => {
    const result = myFunction();
    assert.strictEqual(result, expectedValue);
  });
});
```

### Integration Tests

Test full workflows:

```typescript
describe("Integration Test Suite", () => {
  test("should complete full workflow", async () => {
    // Step 1: Setup
    const input = createInput();
    
    // Step 2: Execute workflow
    const step1Result = step1(input);
    const step2Result = step2(step1Result);
    const finalResult = step3(step2Result);
    
    // Step 3: Verify
    assert.ok(finalResult);
    assert.strictEqual(finalResult.status, "success");
  });
});
```

### Performance Tests

Measure execution time:

```typescript
function measureTime(fn: () => void): number {
  const start = performance.now();
  fn();
  const end = performance.now();
  return end - start;
}

test("should perform operation quickly", () => {
  const time = measureTime(() => {
    performOperation();
  });
  
  assert.ok(time < 100, `Took ${time}ms, expected <100ms`);
});
```

## Best Practices

1. **Isolation**: Tests should not depend on each other
2. **Cleanup**: Always clean up resources (databases, files)
3. **Descriptive Names**: Use clear, descriptive test names
4. **Assertions**: Use specific assertions (strictEqual, deepStrictEqual)
5. **Error Testing**: Test both success and failure paths
6. **Performance**: Keep tests fast, use timeouts for slow operations
7. **Documentation**: Comment complex test setups

## Troubleshooting

### Tests Failing Locally

```bash
# Clean build
rm -rf node_modules package-lock.json
npm install
npm run build
npm test
```

### Database Lock Errors

Tests use temporary databases. If you see lock errors:

```bash
# Find and kill processes
lsof | grep "test-frames"
# Or restart your terminal
```

### CI/CD Failures

1. Check the **Actions** tab for detailed logs
2. Look for build errors before test failures
3. Ensure all dependencies are in package.json
4. Verify test database paths use temp directories

## Contributing

When adding new features:

1. Write unit tests for new functions
2. Add integration tests for new workflows
3. Update benchmarks if performance-critical
4. Ensure CI/CD passes
5. Aim for >80% coverage on new code

## Support

For questions or issues:

- Open an issue on GitHub
- Check existing test files for examples
- Review CI/CD logs for failures

---

**Last Updated**: 2025-11-03  
**Test Framework**: Node.js built-in test runner  
**Coverage Tool**: Built-in Node.js coverage  
**CI/CD**: GitHub Actions
