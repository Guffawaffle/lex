# Merge-Weave Session 01830f84-d7e4-47c5-82eb-743284ac9987

This umbrella PR consolidates **7 open pull requests** implementing Atlas Frame + Mind Palace features for the unified LexBrain + LexMap architecture.

## Folded PRs

### Level 0: Foundation
- [ ] #14 - Add TypeScript type definitions for Frame and Policy schemas
  - Branch: `copilot/add-typescript-definitions-frame-policy`
  - Fixes #3

### Level 1: Core Utilities
- [ ] #15 - Implement module ID validation with fuzzy matching
  - Branch: `copilot/implement-module-id-validation`
  - Fixes #4

- [ ] #16 - Implement fold radius algorithm for policy graph spatial neighborhoods
  - Branch: `copilot/implement-fold-radius-algorithm`
  - Fixes #5

- [ ] #17 - Implement Frame storage with SQLite + FTS5
  - Branch: `copilot/implement-frame-storage-sqlite`
  - Fixes #6

- [ ] #19 - Add module_scope and cross-module edge detection to language scanners
  - Branch: `copilot/enhance-language-scanners`
  - Fixes #10

- [ ] #20 - Implement memory card visual rendering for Frame snapshots
  - Branch: `copilot/implement-memory-card-rendering`
  - Fixes #8

### Level 2: Integration
- [ ] #18 - Implement Frame MCP server for AI assistant integration
  - Branch: `copilot/implement-frame-mcp-server`
  - Fixes #9

## Issue Closures

Closes #3
Closes #4
Closes #5
Closes #6
Closes #8
Closes #9
Closes #10

## Blockers

_None yet - will update as fold-ins progress._

## Merge Strategy

- **No fast-forward** merges for auditability
- **Dry-run first** for each fold-in
- **Gates**: lint, typecheck, unit-test, determinism (where applicable)
- **Sibling proceeds**: Yes - level 1 PRs can fold independently if gates pass

## Session Artifacts

All deliverables under `.smartergpt.local/deliverables/_session/`:
- `plan.json` - Dependency graph
- `merge-order.json` - Topological merge sequence
- `gate-definitions.json` - Gate catalog
- `policy.json` - Merge-weave policy
- `fold-ins.ndjson` - Append-only fold-in log

---

**Session ID**: `01830f84-d7e4-47c5-82eb-743284ac9987`
**Created**: 2025-11-02
