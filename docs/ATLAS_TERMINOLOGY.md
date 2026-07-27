# Atlas terminology and compatibility map

**Status:** Adopted vocabulary for new work

**Inventory date:** 2026-07-27
**Tracking issue:** [#805](https://github.com/Guffawaffle/lex/issues/805)

“Atlas” is a legacy umbrella over three independent systems. New prose and new APIs must use
**Policy Neighborhood**, **Code Index**, or **Frame Graph** when one of those concepts is intended.
Existing names containing `Atlas` remain compatibility surfaces until an additive, tested
migration is available.

This inventory groups repeated implementations by symbol family or path family. Every current
Atlas-named source, declaration, command, tool, route, persistence field, and active documentation
surface belongs to one of the rows below. Checked-in historical records keep their original
wording and are classified as historical compatibility references rather than current vocabulary.

## Concept contracts

### Policy Neighborhood

A **Policy Neighborhood** is bounded nearby-module context expanded from a Frame’s
`module_scope` through the active repository policy. The policy/context layer owns it; CLI recall,
MCP Frame reads, policy reports, renderers, and the LexRunner packet experiment consume it. The
feature is supported but its current `AtlasFrame` names and output labels are legacy compatibility
surfaces. If policy is absent, unreadable, or does not contain the requested IDs, neighborhood
enrichment fails closed while core Frame capture and recall remain available; it never invents
module IDs or grants authority.

### Code Index

The **Code Index** is experimental source and symbol extraction for TypeScript, JavaScript, and
Python, with `CodeUnit`, run-provenance, optional persistence, and policy-seed evidence. The
source-extraction and experimental Code Index store layers own it; the `code-atlas` CLI,
`atlas_analyze` MCP tool, and `/api/atlas/*` HTTP routes are its current consumers. It has no
identified LexRunner production consumer, and it is not the canonical mixed-language policy
builder. Extraction failure or truncation is reported explicitly, stored output remains evidence
rather than authority, and Frame capture/recall does not depend on it.

### Frame Graph

The **Frame Graph** is an in-memory derived graph over historical Frames, connecting them by module
overlap, branch, and temporal proximity. The historical graph/rebuild layer owns it; only the
public rebuild, validation, queue, and manager APIs plus examples and tests currently consume it.
No first-party production caller was found in the source inventory. Rebuild or validation failure
must leave durable Frames unchanged and must not block Frame capture or recall; stabilization
depends on an explicit consumer decision.

None of these three systems establishes tenant, workspace, repository, or filesystem authority.
Trusted hosts resolve and attenuate `AuthorizedScope` before invoking any of them.

## Public package API

The paths and symbols in this table are already semver-governed. Classification does not rename or
remove them.

| Existing surface | Classification | Compatibility treatment |
|---|---|---|
| Root `@smartergpt/lex`: `AtlasFrame`, `AtlasModuleData`, `AtlasEdge`, `generateAtlasFrame`, `autoTuneRadius`, `estimateTokens` | Policy Neighborhood | Preserve; add the aliases tracked by [#806](https://github.com/Guffawaffle/lex/issues/806). |
| Root `@smartergpt/lex`: `AtlasRebuildManager`, `triggerAtlasRebuild`, manager callbacks/configuration | Frame Graph | Preserve; add the aliases tracked by [#808](https://github.com/Guffawaffle/lex/issues/808). |
| `@smartergpt/lex/atlas`: policy types, `Graph`, `AtlasFrame`, policy `AtlasEdge`, graph traversal, fold-radius, generation, cache, and auto-tuning exports | Policy Neighborhood | The package path stays; new docs identify this symbol family as Policy Neighborhood. |
| `@smartergpt/lex/atlas`: `Atlas`, `AtlasNode`, `rebuildAtlas`, `validateAtlas`, `checkReachability`, `AtlasRebuildQueue`, `AtlasRebuildManager`, triggers, callbacks, and configuration | Frame Graph | The package path stays; new docs identify this symbol family as Frame Graph. |
| `@smartergpt/lex/atlas`: `CodeUnit` schema, parser, validator, kinds, and spans | Code Index | The mixed barrel stays for compatibility; prefer a future additive Code Index name. |
| `@smartergpt/lex/atlas/code-unit` | Code Index | Public compatibility path; do not remove or repurpose. |
| `@smartergpt/lex/atlas/schemas`: `CodeAtlasRun`, `PolicySeed`, schemas, parsers, validators, and policy-seed generator | Code Index | Public compatibility path and serialized literals remain unchanged. |
| `@smartergpt/lex/store`: `CodeAtlasStore`, `SqliteCodeAtlasStore`, CodeUnit queries, and CodeAtlasRun queries | Code Index | Experimental behavior on a public package path; migration is additive. |
| Package keyword `atlas`, `shared/atlas` policy module ID, and `src/shared/atlas/` directory | Shared compatibility | These locate the legacy umbrella and do not define one subsystem. |

The two source-level `AtlasEdge` types are not the same concept:
`src/shared/atlas/types.ts` describes policy edges in a Policy Neighborhood, while
`src/shared/atlas/rebuild.ts` describes weighted relationships in a Frame Graph.

## CLI surfaces

| Existing surface | Classification | Notes |
|---|---|---|
| `lex recall --fold-radius`, `--auto-radius`, `--max-tokens`, and `--cache-stats` | Policy Neighborhood | Existing flags remain; help should prefer Policy Neighborhood wording. |
| Recall JSON `atlasFrame` and text label `Atlas Frame` | Policy Neighborhood | Output compatibility surface; rename only through an additive/versioned decision. |
| `lex code-atlas`, `CodeAtlasOptions`, `CodeAtlasResult`, and `codeAtlas()` | Code Index | Existing command remains; additive `code-index` work is tracked by [#807](https://github.com/Guffawaffle/lex/issues/807). |
| CLI Frame input/output `atlas_frame_id` | Policy Neighborhood compatibility | The stored value is opaque; do not silently reinterpret it as a Code Index or Frame Graph ID. |

There is no first-party CLI command for the Frame Graph.

## MCP and HTTP surfaces

| Existing surface | Classification | Notes |
|---|---|---|
| Policy enrichment on `frame_create`, `frame_search`, `frame_get`, and `frame_list` | Policy Neighborhood | Optional enrichment; core Frame operations remain available without policy. |
| `include_atlas`, `atlasFrame`, `atlas_frame_id`, and `Atlas Frame` response labels | Policy Neighborhood compatibility | Preserve wire and stored compatibility while additive aliases are designed. |
| `atlas_analyze`, deprecated aliases `code_atlas`/`lex_code_atlas`, and the `code-atlas` runtime capability | Code Index | The current implementation extracts source units; it is not Policy Neighborhood generation. |
| `POST /api/atlas/ingest` | Code Index | Ingests `CodeAtlasRun` plus `CodeUnit[]`. |
| `GET /api/atlas/units`, `/units/:id`, `/runs`, and `/runs/:runId` | Code Index | Queries experimental Code Index persistence. |
| `AtlasIngestRequest`, `AtlasIngestResponse`, and `AtlasApiErrorResponse` | Code Index | HTTP compatibility type names. |
| Logger/category names under `memory:mcp_server:routes:atlas` | Code Index compatibility | Internal diagnostic name; migrate only with its route family. |

There is no first-party MCP or HTTP surface for the Frame Graph. In particular,
`atlas_analyze` is Code Index despite its name.

## Types, schemas, and persistence

| Existing surface | Classification | Compatibility treatment |
|---|---|---|
| `AtlasFrame`, `AtlasModuleData`/`AtlasModule`, policy `AtlasEdge`, `atlas_timestamp`, `seed_modules`, `fold_radius`, modules, edges, and critical rule | Policy Neighborhood | Existing in-memory/output shape remains readable. |
| Frame field `atlas_frame_id` in TypeScript/Zod types, validators, SQLite/PostgreSQL rows, migrations, indexes, recovery, HTTP, MCP, and renderers | Policy Neighborhood compatibility | Preserve the field and its opaque values until a versioned data migration exists. |
| `CodeUnit`, `CodeUnitKind`, `CodeUnitSpan`, and `code-unit-v0` | Code Index | Preserve serialized schema literals. |
| `CodeAtlasRun`, limits, and `code-atlas-run-v0` | Code Index | Preserve serialized schema literals and stored rows. |
| `PolicySeed`, `PolicySeedModule`, and `generatedBy: "code-atlas-v0"` | Code Index | Experimental seed evidence; not canonical policy authority. |
| `code_units` and `code_atlas_runs` tables, queries, and `CodeAtlasStore` implementations | Code Index | Experimental persistence; no table rename without a migration. |
| `Atlas`, `AtlasNode`, weighted Frame-graph `AtlasEdge`, `RebuildResult`, and validation result | Frame Graph | Current values are derived in memory; no durable Frame Graph format was found. |

Checked-in `.d.ts` compatibility declarations mirror their corresponding source classification.
Test fixtures containing names such as `atlas-001` inherit the classification of the field or API
they exercise and do not define a fourth concept.

## Internal source ownership

| Source family | Classification |
|---|---|
| `src/shared/atlas/atlas-frame.ts`, `fold-radius.ts`, policy traversal portions of `graph.ts`, `cache.ts`, `auto-tune.ts`, and policy-neighborhood types | Policy Neighborhood |
| Policy enrichment in `src/shared/cli/recall.ts`, `src/policy/check/reporter.ts`, `src/memory/mcp_server/server.ts`, and `src/memory/renderer/` | Policy Neighborhood |
| `src/atlas/**`, `src/shared/cli/code-atlas.ts`, Code Index store/query files, and `src/memory/mcp_server/routes/atlas.ts` | Code Index |
| `src/shared/atlas/rebuild.ts`, `validate.ts`, `queue.ts`, and `trigger.ts` | Frame Graph |
| `src/shared/atlas/index.ts` | Shared compatibility barrel containing all three concepts |

The policy traversal file `src/shared/atlas/graph.ts` belongs to Policy Neighborhood. The word
“graph” there describes the repository policy graph, not the historical Frame Graph.

## Documentation inventory

| Documentation family | Classification |
|---|---|
| Recall, Mind Palace, adoption, recall-quality, policy, module-ID, CLI, memory, and renderer guidance that discusses `Atlas Frame` or fold radius | Policy Neighborhood |
| `docs/atlas/api-reference.md`, `docs/atlas/code-atlas-v0.md`, `docs/atlas/examples.md`, CodeAtlasStore guidance, and Code Atlas limitations | Code Index, except their explicitly labeled recall/`AtlasFrame` sections, which are Policy Neighborhood |
| Batch-ingestion “Atlas rebuild” guidance and rebuild/queue/validation sections in `src/shared/atlas/README.md` | Frame Graph |
| `docs/atlas/README.md`, public API inventories, contract maps, and architecture overviews | Mixed compatibility landing surfaces; they must cross-link this map and name the intended concept |
| `CHANGELOG.md`, historical work logs, old PR descriptions, archived examples/fixtures, ADR history, and research artifacts | Historical compatibility references; retained as records rather than rewritten as current terminology |

## Migration order

1. Use the three conceptual names in new issues, active documentation, comments, and help text.
2. Add aliases without removing old package exports, CLI commands, MCP inputs, HTTP routes, types,
   or serialized values.
3. Move first-party consumers to the additive names and collect compatibility telemetry.
4. Decide deprecation separately for each concept. A deprecation notice is not permission to
   remove a public surface.
5. Remove package paths, commands, wire fields, or serialized names only through the appropriate
   major release or versioned data migration.

The implementation follow-ups are:

- [#806 — Policy Neighborhood aliases](https://github.com/Guffawaffle/lex/issues/806)
- [#807 — Code Index aliases](https://github.com/Guffawaffle/lex/issues/807)
- [#808 — Frame Graph aliases](https://github.com/Guffawaffle/lex/issues/808)

## Related ownership decisions

- [#733](https://github.com/Guffawaffle/lex/issues/733) is **Frame Graph** performance work.
- [#804](https://github.com/Guffawaffle/lex/issues/804) is deferred **Code Index** research for
  C++.
- [Guffawaffle/lexrunner#858](https://github.com/Guffawaffle/lexrunner/issues/858) is a
  **Policy Neighborhood** consumer experiment for task-packet construction.
- [#801](https://github.com/Guffawaffle/lex/issues/801) is deterministic mixed-language policy
  generation, not Code Index extraction.
