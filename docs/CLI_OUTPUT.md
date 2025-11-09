# CLI Output System

## Overview

The Lex CLI output system provides a centralized, typed wrapper for all command-line output with two key features:

1. **Dual Sinks**: Outputs go to both user-facing console (stdout/stderr) and optional diagnostic logger (pino)
2. **Two Modes**: Human-readable plain text with colors/symbols, or machine-readable JSONL events

## Architecture

```
CLI Command
    ↓
output.info/success/warn/error/debug
    ↓
┌─────────────────────┐
│  CliOutput Wrapper  │
│  (output.ts)        │
└─────────────────────┘
    ↓           ↓
    ↓           └─→ Logger (pino)
    ↓               Diagnostic sink
    ↓               Non-blocking, pluggable
    ↓
┌─────────────────────┐
│  User-facing Output │
│  console.log/error  │
└─────────────────────┘
    ↓
stdout/stderr
```

### Mode Selection

- **Plain Mode** (default): Human-readable with ANSI colors and symbols
- **JSONL Mode**: Machine-readable, one CliEvent JSON object per line

Set mode via:
- `LEX_CLI_OUTPUT_MODE=jsonl` environment variable
- `createOutput({ mode: "jsonl" })` in code

## Output Modes

### Plain Mode (Human-Readable)

Outputs formatted text with colors and symbols:

```bash
$ lex remember --reference "implementing auth" --caption "Added login"
✔ Frame created successfully!
  Frame ID: 550e8400-e29b-41d4-a716-446655440000
  Timestamp: 2025-01-09T12:34:56.789Z
  Branch: feature/auth
  Reference: implementing auth
  Modules: auth/core, auth/login
```

#### Symbols

- `✔` (green) - Success
- `⚠` (yellow) - Warning
- `✖` (red) - Error
- `•` - Info
- `∙` (dim) - Debug

#### Colors

Colors are automatically enabled when:
- Running in a TTY (terminal)
- `LEX_CLI_PRETTY=1` environment variable is set

#### Stream Routing

- **stdout**: `info`, `success`, `debug`
- **stderr**: `warn`, `error`

### JSONL Mode (Machine-Readable)

Outputs one JSON event per line conforming to CliEvent v1 schema:

```bash
$ LEX_CLI_OUTPUT_MODE=jsonl lex remember --reference "test" --caption "test"
{"v":1,"ts":"2025-01-09T12:34:56.789Z","level":"success","scope":"cli","message":"Frame created successfully!","data":{"id":"550e8400-e29b-41d4-a716-446655440000"},"code":"FRAME_CREATED"}
```

#### CliEvent Schema (v1)

See [schemas/cli-output.v1.schema.json](../schemas/cli-output.v1.schema.json) for full JSON Schema.

```typescript
interface CliEvent<T = unknown> {
  v: 1;                    // Schema version
  ts: string;              // ISO 8601 timestamp
  level: CliLevel;         // "info" | "success" | "warn" | "error" | "debug"
  scope?: string;          // Component scope (e.g., "cli", "mcp", "policy")
  code?: string;           // Machine-readable event code
  message?: string;        // Human-readable message
  data?: T;                // Arbitrary structured data
  hint?: string;           // Optional hint for error resolution
}
```

#### Required Fields

- `v`: Always `1` (version)
- `ts`: ISO 8601 timestamp (e.g., `"2025-01-09T12:34:56.789Z"`)
- `level`: One of `info`, `success`, `warn`, `error`, `debug`

#### Optional Fields

- `scope`: Logical component (e.g., `"cli"`, `"mcp"`, `"policy"`)
- `code`: Machine-readable code (e.g., `"FRAME_CREATED"`, `"ATLAS_GEN_FAILED"`)
- `message`: Human-readable description
- `data`: Structured payload (frame IDs, counts, metadata)
- `hint`: Suggestion for error resolution (only for `warn`/`error`)

## Usage Examples

### Basic Output

```typescript
import { output } from "./shared/cli/output.js";

// Plain mode (default)
output.info("Processing 42 files...");
output.success("All files processed");
output.warn("Cache miss for module X");
output.error("Failed to load policy", undefined, "POLICY_LOAD_ERR", "Check file permissions");
output.debug("Token count: 1024");
```

### With Structured Data

```typescript
output.success("Frame created", { id: frame.id, timestamp: frame.timestamp }, "FRAME_CREATED");
```

**Plain output:**
```
✔ Frame created
```

