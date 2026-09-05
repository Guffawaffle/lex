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

## Public API

Import from `@smartergpt/lex/normative-policy`. `projectPolicyV1` accepts an inert
closed request with `schemaVersion: 1`, `snapshot`, `targetProfile`, and the explicit
`omitAdvisoryRules` set (empty for exact rendering). Use
`CODEX_POLICY_PROJECTION_TARGET_V1` or `COPILOT_POLICY_PROJECTION_TARGET_V1`.
An unsupported profile rejects the entire projection rather than dropping a rule.
Only recommendation/preference material may be omitted; permits are preserved too.

A successful result contains `artifact` and `receipt`. A failure contains closed
diagnostics and no partial artifact. `PolicyProjectionReceiptV1Schema` checks the
closed receipt shape; it does not authenticate provenance. Call
`verifyPolicyProjectionV1(request, artifact, receipt)` with current independently
obtained source inputs to verify binding. Digest equality is not an authority grant.

The two checked-in target goldens are synthetic fixtures, not installed consumer
instructions. Tests cover cross-process byte identity and rejection of stale input,
edited text, forged receipts, unsupported targets, mandatory uncertainty/omission,
and advisory strengthening.
