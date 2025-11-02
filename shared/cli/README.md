# CLI Surface

**User-facing commands for Lex**

This directory will contain the entry point for the `lex` command-line tool, which orchestrates both `memory/` and `policy/` subsystems.

## Intended commands

### `lex remember`
Capture a work session Frame.

```bash
lex remember \
  --jira TICKET-123 \
  --reference-point "that auth deadlock" \
  --summary "Admin panel calling forbidden service" \
  --next "Reroute through user-access-api" \
  --modules ui/user-admin-panel,services/auth-core \
  --blockers "Direct call to auth-core forbidden by policy"
```

**Implementation:**
1. Validate `--modules` against `lexmap.policy.json` using `shared/module_ids/`
2. Create Frame object with structured metadata
3. Store in `memory/store/` (SQLite)
4. Optionally generate memory card image via `memory/renderer/`
5. Return Frame ID for later recall

### `lex recall`
Retrieve a Frame by reference point or ticket ID.

```bash
lex recall TICKET-123
lex recall "that auth deadlock"
```

**Implementation:**
1. Search `memory/store/` for Frame matching input (exact ticket ID or fuzzy `reference_point`)
2. Retrieve Frame metadata
3. Call `shared/atlas/` to export fold-radius neighborhood for Frame's `module_scope`
4. Return both Frame (temporal) + Atlas Frame (spatial)
5. Optionally render as JSON, markdown, or visual card

**Output example:**
```
Frame: TICKET-123 (2025-11-01 16:04)
Reference: "that auth deadlock"
Branch: feature/auth-fix

Summary: Admin panel calling forbidden service
Next action: Reroute through user-access-api
Blockers:
  - Direct call to auth-core forbidden by policy

Atlas Frame (fold radius 1):
  Modules touched:
    - ui/user-admin-panel [beta_user_admin]
    - services/auth-core

  Allowed edges:
    ✓ ui/user-admin-panel → services/user-access-api

  Forbidden edges:
    ✗ ui/user-admin-panel → services/auth-core (policy violation)
```

### `lex check`
Enforce policy against scanned code (for CI).

```bash
lex check merged.json lexmap.policy.json
```

**Implementation:**
1. Load `merged.json` (scanner output) and `lexmap.policy.json`
2. Call `policy/check/` to compare facts vs policy
3. Report violations:
   - Forbidden calls
   - Missing required permissions
   - Active kill patterns
   - Feature flag violations
4. Exit with appropriate code:
   - `0` — No violations
   - `1` — Policy violations found
   - `2` — Tool error

**Output example:**
```
Policy violations found:

❌ ui/user-admin-panel → services/auth-core
   Reason: Forbidden caller
   Location: web-ui/userAdmin/AddUserButton.ts:42
   Fix: Route through services/user-access-api instead

Exit code: 1
```

## Implementation plan

1. Create `shared/cli/lex.ts` as main entry point
2. Use a CLI framework (e.g., `commander` for Node, `argparse` for Python)
3. Each command calls into appropriate subsystem:
   - `remember` → `memory/frames/`
   - `recall` → `memory/store/` + `shared/atlas/`
   - `check` → `policy/check/`
4. Build as executable binary or package for distribution

## Integration

The CLI is the **unified surface** for Lex. Users don't need to know about `memory/` vs `policy/` — they just run `lex` commands that do the right thing.

This is what makes Lex one product instead of two separate tools.

---

**Status:** Not yet implemented. This is placeholder documentation for the intended CLI.

**Depends on:**
- `memory/frames/`, `memory/store/`, `memory/recall` implementations
- `policy/check/` implementation
- `shared/module_ids/` validation
- `shared/atlas/` fold radius export
