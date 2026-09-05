# Slice 1A4 shadow projection decision freeze

Slice 1A4 consumes the Lex-owned `EffectivePolicySnapshotV1` and produces disposable
shadow text. It neither installs instructions nor establishes trust in an input
snapshot. Callers must obtain snapshots from their protected resolver boundary.

The two pre-implementation decisions for #835 are frozen as follows:

- Enforcement realization V1 is the closed singleton `unenforced`. Codex and Copilot
  shadow text cannot prove enforcement. Future realizations require a versioned
  contract and evidence; semantic fidelity remains independently `exact`,
  `lossy_advisory`, or `unsupported`.
- Both target profiles reject unknown mandatory applicability, activation,
  disposition, or satisfaction. They do not turn uncertainty into unconditional
  instructions. Native admission remains the resolver's result, never a projection
  decision, and every artifact and receipt remains non-authorizing.

Controlled templates preserve all five modalities, both activation conditions,
exact relations, bounded exception results, enforcement intents as intentions,
and declaration/rule/snapshot provenance. Inactive, suppressed and untrusted rules
are reported as resolution records, never issued as active instructions. Requested
advisory omission is visible and lossy; mandatory omission and semantic strengthening
are errors. Target profiles are closed versioned records bound to these adapters.

The artifact binds a canonical owned region; its receipt binds the complete artifact
and region independently. Content digests exclude their own fields to avoid cycles.
Receipt verification rerenders from explicit source inputs to detect stale sources,
altered profiles, forged receipts and hand editing. No clock, build ID, filesystem,
provider or ambient model participates. Generated Markdown is not declaration JSON
and must never round-trip into canonical source ingestion.
