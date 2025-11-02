# Limitations & Future Work

This document tracks known constraints in Lex and planned enhancements.

## Current Limitations

### Module ID Drift and Aliasing (Future Work)

**THE CRITICAL RULE** is currently strict:
> Module IDs in Frames must match the IDs in `lexmap.policy.json` exactly.

This is correct for CI (policy enforcement must be unambiguous), but humans are messy:
- People type shorthand or old names when capturing a Frame via `/remember`
- Teams rename modules over time

Planned direction:
- `shared/aliases/` will maintain an alias table mapping historical or shorthand names to canonical module IDs
- Recall (`lex recall`) will be allowed to resolve aliases/fuzzy matches with confidence scores
- CI (`lex check`) will remain strict

This gives us strict enforcement where it matters (policy/CI) and forgiveness where it's human-facing (recall).

### Single-Repo Scope

Currently, Lex assumes one `lexmap.policy.json` per codebase. For monorepos with multiple products or microservice architectures, this means:
- One unified policy file (can get large)
- Or separate Lex instances per service (loses cross-service policy view)

Future: Support for hierarchical policy files or policy composition.

### Scanner Coverage

Language scanners are "dumb by design" (emit facts, don't interpret). Current coverage:
- ✅ TypeScript (imports, function calls)
- ✅ Python (imports, function calls)
- ✅ PHP (namespace imports, function calls)
- ❌ Java, C#, Go, Rust (not yet implemented)

Adding a new language scanner is straightforward (emit JSON facts), but requires per-language work.

### Memory Card Rendering

Frame memory card images are generated but currently minimal:
- Text-based layout
- No visual policy graph yet
- No syntax-highlighted diffs

Future: Render Atlas Frame as interactive SVG/Canvas graph showing allowed/forbidden edges with visual indicators.

### No Cloud Sync

Frames are stored locally (SQLite, local-only). This is by design (no telemetry, no surveillance), but means:
- No cross-machine sync
- No team-wide Frame sharing
- Backup is user's responsibility

Future: Optional self-hosted sync server for teams (still no SaaS dependency).

### Fold Radius Fixed at 1

Currently, fold radius is hardcoded to 1 hop. Future:
- Allow variable radius (0 for just seed modules, 2 for deeper context)
- Auto-tune radius based on context window limits
- Cache computed Atlas Frames by `(module_scope, radius)` key

## Planned Enhancements

### Merge Conflict Assistance

When `/recall` returns a Frame + Atlas Frame, the system could:
- Detect if current branch has diverged
- Show policy changes since Frame was captured
- Highlight new violations introduced by other work

### Integration with CI/CD

- Automatic Frame capture on CI failure (with logs, test results, stack traces)
- `/recall` in CI comments on PRs ("this violates policy X, see Frame Y for context")

### Visual Timeline

- Render all Frames for a ticket/branch as timeline
- Show evolution of `module_scope` over time (what modules were touched when)
- Highlight when blockers were introduced vs resolved

### Policy Change Impact Analysis

When updating `lexmap.policy.json`:
- Show which existing Frames would be affected
- Identify Frames that reference renamed/deleted modules
- Generate migration plan for alias table

## Known Bugs

None currently. This is early alpha — bugs will be filed as issues in GitHub.

---

**Last updated:** 2025-11-02 (during LexBrain + LexMap merge)
