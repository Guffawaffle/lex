# policy/

**Lex Policy Layer: architectural policy enforcement**

This directory contains everything related to defining and enforcing architectural boundaries in code.

## Subdirectories

- **`policy_spec/`** — Example `lexmap.policy.json` files, schema documentation
- **`scanners/`** — Language-specific "dumb" scanners that emit structural facts from code (TypeScript, Python, PHP, etc.)
- **`merge/`** — Combines scanner outputs into unified `merged.json`
- **`check/`** — Compares `merged.json` against `lexmap.policy.json`, reports violations, exits with appropriate code for CI

## Key concepts

**Policy as code:** `lexmap.policy.json` declares:
- Which modules own which code paths (`owns_paths`)
- Which calls are allowed (`allowed_callers`)
- Which calls are forbidden (`forbidden_callers`)
- Which feature flags gate access (`feature_flags`)
- Which permissions are required (`requires_permissions`)
- Which patterns are being removed (`kill_patterns`)

**Scanners are dumb by design:** They emit facts (imports, function calls, class hierarchies) without interpretation. The `check/` step does the policy enforcement.

**Exit codes for CI:**
- `0` — No violations
- `1` — Policy violations found
- `2` — Tool error (missing policy file, invalid JSON, etc.)

## Integration with memory/

When a Frame is created via `/remember`, its `module_scope` field must reference module IDs that exist in `lexmap.policy.json` (THE CRITICAL RULE). This ensures that when you later `/recall` that Frame, `shared/atlas/` can export the fold-radius neighborhood from the policy graph.

---

**Note:** This code originated from the LexMap repo during the merge to `lex`.
