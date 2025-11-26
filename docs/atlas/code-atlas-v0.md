# Code Atlas v0 Specification

**Version:** code-atlas-v0  
**Status:** Implemented  
**Last Updated:** November 2025

---

## Overview

### What is Code Atlas?

Code Atlas is a **structural code intelligence** system that provides AI agents and development tools with token-efficient architectural awareness. It discovers and indexes code units (modules, classes, functions, methods) and their relationships, enabling:

1. **Navigation** — Traverse code structure without loading entire files
2. **Policy Enforcement** — Validate architectural boundaries at extraction time
3. **Memory Integration** — Provide spatial context for Frame recall

### Design Philosophy

Code Atlas follows Lex's core principles:

- **Local-First** — All processing happens locally, no cloud dependencies
- **Token-Efficient** — Fold radius limits context to essential neighborhoods
- **Policy-Aware** — Respects `lexmap.policy.json` boundaries
- **Explicit Over Implicit** — No magic inference; module IDs must match policy exactly

---

## Schemas

### CodeUnit Schema

A `CodeUnit` represents an atomic discoverable element in the codebase.

```typescript
interface CodeUnit {
  // Identity
  id: string;              // Stable hash of (repo, file, symbol, kind)
  repoId: string;          // Opaque repository identifier
  
  // Location
  filePath: string;        // Relative path (e.g., "src/foo/bar.ts")
  language: string;        // Language identifier (e.g., "ts", "js", "py")
  
  // Classification
  kind: CodeUnitKind;      // "module" | "class" | "function" | "method"
  symbolPath: string;      // Fully qualified path (e.g., "src/foo/bar.ts::MyClass.myMethod")
  name: string;            // Simple name (e.g., "myMethod")
  
  // Span
  span: {
    startLine: number;     // 1-indexed line number
    endLine: number;       // 1-indexed line number
  };
  
  // Optional metadata
  tags?: string[];         // Categorization (e.g., ["test", "ui", "infra"])
  docComment?: string;     // Documentation extract
  
  // Provenance
  discoveredAt: string;    // ISO 8601 timestamp
  schemaVersion: "code-unit-v0";
}

type CodeUnitKind = "module" | "class" | "function" | "method";
```

#### Field Semantics

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Stable identifier, computed as hash of (repoId, filePath, symbolPath, kind) |
| `repoId` | string | ✅ | Repository identifier (opaque to Code Atlas) |
| `filePath` | string | ✅ | Relative path from repository root |
| `language` | string | ✅ | Language identifier (use file extension without dot) |
| `kind` | enum | ✅ | One of: `module`, `class`, `function`, `method` |
| `symbolPath` | string | ✅ | Fully qualified symbol path with `::` separator |
| `name` | string | ✅ | Simple name (final component of symbol path) |
| `span` | object | ✅ | Line range with positive integers |
| `tags` | string[] | ❌ | Free-form categorization tags |
| `docComment` | string | ❌ | First paragraph of documentation |
| `discoveredAt` | string | ✅ | ISO 8601 timestamp of discovery |
| `schemaVersion` | literal | ✅ | Must be `"code-unit-v0"` |

#### Example CodeUnit

```json
{
  "id": "sha256:a1b2c3...",
  "repoId": "github.com/example/project",
  "filePath": "src/auth/validator.ts",
  "language": "ts",
  "kind": "class",
  "symbolPath": "src/auth/validator.ts::JWTValidator",
  "name": "JWTValidator",
  "span": { "startLine": 15, "endLine": 87 },
  "tags": ["auth", "security"],
  "docComment": "Validates JWT tokens against the configured secret and issuer.",
  "discoveredAt": "2025-11-26T14:30:00Z",
  "schemaVersion": "code-unit-v0"
}
```

### CodeAtlasRun Schema

A `CodeAtlasRun` records provenance for each extraction run.

```typescript
interface CodeAtlasRun {
  runId: string;              // Unique run identifier
  repoId: string;             // Repository being scanned
  
  // Scope
  filesRequested: string[];   // Files/patterns requested
  filesScanned: string[];     // Files actually scanned
  
  // Results
  unitsEmitted: number;       // Number of CodeUnits produced
  limits: Limits;             // Applied limits
  truncated: boolean;         // Whether results were truncated
  
  // Strategy
  strategy?: "static" | "llm-assisted" | "mixed";
  
  // Provenance
  createdAt: string;          // ISO 8601 timestamp
  schemaVersion: "code-atlas-run-v0";
}

interface Limits {
  maxFiles?: number;          // Maximum files to scan
  maxBytes?: number;          // Maximum bytes to process
}
```

