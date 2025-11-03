# policy/merge

**Scanner output merge subsystem**

Combines scanner outputs from multiple language scanners into a single unified view.

## Overview

The merge subsystem takes JSON outputs from language-specific scanners (TypeScript, Python, PHP, etc.) and produces a single `merged.json` file that represents the entire codebase's observed structure.

## Files

- **`types.ts`** — Type definitions for scanner outputs and merged results
- **`merge.ts`** — Core merge logic with deduplication and conflict detection
- **`lexmap-merge.ts`** — CLI tool for merging scanner outputs
- **`merge.test.mjs`** — Comprehensive test suite (19 test cases)

## Usage

### Basic Usage

```bash
# Merge to stdout
node lexmap-merge.ts scan1.json scan2.json > merged.json

# Merge to file
node lexmap-merge.ts scan1.json scan2.json -o merged.json

# Full workflow example
python3 php_scanner.py app/ > php.json
node ts_scanner.ts ui/ > ts.json
node lexmap-merge.ts php.json ts.json -o merged.json
```

### Options

- `-o, --output FILE` — Write output to FILE instead of stdout

## Merged Output Format

The merged output follows this versioned structure:

```json
{
  "version": "1.0.0",
  "sources": ["typescript", "python"],
  "files": [
    {
      "path": "src/auth.ts",
      "declarations": [
        {"type": "function", "name": "login"}
      ],
      "imports": [
        {"from": "./utils", "type": "import_statement"}
      ],
      "feature_flags": ["auth_v2"],
      "permissions": ["can_login"],
      "warnings": []
    }
  ],
  "edges": [
    {
      "from": "src/auth.ts",
      "to": "./utils",
      "source_file": "src/auth.ts",
      "import_from": "./utils"
    }
  ],
  "warnings": []
}
```

### Field Descriptions

- **`version`** (string) — Format version for compatibility tracking
- **`sources`** (array of strings) — Languages of scanners that were merged (e.g., `["typescript", "python"]`)
- **`files`** (array) — All files from all scanners, deduplicated by path and sorted alphabetically
  - **`path`** (string) — Relative file path
  - **`declarations`** (array) — Classes, functions, interfaces declared in this file
  - **`imports`** (array) — Import statements in this file
  - **`feature_flags`** (array) — Feature flags observed in this file
  - **`permissions`** (array) — Permissions checked in this file
  - **`warnings`** (array) — Any warnings from the scanner
- **`edges`** (array) — Cross-file dependencies (file → import relationships)
  - **`from`** (string) — Source file path
  - **`to`** (string) — Import target (as written in code)
  - **`source_file`** (string) — File where the import occurs
  - **`import_from`** (string) — Import statement target
- **`warnings`** (array) — Warnings from the merge process

## Merge Logic

### Deduplication

- **Files:** Deduplicated by `path`. If the same file appears in multiple scanner outputs from different languages, a conflict error is raised.
- **Edges:** Deduplicated by `(from, to)` tuple. Multiple imports of the same module from the same file result in a single edge.
- **Feature Flags & Permissions:** Merged and deduplicated per file.

### Conflict Detection

If the same file path appears in outputs from different language scanners (e.g., `src/utils.ts` in both TypeScript and JavaScript scanner outputs), the merge fails with a clear error message:

```
Error: File ownership conflicts detected:
File "src/utils.ts" claimed by multiple scanners: typescript, javascript

Each file should be scanned by exactly one language scanner.
```

### Determinism

The merge process is:
- **Deterministic:** Same inputs always produce same output
- **Idempotent:** Merging the same scan multiple times produces the same result
- **Sorted:** Files are sorted alphabetically by path for consistent output

## Integration

### With Policy Enforcement

The merged output feeds into the policy checker (`policy/check/`), which:
1. Resolves file paths → module IDs using `lexmap.policy.json`
2. Converts file-level edges to module-level edges
3. Checks `allowed_callers` vs. actual dependencies
4. Reports policy violations

### With Atlas Frames

Module edges can be used to:
- Generate architectural diagrams
- Export fold-radius neighborhoods
- Visualize cross-module dependencies

## Testing

Run the test suite:

```bash
npm test
```

The test suite includes 19 test cases covering:
- ✅ Merging multiple scanner outputs
- ✅ Edge deduplication
- ✅ File ownership conflict detection
- ✅ Empty scanner handling
- ✅ Feature flag and permission aggregation
- ✅ Deterministic output
- ✅ Input validation

## Philosophy

> **The merge tool is DUMB BY DESIGN.**
> 
> It combines scanner outputs mechanically, without making architectural decisions.
> It does NOT:
> - Resolve module boundaries (that's the policy file's job)
> - Enforce allowed/forbidden relationships (that's the checker's job)
> - Interpret the code (that's the scanner's job)
> 
> It ONLY:
> - Deduplicates files and edges
> - Detects conflicts
> - Aggregates observations

## Version History

### 1.0.0 (Current)

- Initial versioned format
- File deduplication
- Edge deduplication
- Conflict detection
- Feature flag and permission aggregation
- CLI with `-o` flag support
