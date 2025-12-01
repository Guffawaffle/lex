# Instructions Test Fixtures

This directory contains fixture data for testing the instructions generation feature.

## Test Scenarios

The e2e tests in `test/e2e/instructions-e2e.test.ts` use dynamically created temp directories to test:

1. **Fresh repo with `.github/`** → creates `copilot-instructions.md`
2. **Repo with `.cursorrules`** → updates with markers
3. **Repo with both** → updates both
4. **Repo with neither** → no projections
5. **Custom config path** → respects `lex.yaml`
6. **Dry-run** → no file changes
7. **Idempotent** → running twice produces same result
8. **Human content preserved** → content outside markers untouched

## Usage

Tests create isolated temp directories for each scenario, ensuring clean test environments
and no interference between tests.

Example canonical instruction content:
```markdown
# Lex Instructions

This is the canonical source for AI guidance in this repository.
```