#### Example CodeAtlasRun

```json
{
  "runId": "run-2025-11-26-001",
  "repoId": "github.com/example/project",
  "filesRequested": ["src/**/*.ts"],
  "filesScanned": ["src/auth/validator.ts", "src/auth/service.ts", "src/api/routes.ts"],
  "unitsEmitted": 47,
  "limits": { "maxFiles": 100, "maxBytes": 10485760 },
  "truncated": false,
  "strategy": "static",
  "createdAt": "2025-11-26T14:30:00Z",
  "schemaVersion": "code-atlas-run-v0"
}
```

### Schema Versioning Policy

Code Atlas uses **literal schema version fields** for explicit versioning:

1. **Backward Compatible Changes** — Add optional fields without version bump
2. **Breaking Changes** — Increment version suffix (e.g., `code-unit-v0` → `code-unit-v1`)
3. **Validation** — Schemas enforce version literals; unknown versions are rejected
4. **Migration** — When a new version is released, migration tools are provided

---

## CLI Usage

### Basic Commands

```bash
# Recall with Atlas Frame (default: 1-hop radius)
lex recall "auth timeout"

# Custom fold radius
lex recall "auth timeout" --fold-radius 2

# Auto-tune radius to fit token limit
lex recall "auth timeout" --auto-radius --max-tokens 5000

# Show cache statistics
lex recall "auth timeout" --cache-stats
```

### Remember with Module Scope

```bash
# Capture Frame with modules (enables Atlas Frame on recall)
lex remember \
  --reference-point "implementing auth" \
  --summary "Added JWT validation" \
  --next "Wire up password reset" \
  --modules "services/auth,api/middleware"
```

### Output Formats

```bash
# Human-readable output (default)
lex recall "auth"

# JSON output for scripting
lex recall "auth" --json

# JSONL mode for streaming
LEX_CLI_OUTPUT_MODE=jsonl lex recall "auth"
```

### Advanced Options

| Option | Description | Default |
|--------|-------------|---------|
| `--fold-radius <n>` | Number of hops from seed modules | `1` |
| `--auto-radius` | Automatically reduce radius to fit token limit | `false` |
| `--max-tokens <n>` | Token limit for Atlas Frame (requires `--auto-radius`) | None |
| `--cache-stats` | Show cache hit/miss statistics | `false` |
| `--json` | Output in JSON format | `false` |

---

## Atlas Frame Algorithm

### Fold Radius Extraction

The core algorithm extracts the N-hop neighborhood around seed modules:

```
Algorithm: extractNeighborhood(policy, seedModules, foldRadius)
  
  1. Initialize:
     - visited = Set()
     - queue = [(module, 0) for module in seedModules]
     - edges = []
  
  2. BFS Traversal:
     while queue is not empty:
       (module, distance) = queue.pop()
       if module in visited: continue
       visited.add(module)
       
       if distance < foldRadius:
         for neighbor in getNeighbors(module, policy):
           edges.add((module, neighbor))
           queue.push((neighbor, distance + 1))
  
  3. Return:
     - modules: visited
     - edges: deduplicated edges
```

### Edge Discovery

Edges are derived from `allowed_callers` and `forbidden_callers` in the policy:

- **Allowed Edge** — Target module lists source in `allowed_callers`
- **Forbidden Edge** — Target module lists source in `forbidden_callers`

Both types are included because forbidden edges provide important context about architectural boundaries.

### Coordinate Generation

For visualization, a force-directed layout algorithm assigns 2D coordinates:

1. **Repulsion** — All nodes repel each other (prevents overlap)
2. **Attraction** — Allowed edges attract connected nodes
3. **Iterations** — Run 50 iterations for stable layout

### Performance Characteristics

| Operation | Complexity | Typical Time |
|-----------|------------|--------------|
| BFS Traversal | O(V + E) | < 10ms |
| Coordinate Generation | O(V² × I) | < 100ms |
| Full Atlas Frame | Combined | < 200ms |

Where V = modules, E = edges, I = iterations (50).

---

## Atlas Frame Output

### Structure

