# Lex Examples

This directory contains practical examples showing different ways to use Lex.

## 📚 Examples Index

### [Dogfood: How We Build Lex with Lex](./dogfood/)

**Real Frames from actual development sessions.** The best way to understand Lex's workflow is to see it in action.

Contains:
- 6 real development Frames (MCP naming fix, AX release, recall optimization, etc.)
- Complete workflow documentation (recall → work → remember)
- Before/after impact stories
- Frame anatomy and schema validation

[Explore Dogfood Examples →](./dogfood/)

---

### [Subpath Exports](./subpath-exports-example.ts)

Demonstrates all available Lex subpath exports:
- `@smartergpt/lex` — Core API
- `@smartergpt/lex/cli` — Programmatic CLI
- `@smartergpt/lex/store` — Direct database operations
- `@smartergpt/lex/types` — Type definitions
- `@smartergpt/lex/errors` — AXError schema
- And 10+ more...

[View Validation Guide →](./SUBPATH_EXPORTS_VALIDATION.md)

---

### [Frame Validation](./frame-validation-example.mjs)

Shows how to validate Frame payloads using the public API:

```javascript
import { validateFramePayload } from '@smartergpt/lex/memory';

const result = validateFramePayload(myFrame);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

---

### [Batch Ingestion](./batch-ingestion-example.ts)

Import multiple Frames in bulk:

```typescript
import { saveFrame, getDb } from '@smartergpt/lex';

const db = getDb();
for (const frame of frames) {
  await saveFrame(db, frame);
}
```

---

### [Policy Rules](./rules-example.mjs)

Examples of architectural policy enforcement:

```javascript
// Define forbidden edges
{
  "modules": {
    "ui/components": {
      "forbidden": [
        {
          "target": "database/queries",
          "reason": "UI must not access database directly"
        }
      ]
    }
  }
}
```

---

### [Multi-Language Scanners](./scanners/)

**Optional scanners for non-TypeScript codebases:**

- [Python Scanner](./scanners/python/) — Scan Python imports
- [PHP Scanner](./scanners/php/) — Scan PHP namespaces

⚠️ **Security Note:** External scanners execute arbitrary code. Review before use.

---

### [Instructions Management](./instructions/)

Examples of using `lex instructions` to sync AI instructions across IDEs:

```bash
lex instructions init     # Create canonical source
lex instructions generate # Project to .github/copilot-instructions.md, .cursorrules
lex instructions check    # Verify sync
```

---

### [Consumer Integration](./consumer/)

Shows how to use Lex as a library in your own TypeScript projects.

---

### [JSON Schemas](./schemas/)

JSON Schema definitions for validation:
- Frame Schema
- Policy Schema
- CLI Output Schema

---

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Guffawaffle/lex.git
   cd lex
   ```

2. **Install dependencies:**
   ```bash
   npm ci && npm run build
   ```

3. **Run an example:**
   ```bash
   # Initialize Lex
   npx lex init
   
   # Try the dogfood examples
   cat examples/dogfood/frames/2025-12-16-mcp-naming-fix.json
   
   # Validate a Frame
   node examples/frame-validation-example.mjs
   ```

## Contributing Examples

Have a great Lex usage pattern? Submit a PR!

**Guidelines:**
1. Follow existing example structure
2. Include comments explaining key concepts
3. Keep examples focused and minimal
4. Add to this README index
5. Test that examples work with current Lex version

## Questions?

- [Documentation](../docs/)
- [API Reference](../docs/API_USAGE.md)
- [GitHub Issues](https://github.com/Guffawaffle/lex/issues)
- [Discussions](https://github.com/Guffawaffle/lex/discussions)

---

[⬅ Back to Main README](../README.md) · [📦 Install Lex](https://www.npmjs.com/package/@smartergpt/lex)