**JSONL output:**
```json
{"v":1,"ts":"2025-01-09T12:34:56.789Z","level":"success","message":"Frame created","data":{"id":"...","timestamp":"..."},"code":"FRAME_CREATED"}
```

### Custom Scope

```typescript
import { createOutput } from "./shared/cli/output.js";

const out = createOutput({ scope: "policy-check" });
out.error("Violation detected", { file: "src/foo.ts" }, "POLICY_VIOLATION");
```

### Custom Logger

```typescript
import { createOutput } from "./shared/cli/output.js";
import { getLogger } from "./shared/logger/index.js";

const out = createOutput({
  scope: "custom",
  logger: getLogger("my-scope")
});
```

### Backward-Compatible Exports

For existing CLI commands using namespace imports:

```typescript
import * as output from "./shared/cli/output.js";

output.info("Legacy usage still works");
output.success("Backward compatible");
output.json({ foo: "bar" }); // Raw JSON output (for --json flags)
```

## Environment Variables

### `LEX_CLI_OUTPUT_MODE`

Controls output mode:
- `plain` (default): Human-readable with colors/symbols
- `jsonl`: Machine-readable JSONL events

```bash
export LEX_CLI_OUTPUT_MODE=jsonl
lex recall "authentication"
```

### `LEX_CLI_PRETTY`

Forces color/formatting in plain mode:
- `1`: Enable colors (overrides TTY detection)
- Not set: Auto-detect from `process.stdout.isTTY`

```bash
export LEX_CLI_PRETTY=1
lex remember --reference "test" --caption "test" | cat
# Still has colors even though output is piped
```

## Consumer Integration

### Parsing JSONL Output

```typescript
import { spawn } from "child_process";
import type { CliEvent } from "lex/cli-output";

const lex = spawn("lex", ["recall", "auth"], {
  env: { ...process.env, LEX_CLI_OUTPUT_MODE: "jsonl" }
});

lex.stdout.on("data", (chunk) => {
  const lines = chunk.toString().split("\n").filter(Boolean);
  lines.forEach((line) => {
    const event: CliEvent = JSON.parse(line);
    console.log(`[${event.level}] ${event.message}`);
    if (event.data) {
      console.log(JSON.stringify(event.data, null, 2));
    }
  });
});
```

### Schema Validation

Validate events against the JSON Schema:

```bash
npm install ajv
```

```typescript
import Ajv from "ajv";
import schema from "lex/schemas/cli-output.v1.schema.json";

const ajv = new Ajv();
const validate = ajv.compile(schema);

const event = JSON.parse(line);
if (!validate(event)) {
  console.error("Invalid event:", validate.errors);
}
```

### Error Handling

```typescript
lex.stderr.on("data", (chunk) => {
  const lines = chunk.toString().split("\n").filter(Boolean);
  lines.forEach((line) => {
    const event: CliEvent = JSON.parse(line);
    if (event.level === "error") {
      console.error(`ERROR: ${event.message}`);
      if (event.hint) {
        console.error(`  Hint: ${event.hint}`);
      }
      if (event.code) {
        console.error(`  Code: ${event.code}`);
      }
    }
  });
});
```

## Implementation Details

### ESLint Enforcement

The codebase enforces `no-console` globally with targeted exceptions:

```javascript
// eslint.config.mjs
rules: {
  "no-console": "error", // Global default
}

// Exceptions:
// - src/shared/cli/output.ts (CLI output wrapper)
// - MCP servers (stdio protocol requirement)
// - Test files (debugging)
// - Policy tools (lexmap-check, lexmap-merge, etc.)
// - Atlas demo/perf scripts
```

### Dual Sink Behavior

1. **User Sink** (console.log/error): Synchronous, blocking
   - Plain mode: Formatted with colors/symbols
   - JSONL mode: One JSON line per event
   - Stream routing: errors/warnings to stderr, others to stdout

2. **Diagnostic Sink** (pino logger): Asynchronous, non-blocking
   - Always receives structured message
   - Wrapped in try/catch to prevent CLI breakage
   - Pluggable via `createOutput({ logger })`

### Named Function Exports

The wrapper exports both:
- `output` instance: Default CLI output (scope="cli")
- Individual functions: `info`, `success`, `warn`, `error`, `debug`, `json`

This allows CLI commands to use either pattern:

```typescript
// Pattern 1: Object methods
import { output } from "./output.js";
output.info("Works with object");

// Pattern 2: Direct function imports
import { info, success } from "./output.js";
info("Direct function call");
```