```json
{
  "atlas_timestamp": "2025-11-26T14:30:00Z",
  "seed_modules": ["ui/user-admin-panel"],
  "fold_radius": 1,
  "modules": [
    {
      "id": "ui/user-admin-panel",
      "coords": [342, 567],
      "owns_paths": ["ui/admin/**"],
      "allowed_callers": [],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"]
    },
    {
      "id": "services/user-access-api",
      "coords": [521, 589],
      "allowed_callers": ["ui/user-admin-panel"]
    }
  ],
  "edges": [
    {
      "from": "ui/user-admin-panel",
      "to": "services/user-access-api",
      "allowed": true
    },
    {
      "from": "ui/user-admin-panel",
      "to": "services/auth-core",
      "allowed": false,
      "reason": "forbidden_caller"
    }
  ],
  "critical_rule": "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming."
}
```

### Token Efficiency

| Fold Radius | Typical Modules | Approximate Tokens |
|-------------|-----------------|-------------------|
| 0 | 1-3 | ~100 |
| 1 | 5-10 | ~500 |
| 2 | 15-30 | ~1,500 |
| 3 | 40-80 | ~4,000 |

Compare to full dependency graph: 100+ modules = 50,000+ tokens.

---

## Caching

Atlas Frames are cached by `(module_scope, fold_radius)` key:

### Features

- **LRU Eviction** — Least recently used entries evicted when full
- **Normalized Keys** — Module order doesn't matter
- **Statistics** — Track hits, misses, evictions, hit rate
- **Configurable** — Default 100 entries, adjustable via API

### Usage

```typescript
import { getCacheStats, resetCache, setEnableCache } from '@smartergpt/lex/shared/atlas';

// Get cache statistics
const stats = getCacheStats();
console.log(`Hit rate: ${(stats.hits / (stats.hits + stats.misses) * 100).toFixed(1)}%`);

// Clear cache
resetCache();

// Disable caching
setEnableCache(false);
```

---

## Auto-Tuning

Automatically adjust fold radius to fit within token limits:

```typescript
import { autoTuneRadius, generateAtlasFrame } from '@smartergpt/lex/shared/atlas';

const result = autoTuneRadius(
  (radius) => generateAtlasFrame(seedModules, radius),
  3,      // requested radius
  5000,   // max tokens
  (oldRadius, newRadius, tokens, limit) => {
    console.log(`Reduced radius ${oldRadius} → ${newRadius}`);
  }
);

console.log(`Used radius ${result.radiusUsed} (${result.tokensUsed} tokens)`);
```

---

## Integration

### With LexRunner

LexRunner orchestration can use Code Atlas for policy-aware task distribution:

```typescript
// Generate Atlas Frame for merge conflict context
const atlasFrame = generateAtlasFrame(
  conflictingModules,
  1  // 1-hop for immediate neighbors
);

// Check for forbidden edges before suggesting resolution
const forbiddenEdges = atlasFrame.edges.filter(e => !e.allowed);
if (forbiddenEdges.length > 0) {
  // Adjust resolution strategy to respect boundaries
}
```

### Policy Seeding

Atlas can seed initial policy from directory structure:

```bash
# Generate seed policy
lex init --policy

# Result: .smartergpt/lex/lexmap.policy.json with discovered modules
```

### Custom Extractors

Implement language-specific extractors by producing CodeUnit objects:

```typescript
import { parseCodeUnit, type CodeUnit } from '@smartergpt/lex/atlas';

function extractPythonUnits(filePath: string, content: string): CodeUnit[] {
  const units: CodeUnit[] = [];
  
  // Parse Python AST and extract classes/functions
  // ...
  
  return units.map(u => parseCodeUnit(u));  // Validate schema
}
```

---

## Error Handling

### Validation Errors

```typescript
import { validateCodeUnit } from '@smartergpt/lex/atlas';

const result = validateCodeUnit(rawData);
if (!result.success) {
  console.error("Validation failed:", result.error.issues);
  // [{ path: ['span', 'startLine'], message: 'Expected positive number' }]
}
```

### Module ID Validation

The Critical Rule: Every module name in `module_scope` MUST match module IDs in `lexmap.policy.json`.

```bash
# Error: Module 'auth' not found. Did you mean 'services/auth-core'?
lex remember --modules "auth" --summary "test" --next "test"
```

---

## See Also

- [API Reference](./api-reference.md) — HTTP and MCP endpoints
- [Examples](./examples.md) — Complete usage examples
- [Mind Palace Guide](../MIND_PALACE.md) — Atlas Frames in context
- [Architecture](../ARCHITECTURE.md) — Overall system design
