# Test Fixtures for Prompt Loader Tests

This directory contains test fixtures used by `test/shared/prompts/loader.test.ts` to verify the precedence chain behavior.

## Structure

```
test/fixtures/
├── canon/
│   └── prompts/
│       ├── test.md          # Used to test LEX_CANON_DIR precedence
│       └── env-only.md      # Unique to canon, tests deduplication
└── local-overlay/
    └── prompts/
        ├── test.md          # Used to test .smartergpt.local/ precedence
        └── local-only.md    # Unique to local, tests deduplication
```

## Usage

These fixtures are copied into temporary test directories during test execution to simulate the 3-level precedence chain:

1. **LEX_CANON_DIR/prompts** (explicit environment override)
2. **.smartergpt.local/prompts/** (local overlay)
3. **prompts/** (published package location)

## Precedence Tests

- `test.md` exists in multiple locations to verify override behavior
- `env-only.md` and `local-only.md` are unique to their respective locations to test deduplication in `listPrompts()`

## Notes

- Fixtures are minimal markdown files with simple content
- Tests create temporary directories and copy these fixtures as needed
- All temporary directories are cleaned up after tests complete
