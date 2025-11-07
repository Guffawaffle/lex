# Policy Check

Enforces architectural policy by checking scanner output against `lexmap.policy.json`.

## Usage

```bash
lexmap check <merged.json> <policy.json> [options]
```

### Options

- `--strict` - Fail on any violation (default behavior)
- `--report-format FORMAT` - Output format: `text`, `json`, or `markdown` (default: `text`)
- `--ticket TICKET` - Optional ticket number for tracking

### Examples

```bash
# Basic check with text output
lexmap check merged.json lexmap.policy.json

# Generate markdown report
lexmap check merged.json lexmap.policy.json --report-format markdown

# JSON output for CI/CD integration
lexmap check merged.json lexmap.policy.json --report-format json

# With ticket tracking
lexmap check merged.json lexmap.policy.json --ticket WEB-23621
```

## Exit Codes

- `0` - No violations found
- `1` - Violations detected
- `2` - Error (file not found, invalid JSON, etc.)

## Violation Types

### 1. Forbidden Caller

Detects when a module calls another module that explicitly forbids it.

**Example:**
```json
{
  "services/auth-core": {
    "forbidden_callers": ["ui/**"]
  }
}
```

If `ui/admin` tries to import from `services/auth-core`, it will be flagged.

### 2. Missing Allowed Caller

Detects when a module calls another module without being in its `allowed_callers` list.

**Example:**
```json
{
  "backend/api": {
    "allowed_callers": ["services/**"]
  }
}
```

If `ui/dashboard` tries to call `backend/api`, it will be flagged because it's not in the allowed list.

### 3. Feature Flag Violations

Detects when code accesses a gated module without checking the required feature flag.

**Example:**
```json
{
  "features/beta-ui": {
    "feature_flags": ["beta_ui_enabled"]
  }
}
```

Files in this module must check for the `beta_ui_enabled` flag.

### 4. Permission Violations

Detects when code accesses a protected module without checking required permissions.

**Example:**
```json
{
  "admin/users": {
    "requires_permissions": ["can_manage_users"]
  }
}
```

Files in this module must check for the `can_manage_users` permission.

### 5. Kill Pattern Violations

Detects anti-patterns that are scheduled for removal.

**Module-specific:**
```json
{
  "legacy/auth": {
    "kill_patterns": ["duplicate_auth_logic"]
  }
}
```

**Global:**
```json
{
  "global_kill_patterns": [
    {
      "pattern": "insecure_random",
      "description": "Replace with crypto-safe alternatives"
    }
  ]
}
```

## Report Formats

### Text Format (Default)

Human-readable output with Atlas Frame context showing relevant policy neighborhood.

```
❌ Found 2 violation(s):

📦 Module: ui/admin-panel

📊 Atlas Frame (fold radius: 1)
🌱 Seed modules: ui/admin-panel
📦 Total modules in neighborhood: 1

  ❌ Forbidden Caller
     File: src/ui/admin/AdminPanel.tsx
     Module ui/admin-panel calls services/auth-core but is forbidden
     Details: Policy forbids: ui/**
```

### JSON Format

Machine-readable output for CI/CD integration.

```json
{
  "violations": [
    {
      "file": "src/ui/admin/AdminPanel.tsx",
      "module": "ui/admin-panel",
      "type": "forbidden_caller",
      "message": "Module ui/admin-panel calls services/auth-core but is forbidden",
      "details": "Policy forbids: ui/**",
      "target_module": "services/auth-core",
      "import_from": "src/services/auth/AuthCore"
    }
  ],
  "count": 1,
  "status": "violations_found"
}
```

### Markdown Format

Formatted report suitable for PR comments and documentation.

```markdown
# Policy Check Report

**Status:** ❌ 2 violation(s) found

## Summary

| Violation Type | Count |
|----------------|-------|
| Forbidden Caller | 1 |
| Kill Pattern Violation | 1 |

## Violations by Module

### 📦 Module: `ui/admin-panel`

- **Forbidden Caller**
  - File: `src/ui/admin/AdminPanel.tsx`
  - Module ui/admin-panel calls services/auth-core but is forbidden
```

## Atlas Frame Context

Each violation report includes Atlas Frame context, showing the relevant policy neighborhood around the violating module. This helps developers understand:

- Which modules are involved
- What the policy relationships are
- Spatial layout of related modules

## Integration with CI/CD

```yaml
# Example GitHub Actions workflow
- name: Check Policy Violations
  run: |
    npm run build
    lexmap check merged.json lexmap.policy.json --report-format json > violations.json
    
- name: Comment on PR
  if: failure()
  run: |
    lexmap check merged.json lexmap.policy.json --report-format markdown > comment.md
    gh pr comment ${{ github.event.pull_request.number }} --body-file comment.md
```

## Development

### Building

```bash
npm run build:check
```

### Testing

```bash
cd policy/check
npm test
```

### Running Tests

The test suite includes 19 test cases covering:
- All violation type detection
- Report format generation
- Exit code validation
- Edge cases and error handling

## Architecture

- `violations.ts` - Core violation detection logic
- `reporter.ts` - Report formatting and output
- `lexmap-check.ts` - CLI entry point
- `check.test.mjs` - Comprehensive test suite

## Dependencies

- Depends on: `src/shared/types/` (TypeScript type definitions)
- Depends on: `src/policy/merge/` (Scanner merge output types)
- Depends on: `src/shared/atlas/` (Atlas Frame generation)
