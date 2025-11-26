# Code Atlas

**Structural code intelligence for AI agents and development tools**

Code Atlas provides a semantic index of your codebase — discovering code units (modules, classes, functions, methods) and their relationships. It enables AI assistants and tooling to navigate, understand, and enforce architectural policies without overwhelming token budgets.

---

## Quick Start

### 1. Understand the Core Concepts

**Code Atlas** consists of two main components:

- **CodeUnit** — An atomic discoverable element (module, class, function, method)
- **CodeAtlasRun** — Provenance record for each extraction run

These schemas power Lex's spatial memory capabilities, enabling token-efficient architectural awareness.

### 2. Use with Lex CLI

Atlas integrates with Lex's Frame memory system. When you recall a Frame, an **Atlas Frame** is automatically generated showing the spatial neighborhood around your modules:

```bash
# Capture a work session with module scope
lex remember \
  --reference-point "implementing auth" \
  --summary "Added JWT validation to API middleware" \
  --next "Wire up password reset flow" \
  --modules "services/auth,api/middleware"

# Recall with Atlas context (1-hop neighborhood)
lex recall "auth"

# Recall with custom fold radius (2-hop neighborhood)
lex recall "auth" --fold-radius 2

# Auto-tune radius to fit token limits
lex recall "auth" --auto-radius --max-tokens 5000
```

### 3. Programmatic Usage

```typescript
import { generateAtlasFrame } from '@smartergpt/lex/shared/atlas';
import { parseCodeUnit, parseCodeAtlasRun } from '@smartergpt/lex/atlas';

// Generate Atlas Frame for a set of modules
const atlasFrame = generateAtlasFrame(
  ['services/auth', 'api/middleware'],  // seed modules
  1                                      // fold radius (1-hop)
);

console.log(`Found ${atlasFrame.modules.length} modules in neighborhood`);
console.log(`With ${atlasFrame.edges.length} edges`);

// Parse and validate a CodeUnit
const codeUnit = parseCodeUnit({
  id: 'abc123',
  repoId: 'repo-1',
  filePath: 'src/auth/validator.ts',
  language: 'ts',
  kind: 'class',
  symbolPath: 'src/auth/validator.ts::JWTValidator',
  name: 'JWTValidator',
  span: { startLine: 10, endLine: 50 },
  discoveredAt: new Date().toISOString(),
  schemaVersion: 'code-unit-v0'
});
```

---

## Why Code Atlas?

### The Problem

AI assistants struggle with large codebases:
- **Token overload** — Dumping entire dependency graphs exhausts context windows
- **Missing boundaries** — Without policy awareness, suggestions violate architectural rules
- **Context loss** — No memory of module relationships across sessions

### The Solution

Code Atlas provides **fold radius** extraction:
- **Radius 0** — Just the seed modules
- **Radius 1** — Seed + direct neighbors (default, ~500 tokens)
- **Radius 2** — Seed + neighbors + neighbors-of-neighbors

**Result:** Token-efficient architectural context that fits in any LLM window.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Full Specification](./code-atlas-v0.md) | Complete schema and algorithm details |
| [API Reference](./api-reference.md) | Endpoints for ingestion and query |
| [Examples](./examples.md) | Usage examples with code samples |

---

## Integration with Lex

Code Atlas is one of three core capabilities in Lex:

```
┌─────────────────────────────────────────────────────────────┐
│                    Lex Framework                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📸 Memory Layer (Frames)                                   │
│  └─ Episodic work session snapshots                         │
│                                                             │
│  🗺️ Atlas Layer (Code Atlas) ← YOU ARE HERE                 │
│  └─ Spatial neighborhood extraction                         │
│                                                             │
│  🛡️ Policy Layer                                            │
│  └─ Architectural boundary enforcement                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

When you `/recall` a Frame, Code Atlas provides the **Atlas Frame** — the minimal policy-aware context showing what's happening around your modules.

---

## See Also

- [Mind Palace Guide](../MIND_PALACE.md) — Understanding Frames and Atlas Frames
- [Architecture Overview](../ARCHITECTURE.md) — How Atlas fits in Lex's design
- [CLI Reference](../CLI_OUTPUT.md) — Command-line options for Atlas features
