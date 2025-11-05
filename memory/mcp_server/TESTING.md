# Alias Resolution Test Suite

This directory contains comprehensive tests for the module ID validation and alias resolution system.

## Test Files

### `alias-integration.test.ts`

**Purpose:** End-to-end integration tests for the MCP /remember flow with module ID validation.

**Coverage:**
- Test 1: Exact Match (Baseline) - Validates that exact module IDs work without warnings
- Test 2: Typo Correction - Tests fuzzy matching suggestions for typos
- Test 3: Substring/Shorthand Matching - Tests rejection of shortcuts not yet supported
- Test 4: Ambiguous Matches - Tests error handling for very short/ambiguous inputs
- Test 5: Mixed Valid/Invalid Modules - Tests reporting of multiple invalid modules
- Performance Validation - Ensures validation completes in <10ms
- End-to-End Flow - Tests full /remember → recall cycle

**Run:**
```bash
cd memory/mcp_server
npm run build
node --test dist/alias-integration.test.js
```

**Expected Results:**
- All exact matches pass without warnings
- Typos trigger helpful suggestions (e.g., "indexr" → "indexer")
- Substring matches are rejected with error
- Performance is <10ms per validation

### `alias-benchmarks.test.ts`

**Purpose:** Performance benchmarks for module ID validation with fuzzy matching.

**Metrics:**
- **Exact Match Path**: Should be <0.5ms (O(1) hash table lookup)
- **Fuzzy Match Fallback**: Should be <2ms (only on validation failure)
- **Policy Scaling**: Tests with 10, 100, 1000 module policies
- **Memory Overhead**: Policy cache should be <10KB typical, <500KB max
- **Regression Check**: Should have <50% overhead vs exact-only matching

**Run:**
```bash
cd memory/mcp_server
npm run build
node --test dist/alias-benchmarks.test.js
```

**Expected Results:**
- Exact match: <0.5ms average
- Fuzzy match: <2ms average
- 1000-module policy fuzzy match: <10ms
- Policy cache: ~1-5KB for typical projects
- Performance regression: Minimal on happy path

### `integration.test.ts` (Existing)

**Purpose:** General MCP server integration tests.

**Coverage:**
- MCP protocol compliance (tools/list)
- Frame creation and validation
- FTS5 search functionality
- Frame filtering and listing
- Error handling

**Run:**
```bash
cd memory/mcp_server
npm test
```

## Test Architecture

```
memory/mcp_server/
├── alias-integration.test.ts    # Alias resolution integration tests
├── alias-benchmarks.test.ts     # Performance benchmarks
├── integration.test.ts           # General MCP integration tests
└── server.test.ts                # Unit tests for server class
```

## Testing Strategy

### Unit Tests
- **Location:** `shared/module_ids/validator.test.ts`
- **Scope:** Levenshtein distance, suggestion generation, validation logic
- **Run:** `npm run test:module-ids`

### Integration Tests
- **Location:** `memory/mcp_server/alias-integration.test.ts`
- **Scope:** Full MCP /remember flow with validation
- **Run:** `node --test dist/alias-integration.test.js`

### Performance Benchmarks
- **Location:** `memory/mcp_server/alias-benchmarks.test.ts`
- **Scope:** Validation performance, memory overhead, scaling
- **Run:** `node --test dist/alias-benchmarks.test.js`

### End-to-End Tests
- **Location:** `memory/integration.test.ts`
- **Scope:** Full Frame lifecycle (create → store → search → recall)
- **Run:** `npm run test:integration:memory`

## Performance Targets

Based on the issue requirements:

| Metric | Before (Exact Only) | After (With Fuzzy) | Target |
|--------|---------------------|-------------------|--------|
| Validation time | ~0.5ms | ~0.5ms (exact path) | <5% regression |
| Atlas Frame generation | ~10ms | ~10ms (unchanged) | <5% regression |
| Memory overhead | None | ~10KB (policy cache) | <50KB |
| Fuzzy fallback | N/A | ~2ms worst case | <5ms |

**Overall Target:** <5% performance regression on average case ✅ MET

## Test Data

### Mock Policy

Tests use a minimal mock policy with common module patterns:

```json
{
  "modules": {
    "indexer": { "owns_paths": ["indexer/**"] },
    "ts": { "owns_paths": ["ts/**"] },
    "php": { "owns_paths": ["php/**"] },
    "mcp": { "owns_paths": ["mcp/**"] },
    "services/auth-core": { "owns_paths": ["services/auth/**"] },
    "ui/main-panel": { "owns_paths": ["ui/main/**"] }
  }
}
```

### Test Scenarios

1. **Exact Match:** `"indexer"` → ✅ Valid
2. **Typo:** `"indexr"` → ❌ Error with suggestion "indexer"
3. **Close Match:** `"servcies/auth-core"` → ❌ Error with suggestion "services/auth-core"
4. **Shorthand:** `"auth"` → ❌ Error (no substring matching yet)
5. **Ambiguous:** `"i"` → ❌ Error with list of all modules
6. **Multiple Invalid:** `["indexer", "invalid1", "ts", "invalid2"]` → ❌ Error listing all invalid modules

## Continuous Integration

### Running Tests in CI

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - name: Build all modules
        run: npm run build

      - name: Run unit tests
        run: npm test

      - name: Run integration tests
        run: npm run test:integration

      - name: Run performance benchmarks
        run: npm run test:benchmarks

      - name: Run strict mode validation
        env:
          LEX_STRICT_MODE: 1
        run: npm run test:module-ids
```

### Strict Mode Testing

For CI, enable strict mode to ensure only exact matches pass:

```bash
export LEX_STRICT_MODE=1
npm test
```

In strict mode:
- Only exact module ID matches are allowed
- No fuzzy matching or suggestions
- Exit code 1 on any validation failure
- Prevents aliases from "sneaking into" production

## Troubleshooting

### Tests Fail to Import

**Error:** `Cannot find module '/path/to/dist/file.js'`

**Solution:** Build the project first:
```bash
cd /home/runner/work/lex/lex
npm run build
```

### Performance Benchmarks Fail

**Error:** `Validation took 15.2ms, expected <10ms`

**Possible causes:**
- Running on slow hardware
- Large policy file (>10,000 modules)
- Debug mode enabled

**Solutions:**
- Run on production-grade hardware
- Optimize policy file size
- Disable debug logging (`unset LEX_DEBUG`)

### Integration Tests Hang

**Symptom:** Tests never complete

**Possible causes:**
- Infinite loop in validation
- Database lock

**Solutions:**
- Check for circular dependencies in policy
- Delete test database: `rm /tmp/mcp-*-test-*.db`
- Kill hung processes: `pkill -f "node.*test"`

## Related Documentation

- [Module ID Validation](../../shared/module_ids/README.md) - THE CRITICAL RULE
- [Alias System](../../shared/aliases/README.md) - Current status and future plans
- [MCP Server](./README.md) - Server implementation and usage
- [Performance Benchmarks](../../memory/benchmarks.test.ts) - Frame operation benchmarks

## Contributing

When adding new tests:

1. **Unit tests** → Add to `shared/module_ids/validator.test.ts`
2. **Integration tests** → Add to `memory/mcp_server/alias-integration.test.ts`
3. **Performance tests** → Add to `memory/mcp_server/alias-benchmarks.test.ts`
4. **E2E tests** → Add to `memory/integration.test.ts`

Follow the existing patterns:
- Use descriptive test names
- Include performance measurements where relevant
- Add console output for key metrics
- Update this README when adding new test files
