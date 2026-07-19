# Lex Contract Surface

This document orients application, runner, and tool authors to the contracts Lex 3 actually
publishes. It is not a compatibility certification suite. The package export map, runtime
validators, version constants, JSON Schemas, and focused conformance tests remain the normative
artifacts.

Every declared package entry point is public and semver-governed. Source files, undeclared `dist/`
paths, and historical `lex/...` imports are internal. See the exact
[Public Package API](./PUBLIC_API.md).

## Contract map

| Surface | Public entry point or artifact | Current boundary |
|---|---|---|
| Runtime identity and authority | `@smartergpt/lex/runtime-scope` | Contract v1; trusted-host scope resolution |
| Frames | `@smartergpt/lex/types` | Frame Schema v7 |
| Frame stores | `@smartergpt/lex/store` | Compatibility and scope-bound adapters |
| Repository policy | `@smartergpt/lex/policy` | Zod-validated module/path relationships |
| Atlas | `@smartergpt/lex/atlas` | Policy neighborhoods and experimental extraction surfaces |
| CLI events | `@smartergpt/lex/cli-output` plus published schema | `CliEvent` v1 |
| MCP | `@smartergpt/lex/mcp-server` | Embeddable server and deterministic tool schemas |
| Instructions | CLI plus `lex.yaml`/marker contracts | Canonical source projected into host files |

## Trusted runtime scope

Trusted hosting separates four ideas that compatibility launchers historically allowed one
process to blur:

```text
canonical authority     who may access which tenant/workspace
surface-local registry  which native checkout is locally bound
invocation context      what this request asked to do
scoped store            the only data view normal dispatch receives
```

Important invariants:

- canonical IDs are opaque; slugs and paths are selectors or evidence, not authority;
- one invocation has one active tenant and workspace;
- Windows and each WSL distribution retain separate native local registries;
- local bindings cannot mint membership or grants;
- capabilities are attenuated to the explicitly requested subset;
- diagnostics are opt-in, capability-gated, redacted, and never change authorization;
- CLI/MCP dispatch that needs Frames receives a lexically bound `ScopedFrameStore`;
- PostgreSQL canonical authority and forced-RLS scoped storage are independent, explicit controls.

Use the [Runtime Scope Contract](./RUNTIME_SCOPE_CONTRACT.md),
[PostgreSQL Authority](./POSTGRES_AUTHORITY.md), and
[PostgreSQL Scope Security](./POSTGRES_SCOPE_SECURITY.md) when building a trusted host. Ordinary
local SQLite users do not need this composition.

## Frames

A Frame is the durable work-checkpoint record. The public metadata shape is defined in
`src/shared/types/frame.ts`, its Zod helpers in `src/shared/types/frame-schema.ts`, and persistence
validation in `src/memory/frames/types.ts`. Alignment tests require all three shapes to agree.

Current invariants:

- `FRAME_SCHEMA_VERSION = 7`; the version is package/contract metadata rather than a field on
  every Frame;
- `id` is opaque and unique within its bound workspace;
- `saveFrame` is an idempotent upsert by `id`;
- targeted `updateFrame` operations preserve `id`, creation `timestamp`, ownership, and unrelated
  fields;
- `superseded_by` and `merged_from` represent consolidation provenance;
- a scope-bound store derives tenant, workspace, and creator ownership from `AuthorizedScope`;
  callers do not put authority metadata in the Frame payload.

Existing valid Frames must remain readable within a compatible package line. Additions to the
record shape need aligned validators, storage round-trip coverage, documentation, and a versioning
decision.

## Repository policy

Policy declares stable module IDs, owned paths/namespaces, allowed or forbidden callers, exposed
symbols, and kill patterns. Module IDs may contain lowercase letters, digits, `_`, `-`, and `/`.

The supported runtime validator is exported by `@smartergpt/lex/policy`; its implementation source
is `src/shared/policy/schema.ts`. Policy checking is deterministic for identical policy and scanner
facts, but scanner coverage and repository modeling determine how complete that evidence is.

Policy is architectural context and enforcement input. It is not tenant/workspace authorization.
See the [Repository Policy Guide](./API_USAGE.md).

## Instructions

Lex projects `.smartergpt/instructions/lex.md` into configured host files using one
`<!-- LEX:BEGIN -->` / `<!-- LEX:END -->` block.

- generation is deterministic for the same canonical source, configuration, and Lex version;
- content outside the managed marker pair is preserved;
- `lex instructions check` is the non-mutating drift gate;
- consumers should validate configuration against the implementation contract in
  `src/shared/config/lex-yaml-schema.ts` and the published specification documents.

See [Canonical Agent Instructions](./INSTRUCTIONS.md).

## CLI output and errors

The global `--json` flag requests a command-specific result. The shared writer can separately emit
versioned `CliEvent` JSONL using `LEX_CLI_OUTPUT_MODE=jsonl`. Consumers must not assume the two
shapes are interchangeable.

AXError codes, structured details, next actions, and hint IDs are the machine-facing recovery
surface when present. Human prose is not a parsing contract. See [CLI Output](./CLI_OUTPUT.md) and
the `@smartergpt/lex/errors` entry in the [Public Package API](./PUBLIC_API.md).

## MCP

The MCP server exposes deterministic tool definitions and versioned input schemas around the same
core capabilities. New integrations should use canonical tool names such as `frame_create` and
`frame_search`; legacy short names remain compatibility aliases.

A trusted host authorizes before dispatch and injects a scope-bound store. The packaged
`@smartergpt/lex-mcp` launcher remains a local compatibility surface and must not be treated as
tenant authority. See [Lex MCP](../README.mcp.md).

## Experimental surfaces

Code Atlas persistence and `@smartergpt/lex/lexsona` expose useful integration points but retain
explicit experimental status in their source contracts. Their declared package entry points are
real and supported as import paths; experimental behavior inside them may require an explicit
stabilization decision before external consumers should rely on it broadly.

## Versioning expectations

- Removing a declared package path or exported contract symbol is a package-major change.
- Additive public symbols normally require at least a package-minor change.
- Removing accepted data, changing field meaning, or adding a required caller input is breaking.
- Documentation-only correction does not change runtime compatibility.
- Each serialized contract's own version field or constant governs its data evolution; do not
  infer compatibility solely from the package version.

## Integration expectations

A Lex-aware runner or tool should:

- import only declared package entry points;
- preserve Frame identity, creation timestamp, scope ownership, and unmodified optional fields
  during updates and round trips;
- use declared Frame fields and propose schema additions instead of inventing `metadata`, `context`,
  or other unvalidated payload keys;
- keep runner-specific orchestration state in the runner's own schema unless Lex deliberately
  adopts it;
- honor policy when claiming policy enforcement;
- preserve instruction content outside Lex markers;
- reject unsupported contract versions rather than silently downgrading them;
- use trusted runtime scope and bound stores when serving more than one authority domain;
- test the exact contracts it consumes.

`lex policy check` validates repository policy; it is not a runner-conformance certification.

## Adjacent orchestration

[LexRunner](https://github.com/Guffawaffle/lexrunner) is the source-available orchestration engine
used alongside Lex for fanout, attempts, verification, workspace coordination, and merge-weave.
It consumes Lex contracts but does not define them, and it is not required for the Lex CLI,
SQLite, policy, Atlas, instruction, or MCP workflows.

If a published contract is ambiguous, file an issue with the package version, public entry point,
expected invariant, and a minimal consumer example.
