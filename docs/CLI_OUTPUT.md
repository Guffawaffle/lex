# CLI Output Contract

Lex has two related machine-facing output surfaces:

1. command-specific `--json` results for automation;
2. versioned JSONL events from the shared output writer.

They are intentionally distinct. Do not assume every `--json` result is a `CliEvent`, and do not
wrap a command's documented JSON payload in an extra event envelope.

## Command-specific JSON

Place the global `--json` flag before the command:

```bash
lex --json introspect
lex --json context "authentication" --limit 3 --max-tokens 800
lex --json recall "authentication"
```

Commands return their own structured result shape. That is the preferred surface when a script or
agent needs the semantic result of one operation. Check `lex <command> --help` and the relevant
contract before depending on optional fields.

For example, a validation-only Frame write can be requested with:

```bash
lex --json remember \
  --summary "Validated the authentication handoff" \
  --next "Run the focused tests" \
  --modules unscoped \
  --dry-run
```

Machine consumers should also use process exit status. Some commands offer stricter absence
semantics, such as `lex recall --strict`.

## Shared event output

The shared CLI writer emits human-readable text by default. Set `LEX_CLI_OUTPUT_MODE=jsonl` to emit
one `CliEvent` v1 object per line:

```bash
LEX_CLI_OUTPUT_MODE=jsonl lex remember \
  --summary "Stored the authentication handoff" \
  --next "Run the focused tests" \
  --modules unscoped
```

A JSONL event has this shape:

```json
{
  "v": 1,
  "ts": "2026-07-19T12:34:56.789Z",
  "level": "success",
  "scope": "cli:remember",
  "code": "FRAME_CREATED",
  "message": "Frame created",
  "data": { "id": "frame-id" },
  "hint": "Optional recovery guidance"
}
```

Only `v`, `ts`, and `level` are required. The remaining fields are event-specific.

| Field | Meaning |
|---|---|
| `v` | Event schema version; currently `1` |
| `ts` | UTC ISO 8601 timestamp |
| `level` | `info`, `success`, `warn`, `error`, or `debug` |
| `scope` | Optional emitting component |
| `code` | Optional machine-readable event code |
| `message` | Optional short human-readable summary |
| `data` | Optional structured payload |
| `hint` | Optional recovery guidance |

The canonical schema is published at
`@smartergpt/lex/schemas/cli-output.v1.schema.json` and maintained in
[`canon/schemas/cli-output.v1.schema.json`](../canon/schemas/cli-output.v1.schema.json).

## Stream routing

The shared writer uses:

- stdout for `info`, `success`, and `debug`;
- stderr for `warn` and `error`.

This routing is the same in plain and JSONL modes. If a script needs both kinds of events in exact
emission order, merge the streams deliberately and retain each event's `level`.

Command-specific raw JSON normally uses stdout. Diagnostics and failures belong on stderr, but
callers should still verify the behavior of the command they automate.

## Plain mode

`LEX_CLI_OUTPUT_MODE=plain` is the default. Shared events use a symbol, optional scope, and message:

```text
✔ [cli] Frame created
⚠ [cli] Policy not found
✖ [cli] Store unavailable
```

ANSI color is enabled for a TTY. `LEX_CLI_PRETTY=1` forces color when output is redirected.

Warn-level hints are printed as an additional stderr line. The current plain error path does not
repeat an attached hint; agents that need stable recovery data should use structured output and
the AXError/hint surfaces rather than scraping prose.

## Programmatic writer

The supported public entry point exports the writer functions, but it does not currently export
the private `CliEvent` TypeScript type:

```typescript
import {
  createOutput,
  json,
  raw,
} from "@smartergpt/lex/cli-output";

const out = createOutput({ scope: "consumer", mode: "jsonl" });

out.info("Starting validation", { files: 4 }, "VALIDATION_START");
out.success("Validation passed", { files: 4 }, "VALIDATION_OK");

json({ ok: true }); // pretty-printed command-specific JSON
raw("preformatted text");
```

Use the published JSON Schema for a durable event type in external consumers. Do not import source
files or undeclared `dist/` paths to reach internal types.

## Diagnostics

The shared writer's optional diagnostic sink is disabled unless its `verbose` option is true or
`LEX_DEBUG=1`/`LEX_VERBOSE=1` is set. It receives a short summary, not a copy of the complete event
payload. The packaged `lex --verbose` flag enables this diagnostic behavior.

Diagnostics can contain local paths and repository identifiers. Keep them off by default in agent
context and review them before sharing.

## Guidance for agent-facing integrations

- Prefer a command's `--json` result when you need its domain object.
- Prefer JSONL when consuming a stream of shared progress/events.
- Bound result counts and context budgets at the command level.
- Treat human prose as display text, not a parsing contract.
- Treat `code`, AXError details, and stable hint IDs as recovery contracts when available.
- Keep diagnostic metadata opt-in so normal agent returns stay compact.

## See also

- [Contract Surface](./CONTRACT_SURFACE.md)
- [Public Package API](./PUBLIC_API.md)
- [Environment Reference](./ENVIRONMENT.md)
- [Public error exports](./PUBLIC_API.md)
