# CLI Surface

**User-facing commands for Lex**

This directory will contain the entry point for the `lex` command-line tool, which orchestrates both `memory/` and `policy/` subsystems.

## Intended commands

### `lex init`
Initialize a Lex workspace with prompts and optionally generate seed policy.

```bash
# Basic initialization
lex init
# Creates .smartergpt/ workspace with prompts and minimal policy

# Generate seed policy from directory structure
lex init --policy
# Scans src/ for TypeScript/JavaScript modules
# Generates .smartergpt/lex/lexmap.policy.json with discovered modules

# Force overwrite existing workspace
lex init --force --policy
```

**Implementation:**
1. Create `.smartergpt/` workspace directory
2. Copy canon prompts to `.smartergpt/prompts/`
3. If `--policy` flag is set:
   - Scan `src/` directory for TypeScript/JavaScript files
   - Generate module IDs from directory paths (e.g., `src/memory/store/` → `memory/store`)
   - Create policy file with discovered modules and match patterns
4. Otherwise, copy example policy or create minimal policy
5. Non-destructive: skip if workspace exists unless `--force`

**Options:**
- `--force` — Overwrite existing files
- `--policy` — Generate seed policy from src/ directory structure
- `--prompts-dir <path>` — Custom prompts directory (default: .smartergpt/prompts)

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

### `lex timeline`
Show visual timeline of Frame evolution for a ticket or branch.

```bash
lex timeline TICKET-123
lex timeline feature/auth-fix
```

**Implementation:**
1. Query `memory/store/` for all Frames matching ticket ID or branch name
2. Sort Frames chronologically
3. Build timeline tracking module scope changes and blocker evolution
4. Render timeline with multiple visualization options

**Options:**
- `--since <date>` — Filter frames since this date (ISO 8601)
- `--until <date>` — Filter frames until this date (ISO 8601)
- `--format <type>` — Output format: text, json, or html (default: text)
- `--output <file>` — Write output to file instead of stdout

**Output example (text):**
```
TICKET-123: Add user authentication
═══════════════════════════════════

Nov 1, 14:00  [Frame #abc123]  Started implementation
              Modules: ui/login-form
              Status: ✅ In progress
              
Nov 2, 09:30  [Frame #def456]  Auth API integration
              Modules: ui/login-form, services/auth-core
                       + Added: services/auth-core
              Status: ⚠️  Blocked
                       + ⚠️  CORS configuration issue
              
Nov 2, 16:45  [Frame #ghi789]  Fixed CORS, tests failing
              Modules: ui/login-form, services/auth-core
              Status: ❌ Tests failing
                       - ✅ Resolved: CORS configuration issue
                       ❌ test_login_flow
              
Nov 3, 11:20  [Frame #jkl012]  All tests passing
              Modules: ui/login-form, services/auth-core
              Status: ✅ In progress

═══════════════════════════════════

Module Scope Evolution:

services/auth-core   ███  (3/4 frames)
ui/login-form       ████  (4/4 frames)

Blocker Tracking:

Frame 1: No blockers
Frame 2: + CORS configuration issue
Frame 3: - CORS configuration issue (resolved)
Frame 4: No blockers
```

**HTML output:**
```bash
lex timeline TICKET-123 --format=html --output=timeline.html
```

Generates an interactive HTML page with visual timeline, color-coded status indicators, and expandable frames.

**JSON output:**
```bash
lex timeline TICKET-123 --format=json
```

Exports timeline data as JSON for programmatic use or integration with other tools.

## Implementation plan

1. Create `shared/cli/lex.ts` as main entry point
2. Use a CLI framework (e.g., `commander` for Node, `argparse` for Python)
3. Each command calls into appropriate subsystem:
   - `remember` → `memory/frames/`
   - `recall` → `memory/store/` + `shared/atlas/`
   - `check` → `policy/check/`
   - `timeline` → `memory/store/` + `memory/renderer/timeline`
4. Build as executable binary or package for distribution

## Integration

The CLI is the **unified surface** for Lex. Users don't need to know about `memory/` vs `policy/` — they just run `lex` commands that do the right thing.

This is what makes Lex one product instead of two separate tools.

---

**Status:** ✅ Implemented

**Commands available:**
- ✅ `lex init` — Initialize workspace with prompts and policy (with `--policy` for auto-generation)
- ✅ `lex remember` — Capture work session frames
- ✅ `lex recall` — Retrieve frames by reference or ticket
- ✅ `lex check` — Enforce policy in CI
- ✅ `lex timeline` — Visualize frame evolution

**Depends on:**
- ✅ `memory/frames/`, `memory/store/`, `memory/recall` implementations
- ✅ `policy/check/` implementation
- ✅ `shared/module_ids/` validation
- ✅ `shared/atlas/` fold radius export
- ✅ `memory/renderer/timeline` visualization