### `json()` Function Semantics

The exported `json()` function outputs raw JSON (bypassing the wrapper):

```typescript
import { json } from "./output.js";

json({ frames: [...], count: 5 });
// Outputs: {"frames":[...],"count":5}
```

This is distinct from the wrapper's internal `json()` method which emits CliEvent structures. CLI commands use the exported `json()` for `--json` flags to output arbitrary data.

## Migration Guide

### From Old Output API

**Before:**
```typescript
import * as output from "./output.js";
output.info("message");
output.error("error message");
```

**After:**
No changes needed! Exports remain consistent.

**Modern alternative:**
```typescript
import { output } from "./output.js";
output.info("message", { key: "value" }, "INFO_CODE");
```

### Adding Structured Data

**Before:**
```typescript
output.info(`Frame created: ${frame.id}`);
```

**After:**
```typescript
output.success("Frame created", { id: frame.id }, "FRAME_CREATED");
```

### Error Hints

**Before:**
```typescript
output.error("Policy file not found");
output.info("Try running: lexmap init");
```

**After:**
```typescript
output.error(
  "Policy file not found",
  { path: policyPath },
  "POLICY_NOT_FOUND",
  "Try running: lexmap init"
);
```

## Rationale

### Why Dual Sinks?

- **User Sink (console)**: Provides immediate feedback to CLI users
- **Diagnostic Sink (logger)**: Enables post-mortem debugging and monitoring
- **Non-blocking logger**: Ensures CLI never breaks due to logging failures

### Why Two Modes?

- **Plain Mode**: Optimized for human operators (colors, symbols, formatted)
- **JSONL Mode**: Optimized for automation (parseable, structured, grep-friendly)

### Why JSONL over JSON?

- Streamable: Can process events as they arrive
- Grep-friendly: Each line is independent
- Resilient: One malformed line doesn't break entire output
- Standard: Used by tools like jq, fluentd, logstash

### Why Centralized Wrapper?

- **Single chokepoint**: Easier to modify output behavior
- **Testability**: Mock console calls in tests
- **Consistency**: All CLI commands use same formatting
- **Type safety**: TypeScript ensures correct usage

## Testing

Tests verify:
- Plain vs JSONL mode output
- Stdout/stderr routing
- Dual sink behavior (console + logger)
- Color/symbol rendering
- TTY detection
- Env var configuration
- Backward-compatible exports
- Broken logger doesn't crash CLI

Run tests:
```bash
npm test -- test/shared/cli/output.behavior.test.ts
```

## Schema Versioning

The CliEvent schema uses semantic versioning via the `v` field:

- **v1**: Current version
  - Required: `v`, `ts`, `level`
  - Optional: `scope`, `code`, `message`, `data`, `hint`

Future versions will increment `v` for breaking changes. Consumers should check `v` field:

```typescript
const event: CliEvent = JSON.parse(line);
if (event.v !== 1) {
  console.warn(`Unknown schema version: ${event.v}`);
}
```

## FAQ

**Q: Can I use console.log in my CLI command?**
A: No. ESLint enforces `no-console` globally. Use `output.info()` instead.

**Q: How do I output arbitrary JSON for `--json` flags?**
A: Use the `json()` function: `import { json } from "./output.js"; json(data);`

**Q: Does the wrapper slow down CLI commands?**
A: No. The user sink (console) is synchronous. The diagnostic sink (logger) is non-blocking and wrapped in try/catch.

**Q: Can I disable colors in plain mode?**
A: Yes. Unset `LEX_CLI_PRETTY` and don't run in a TTY (e.g., pipe to `cat`).

**Q: What if my logger throws an error?**
A: The wrapper catches all logger exceptions. CLI output continues unaffected.

**Q: How do I add a new output level?**
A: Update `CliLevel` in `output.types.ts`, add to schema, implement in wrapper. Consider if it should go to stdout or stderr.

**Q: Can I use the wrapper in MCP servers?**
A: No. MCP servers use stdio for protocol communication. They must use `console.log` for responses and are ESLint-exempted.

## See Also

- [schemas/cli-output.v1.schema.json](../schemas/cli-output.v1.schema.json) - JSON Schema
- [src/shared/cli/output.ts](../src/shared/cli/output.ts) - Implementation
- [src/shared/cli/output.types.ts](../src/shared/cli/output.types.ts) - TypeScript types
- [test/shared/cli/output.behavior.test.ts](../test/shared/cli/output.behavior.test.ts) - Test suite
