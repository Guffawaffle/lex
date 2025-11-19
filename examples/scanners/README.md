# External Scanner Examples

These are **optional example implementations** of language-specific scanners that demonstrate the LexMap scanner plugin architecture. They are provided as reference implementations for users who need multi-language code scanning.

## ⚠️ Security Notice

**THESE ARE EXAMPLES, NOT PRODUCTION-HARDENED TOOLS**

- **Not audited for security vulnerabilities** - Use at your own risk
- **Execute code analysis on your filesystem** - Ensure you trust the scanned directories
- **No sandboxing** - Scanners run with your full user permissions
- **No input validation** - Do not run on untrusted codebases without thorough review
- **Not part of core Lex security audits** - External scanner security is user's responsibility

### Safe Usage Guidelines

1. **Only scan code you control or explicitly trust**
2. **Review scanner source before running** (both scanners are < 400 lines - readable in 15 minutes)
3. **Run in isolated environments for untrusted code** (Docker containers, VMs, or sandboxed CI/CD)
4. **Validate scanner output** before feeding to `lex check` or policy enforcement
5. **Keep Python runtime updated** to avoid vulnerabilities in the interpreter itself

### For Production Scanning Pipelines

If you plan to use these scanners in production:
- **Audit the scanner code thoroughly** for your security requirements
- **Run in sandboxed CI/CD environments** with minimal permissions
- **Implement output validation and sanitization** before policy checks
- **Consider commercial AST analysis tools** with security SLAs and vendor support
- **Monitor scanner execution** for unexpected behavior or resource usage

## ⚠️ Important Notice

- **These scanners are NOT part of the core Lex library**
- **They require external runtimes:** Python 3.7+ and/or PHP 7.4+ must be installed on your PATH
- **They are not executed by `lex` CLI commands** - the `lex check` command consumes pre-generated scanner JSON output, not the scanners themselves
- **The TypeScript scanner (`src/policy/scanners/ts_scanner.ts`) is the primary, officially supported scanner**

## Available Scanners

### Python Scanner (`python_scanner.py`)

Scans Python codebases and extracts architectural facts.

**Requirements:** Python 3.7+ (no external dependencies)

```bash
# Without policy (basic scanning)
python3 python_scanner.py <directory> > output.json

# With policy (includes module_scope and module_edges)
python3 python_scanner.py <directory> policy.json > output.json
```

### PHP Scanner (`php_scanner.py`)

Scans PHP codebases and extracts architectural facts.

**Requirements:** Python 3.7+ (scanner is written in Python, scans PHP code)

```bash
# Without policy
python3 php_scanner.py <directory> > output.json

# With policy
python3 php_scanner.py <directory> policy.json > output.json
```

## Scanner Plugin Architecture

All scanners follow the same design philosophy: **"dumb by design"**.

### What Scanners Do
- Observe code and report facts
- Extract: classes, functions, imports, declarations
- Detect: feature flags, permission checks
- Map: files to modules (when policy provided)
- Identify: cross-module boundaries

### What Scanners DON'T Do
- Make architectural decisions
- Enforce policies
- Decide if imports are allowed
- Determine if boundaries are violated

**Policy enforcement happens separately** in the `policy/check/` subsystem, which compares scanner output against `lexmap.policy.json`.

## Output Format

All scanners produce JSON conforming to the same schema:

```json
{
  "language": "python",
  "files": [
    {
      "path": "services/auth/service.py",
      "module_scope": "services/auth",
      "declarations": [
        { "type": "class", "name": "AuthService" }
      ],
      "imports": [
        {
          "from": "services.user.models",
          "type": "import_statement",
          "imported": ["User"]
        }
      ],
      "feature_flags": ["new_auth_flow"],
      "permissions": ["can_authenticate"],
      "warnings": []
    }
  ],
  "module_edges": [
    {
      "from_module": "services/auth",
      "to_module": "services/user",
      "from_file": "services/auth/service.py",
      "import_statement": "services.user.models"
    }
  ]
}
```

## Integration Workflow

These external scanners fit into the LexMap pipeline as **optional first-stage processors**:

```bash
# 1. Scan each language (only if you need multi-language support)
npx tsx src/policy/scanners/ts_scanner.ts src/ policy.json > ts.json
python3 examples/scanners/python_scanner.py backend/ policy.json > py.json
python3 examples/scanners/php_scanner.py api/ policy.json > php.json

# 2. Merge scanner outputs
node src/policy/merge/lexmap-merge.ts ts.json py.json php.json > merged.json

# 3. Check against policy using lex CLI
lex check merged.json policy.json
```

**For TypeScript-only projects:** You only need the first-party TypeScript scanner from `src/policy/scanners/ts_scanner.ts`.

## Feature Detection Patterns

### Feature Flags

**Python:**
- `feature_flags.is_enabled('flag_name')`
- `FeatureFlags.enabled('flag_name')`
- `settings.FEATURES['flag_name']`

**PHP:**
- `FeatureFlags::enabled('flag_name')`
- `$featureFlags->isEnabled('flag_name')`
- `config('features.flag_name')`

### Permission Checks

**Python:**
- `user.has_perm('permission_name')`
- `check_permission('permission_name')`
- `@permission_required('permission_name')`

**PHP:**
- `$user->can('permission_name')`
- `Gate::allows('permission_name')`
- `$this->authorize('permission_name')`

## Testing

These scanners have integration tests in `src/policy/scanners/test_scanners.ts` that are **conditionally executed** based on environment flags.

To run the external scanner integration tests:

```bash
# Enable external scanner tests (requires Python 3.7+)
LEX_ENABLE_EXTERNAL_SCANNER_TESTS=1 npm test
```

Without the flag, these tests are skipped and `npm test` passes with Node.js alone.

## Module Resolution

When you provide a `policy.json` file, scanners:

1. Load the policy's `modules` definitions
2. Match file paths against `owns_paths` glob patterns
3. Set `module_scope` for each file
4. Detect cross-module imports and populate `module_edges`

Example policy excerpt:

```json
{
  "modules": {
    "services/auth": {
      "owns_paths": ["services/auth/**"],
      "owns_namespaces": ["App\\Services\\Auth"]
    },
    "services/user": {
      "owns_paths": ["services/user/**"]
    }
  }
}
```

## Creating Your Own Scanner

To implement a scanner for another language:

1. **Choose your implementation language** (Python, TypeScript, Ruby, etc.)
2. **Follow the output schema** (see Output Format above)
3. **Reuse pattern detection logic** from existing scanners
4. **Keep it simple** - scanners observe, they don't enforce
5. **Test** with the integration test framework (optional)
6. **Document** runtime requirements clearly

The scanner architecture is intentionally minimal to support community contributions.

## Philosophy

> **Scanners are dumb by design.**

This architectural principle keeps language-specific logic isolated and simple. Complex policy decisions happen in the language-agnostic `policy/check/` subsystem, ensuring consistent enforcement across all scanned languages.

## Support Status

| Scanner | Status | Maintenance | Runtime Required |
|---------|--------|-------------|------------------|
| TypeScript (`src/policy/scanners/ts_scanner.ts`) | ✅ **Officially Supported** | Active | Node.js only |
| Python (`examples/scanners/python_scanner.py`) | 📦 **Example** | Community | Python 3.7+ |
| PHP (`examples/scanners/php_scanner.py`) | 📦 **Example** | Community | Python 3.7+ |

**For production use:** We recommend the TypeScript scanner, which is actively maintained and requires only Node.js.
