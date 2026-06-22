# RFC: LMV Upstream Model for Lex and AXF

- Status: Draft
- Date: 2026-06-15
- Scope: Lex, AX/AXF capability surfaces, Lex-compatible runners
- Source context: STFC remains the proving ground; Lex/AXF becomes the upstream home for reusable agent infrastructure.

## Source Artifacts

This RFC promotes concepts from the STFC-local LMV pilot without moving or deleting
the STFC documents.

- `D:\dev\stfc-mod\docs\LMV_WORKSPACE_CONTRACT.md`
- `D:\dev\stfc-mod\docs\lmv_operating_compact_platonic_synopsis.pdf`
- `D:\dev\stfc-mod\docs\SIDECAR_FLEET_ALERT_CONTRACT.md`
- `D:\dev\stfc-mod-sidecar\docs\24-stfc-mod-payload-resource-contract.md`
- STFC Lex Frame: `209a37b8-365f-4bf2-99c5-0b5af9f0c269`

The STFC frame records the local contract as a docs checkpoint for translating
LMV into workspace rules: evidence and memory remain separate, uncertainty is
explicit, provenance and boundaries are preserved, and fleet alert evidence,
intent, and dispatch stay separate.

## Purpose

LMV is the doctrine for evidence-backed operational memory. In Lex/AXF, it
should become reusable infrastructure for agents that need to work under
uncertainty while still moving forward:

- Frames distinguish claims, evidence, uncertainty, contradiction, lineage, and
  validation state.
- AXF capabilities describe their effects before an agent invokes them.
- Meaningful agent effects leave append-only receipts or journal entries.
- Bounded experiments can fail productively when scope, rollback or
  containment, result, and lesson are recorded.
- Retention and promotion rules keep memory useful instead of making it a
  transcript landfill.

This is capability expansion, not capability reduction. The target is procedural
confidence: agents may proceed without certainty when actions are scoped,
reversible where possible, witnessed, bounded, and answerable.

## Existing Extension Points

Do not build a broad schema framework before using the extension points already
present in Lex.

### Frame Schema

Primary files:

- `src/shared/types/frame-schema.ts`
- `src/memory/frames/types.ts` (compatibility facade)
- `src/memory/validation/frame-validator.ts`
- `src/memory/store/frame-store.ts`
- `src/memory/store/sqlite/frame-store.ts`
- `src/memory/store/db.ts`

Current Frames already support:

- required recall anchors: `summary_caption`, `reference_point`,
  `status_snapshot.next_action`, `module_scope`
- execution provenance: `runId`, `planHash`, `spend`
- runner metadata: `executorRole`, `toolCalls`, `guardrailProfile`
- retention/consolidation primitives: `superseded_by`, `merged_from`
- contradiction resolution metadata: `contradiction_resolution`

Gap: current Frames do not explicitly separate memory claims from evidence
references. `summary_caption` is doing too much work.

### Receipts

Primary files:

- `src/memory/receipts/schema.ts`
- `src/memory/store/receipt-queries.ts`
- `src/memory/store/db.ts`
- `docs/control-stack/receipts/index.md`
- `docs/specs/AX-GOVERNANCE-PRIMITIVES.md`

Receipts already encode disciplined action through:

- `outcome`: success, failure, partial, deferred
- `confidence`: high, medium, low, uncertain
- `uncertaintyNotes`
- `reversibility`, `rollbackPath`, `rollbackTested`
- `failureClass`, `failureDetails`, `recoverySuggestion`
- `frameId`, `sessionId`, `agentId`

Gap: receipts do not yet expose a normalized action journal shape for file
edits, runtime cycles, deploys, remote effects, validation runs, and failed
bounded experiments that change future action.

### AX and AXF

Primary files:

- `docs/specs/AX-AI-EXPERIENCE.md`
- `docs/specs/AX-CONTRACT.md`
- `docs/specs/AX-GOVERNANCE-PRIMITIVES.md`
- `docs/specs/AX-CONTRACT.v0.1.yaml`
- `docs/specs/agent.contract.example.yaml`
- `docs/control-stack/scope-and-blast-radius/index.md`
- `docs/control-stack/epistemic-guardrails/index.md`

The repo has AX doctrine and contracts. It does not yet have a dedicated AXF
effect metadata contract. This RFC treats AXF as the concrete AX-facing
capability surface: the tools, commands, workflows, and runtime actions an
agent can invoke.

Gap: capabilities do not yet declare effects, trust zone, privilege, data class,
egress posture, destructive potential, preview support, recovery notes, audit
emission, or stop conditions in a single machine-readable shape.

## Canonical Doctrine

LMV upstream doctrine includes these principles:

1. Evidence is not truth.
2. Memory is not evidence.
3. Recall is not certainty.
4. Uncertainty is part of truth.
5. Contradiction is signal.
6. Forgetting is a feature.
7. Assimilation must add distinctiveness.
8. Provenance is dignity.
9. Boundaries are consent.
10. Power requires audit.
11. The operator remains sovereign.
12. Failure under discipline is inquiry.

Principle 12 is the upstream addition:

- Formal principle: `Failure under discipline is inquiry.`
- Know: A failed action can produce valid knowledge when its scope, cause,
  effect, and limits are examined.
- Experience: Debugging, probing, builds, tests, runtime cycles, and rejected
  designs often teach more than clean success when they are bounded and
  recorded.
- Think: LMV should treat controlled failure as evidence-bearing work when it
  changes future action. The system should preserve failed hypotheses,
  invalidated assumptions, rollback paths, and negative results.
- Feel: Courage without recklessness. The agent may move forward without
  certainty because the work is bounded, witnessed, and answerable.
- Platonic form: `That which fails with account still teaches.`
- Poster wording: `Accounted failure is disciplined inquiry.`

## Doctrine to Implementation Map

| LMV principle | Lex/AXF behavior |
| --- | --- |
| Evidence is not truth | Evidence refs are typed witnesses, not final authority. Claims state status and confidence separately. |
| Memory is not evidence | A Frame is a remembered claim plus evidence refs. A Frame without evidence can guide inquiry but cannot close validation. |
| Recall is not certainty | Recall returns candidates. Agents must verify current files, logs, tests, receipts, or runtime state before major action. |
| Uncertainty is part of truth | Frames and receipts carry uncertainty as first-class data. Unknown, partial, stale, and invalidated states are valid. |
| Contradiction is signal | Contradictions link Frames instead of overwriting them. Resolution can supersede, scope, keep both, or invalidate. |
| Forgetting is a feature | Retention supports expiry, demotion, supersession, and promotion criteria. Raw traces are not permanent by default. |
| Assimilation must add distinctiveness | Durable memory is promoted only when it changes future behavior or prevents repeated work. |
| Provenance is dignity | Claims cite files, commands, logs, receipts, events, commits, PRs, URLs, or upstream Frames. |
| Boundaries are consent | Frames and capabilities state trust zone, privilege, data class, egress posture, path scope, and what the record does not authorize. |
| Power requires audit | Meaningful effects emit structured journal records with actor, scope, reason, result, and validation. |
| The operator remains sovereign | Stop conditions and escalation keep humans responsible for destructive, secret-bearing, remote, or unbounded actions. |
| Failure under discipline is inquiry | Failed bounded experiments can be preserved when their result changes future action. |

## Frame Direction

Add an optional LMV epistemic envelope to the next Frame schema revision instead
of overloading `summary_caption` or `status_snapshot`.

Conceptual TypeScript shape:

```ts
type LmvStatus =
  | "observed"
  | "inferred"
  | "decided"
  | "blocked"
  | "invalidated"
  | "superseded";

type LmvConfidence = "high" | "medium" | "low" | "uncertain";

type LmvEvidenceStatus = "supports" | "contradicts" | "contextual" | "superseded";

interface LmvStopCondition {
  code: string;
  action: "stop" | "preview" | "escalate" | "require_approval";
  message: string;
}

interface LmvEvidenceRef {
  kind:
    | "file"
    | "command"
    | "log"
    | "test"
    | "receipt"
    | "frame"
    | "commit"
    | "pull_request"
    | "issue"
    | "runtime"
    | "url"
    | "manual";
  ref: string;
  status: LmvEvidenceStatus;
  observedAt?: string;
  digest?: string;
  exitCode?: number;
  line?: number;
  artifactPath?: string;
  receiptId?: string;
  note?: string;
}

interface LmvExperiment {
  hypothesis: string;
  bounds: {
    pathScope?: string[];
    maxAttempts?: number;
    timeBudgetSeconds?: number;
    allowedEffects?: string[];
    stopConditions?: LmvStopCondition[];
  };
  rollbackOrContainment?: string;
  result: "supported" | "falsified" | "inconclusive" | "blocked";
  lesson: string;
  changedFutureAction: boolean;
}

interface LmvEpistemic {
  claim: string;
  evidence: LmvEvidenceRef[];
  status: LmvStatus;
  confidence: LmvConfidence;
  uncertainty?: string[];
  lineage?: {
    derivedFrom?: string[];
    sourceFrames?: string[];
    sourceReceipts?: string[];
  };
  contradictions?: string[];
  invalidatedBy?: string[];
  nextValidation?: string;
  boundaries?: {
    trustZone?: string;
    privilege?: string;
    dataClass?: string;
    egress?: string;
    pathScope?: string[];
    doesNotAuthorize?: string[];
  };
  experiment?: LmvExperiment;
}

interface Frame {
  // Existing fields remain unchanged.
  lmv?: LmvEpistemic;
}
```

Design rules:

- `summary_caption` remains a compact recall caption.
- `lmv.claim` is the smallest durable claim that may influence future work.
- `lmv.evidence[]` stores references, not bulky raw artifacts.
- Empty `lmv.evidence[]` means unsupported memory, not verified knowledge.
- `lmv.evidence[].status` says whether the reference supports, contradicts,
  contextualizes, or has been superseded for the claim.
- `lmv.status` describes the claim, not the task runner state.
- `lmv.confidence` mirrors receipt confidence vocabulary.
- `lmv.nextValidation` tells the next agent what would strengthen, revise, or
  invalidate the claim.
- `lmv.boundaries.doesNotAuthorize[]` prevents recall from silently expanding
  scope.
- `lmv.experiment` is present only for bounded experiments whose result changes
  future action.

Implementation notes:

- This is additive. Existing Frames stay valid.
- The SQLite store will need a JSON `lmv` column or equivalent before Lex can
  persist the envelope.
- `frame-validator.ts` must recognize `lmv` and validate size limits.
- Recall does not need to index every nested field initially. First indexing
  candidates: `lmv.claim`, `lmv.status`, evidence `kind`,
  `lmv.evidence.status`, `lmv.evidence.receiptId`, and `lmv.nextValidation`.
- `contradiction_resolution`, `superseded_by`, and `merged_from` should remain
  compatible. LMV adds claim-level evidence and uncertainty, not a competing
  consolidation model.

## AXF Capability Metadata

Treat AXF as an effect system. Every consequential capability should be able to
describe what it can affect before an agent invokes it.

Conceptual shape:

```ts
type AxfEffect = "read" | "write" | "deploy" | "runtime" | "process" | "network";

type AxfTrustZone = "workspace" | "local_private" | "game_runtime" | "sidecar" | "remote";
type AxfPrivilege = "normal" | "elevated" | "credentialed";
type AxfDataClass = "public" | "local_private" | "secret_adjacent" | "secret";
type AxfEgress = "none" | "loopback" | "remote";

interface AxfStopCondition {
  code: string;
  action: "stop" | "preview" | "escalate" | "require_approval";
  message: string;
}

interface AxfCapabilityEffect {
  capabilityId: string;
  effects: AxfEffect[];
  trustZone: AxfTrustZone;
  privilege: AxfPrivilege;
  dataClass: AxfDataClass;
  egress: AxfEgress;
  pathScope?: string[];
  destructivePotential: "none" | "low" | "medium" | "high";
  preview: {
    supported: boolean;
    mode?: "dry-run" | "diff" | "plan" | "validate-only";
  };
  rollbackOrContainment?: {
    rollbackSupported: boolean;
    containmentSupported: boolean;
    notes?: string;
  };
  audit: {
    eventEmitted: boolean;
    eventKind?: string;
  };
  stopConditions: AxfStopCondition[];
}
```

Effect meanings:

- `read`: reads workspace, process, runtime, remote, or secret-adjacent state.
- `write`: changes files, stores, generated artifacts, config, or memory.
- `deploy`: publishes, installs, packages, ships, migrates, or otherwise moves
  artifacts into a consumer environment.
- `runtime`: starts, stops, probes, hooks, or mutates live runtime behavior.
- `process`: spawns, kills, or coordinates local processes.
- `network`: sends or receives data beyond the local workspace boundary.

Metadata axes:

- `trustZone` identifies the operational boundary the capability touches.
- `privilege` identifies whether normal user execution, elevated host access, or
  credentials are involved.
- `dataClass` identifies the sensitivity of data the capability can encounter.
- `egress` identifies whether data can leave the current process/workspace
  boundary.
- `stopConditions[]` should use stable `code` values so tools can enforce
  conditions such as `dirty_tree`, `secret_detected`, `scope_exceeded`,
  `remote_egress`, or `max_attempts_exceeded`.

Implementation notes:

- Start by exposing effect metadata through introspection or tool descriptors
  for Lex-owned MCP/CLI capabilities.
- The first consumers should be visible agent-facing surfaces: Lex recall
  rendering for `lmv` claim/evidence status, and AXF inspect/introspect output
  for capability effects.
- Add `effects` to AX/agent contract examples only after one of those consumers
  reads and displays them.
- Destructive, secret-bearing, remote, or uncontrolled-failure capabilities must
  have stop conditions and an audit event before they are considered AXF-ready.
- Preview/dry-run support is a capability fact, not a promise inferred from a
  tool name.

## Action Journal Direction

Use the existing receipt subsystem as the first action journal home. Do not
create a parallel audit stream until a concrete consumer proves receipts cannot
carry the required data.

Append-only journal entries should exist for meaningful agent effects:

- file edits
- moves and deletes
- archives and backups
- deploys and package publishes
- runtime cycles
- config changes
- remote pushes and uploads
- validation runs
- failed bounded experiments that changed understanding

Conceptual extension:

```ts
interface ActionJournalFields {
  actionKind:
    | "file_edit"
    | "move"
    | "delete"
    | "archive"
    | "backup"
    | "deploy"
    | "runtime_cycle"
    | "config_change"
    | "remote_push"
    | "remote_upload"
    | "validation_run"
    | "bounded_experiment";
  effects: AxfEffect[];
  scope: {
    paths?: string[];
    modules?: string[];
    trustZone?: string;
    privilege?: string;
    dataClass?: string;
    egress?: string;
  };
  artifacts?: string[];
  validation?: {
    command?: string;
    outcome?: "pass" | "fail" | "partial" | "skipped";
    evidenceRef?: string;
  };
  experimentId?: string;
}
```

Receipt integration:

- `Receipt.action` remains the human-readable action.
- `Receipt.outcome`, `confidence`, `uncertaintyNotes`, `reversibility`, and
  rollback fields continue to carry governance state.
- A future receipt schema revision can add `journal?: ActionJournalFields`.
- Production APIs should expose append/list semantics. Delete helpers should
  remain test or maintenance utilities, not normal journal behavior.

## Bounded Experiment Behavior

A bounded experiment is allowed when all of these are declared before or during
the action:

- hypothesis: what the agent is testing
- bounds: path scope, allowed effects, attempt/time limits, and stop conditions
- rollback or containment: how to undo or contain the action when applicable
- witness: command output, receipt, diff, log, runtime event, or reviewer note
- result: supported, falsified, inconclusive, or blocked
- lesson: what changes future action

Failed experiments are promotable only when they alter future action. Examples:

- a failed test invalidates an implementation assumption
- a rejected design clarifies a schema boundary
- a runtime probe proves a seam is stale or unsafe
- a deployment dry run exposes a missing rollback or containment path

Uncontrolled failures are not "fail forward." Secret-bearing, destructive,
remote, or unbounded failures remain guarded and should escalate.

## Promotion and Retention Rules

Not every transcript, command, or failed attempt deserves durable memory.

Promote material when it preserves at least one of:

- decisions
- validated seams
- failed assumptions
- schema boundaries
- privacy or security constraints
- reusable diagnostics
- negative results that prevent repeated work
- rollback paths, containment paths, or recovery procedures
- contradictions that changed scope or interpretation

Keep transient or demoted material in bounded logs, receipts, short-lived event
stores, or local artifacts when it does not change future behavior.

Frame retention should use existing primitives first:

- `superseded_by` when a later Frame replaces a claim
- `merged_from` when several Frames become one durable memory
- `contradiction_resolution` when a conflict is resolved or scoped
- `deleteFramesBefore`, branch cleanup, and module cleanup for explicit
  retention policy

Do not retain raw secret-bearing payloads for convenience. If a claim matters,
retain the claim, redacted evidence reference, and validation path instead.

## Safety Framing

LMV should make agents more capable by making uncertainty actionable.

Allowed procedural confidence:

- scope is explicit
- effects are visible
- rollback or containment is known when applicable
- validation evidence is recorded
- stop conditions exist
- the operator can review what happened

Guarded cases:

- destructive actions without rollback, containment, or approval path
- secret-bearing reads or writes
- remote egress or uploads
- uncontrolled runtime probing
- retention changes that erase evidence
- policy overrides
- repeated failures beyond declared bounds

In guarded cases, AXF should require preview, escalation, or a stop condition
rather than silently continuing.

## First Consumer

The first implementation should be tied to one visible behavior, not silent
storage growth.

Preferred first consumers:

- Lex recall rendering: show whether a recalled Frame is unsupported memory,
  evidence-backed, contradicted, superseded, or awaiting validation.
- AXF inspect/introspect output: show capability effects, trust zone, privilege,
  data class, egress posture, preview support, recovery notes, audit emission,
  and stop conditions before invocation.

Storage fields should not be considered complete until at least one of these
surfaces uses them at decision time.

## Migration Notes

Adding an optional SQLite `lmv` JSON column should be a normal additive
migration:

- Existing rows get `NULL`/absent `lmv` and remain valid.
- Export/import must round-trip `lmv` when present and tolerate absence when
  reading old exports.
- Backfill is optional and should be conservative. A backfilled Frame may set
  `lmv.claim` from `summary_caption`, but it should not invent evidence refs,
  confidence, or validation status.
- Recall should visibly label old Frames as memory without explicit LMV evidence
  rather than treating them as verified claims.
- Sync or alternate store drivers should ignore unknown `lmv` fields until they
  adopt the same schema major version.

## Adoption Plan

1. Keep this RFC as the upstream design checkpoint.
2. Add optional `lmv` Frame envelope in the Frame schema and validator.
3. Add persistence for `lmv` as a JSON column in the SQLite Frame store.
4. Add Lex recall rendering for LMV claim/evidence status before broad rollout.
5. Add focused tests for Frame validation, persistence, recall, and backward
   compatibility.
6. Extend receipt schema with optional `journal` fields for meaningful effects.
7. Expose AXF effect metadata for Lex-owned capabilities through introspection
   or tool descriptors.
8. Add AXF inspect/introspect output for effect metadata before broad rollout.
9. Add docs and tests for bounded experiments and promotion criteria.
10. Only after two independent resource families need shared helpers, consider a
   reusable LMV schema package.

## Acceptance Criteria

- Existing Frames and receipts remain valid.
- New LMV fields are optional, additive, and ignored by old consumers.
- A Frame can state a claim, evidence refs, status, confidence, uncertainty,
  lineage, contradictions, invalidation, next validation, boundaries, and an
  optional experiment.
- A capability can describe read/write/deploy/runtime/process/network effects,
  trust zone, privilege, data class, egress posture, path scope, destructive
  potential, preview support, rollback or containment, audit event, and stop
  conditions.
- A meaningful agent effect can leave an append-only journal record through the
  receipt subsystem.
- Failed bounded experiments can be retained when they change future action.
- Recall output visibly distinguishes unsupported memory from evidence-backed
  claims.
- Export/import and old-store behavior are defined for absent or present `lmv`
  metadata.
- STFC-local docs remain in place as pilot/proving-ground contracts.

## Implementation Risks and Guardrails

These are the main risks to manage during implementation:

- AXF is not yet a separate concrete extension point in this repo. First
  implementation should anchor effect metadata in existing Lex CLI/MCP
  introspection surfaces, then let AXF name the contract that emerges.
- Compatibility surfaces still exist across `memory/frames/types.ts`,
  `shared/types/frame.ts`, `shared/types/frame-schema.ts`, validator warnings,
  and SQLite row mapping. New LMV-facing fields must keep those paths aligned or
  they will validate in one layer and disappear in another.
- Append-only audit is not guaranteed by the current receipt schema by itself.
  Journal work must define append/list semantics before receipts are treated as
  the authoritative action audit.
- The first implementation should choose one visible consumer. Lex recall
  rendering is the required first consumer because it directly addresses the
  core LMV risk: agents mistaking memory for evidence.
- Forgetting and append-only audit need separate retention classes. Raw traces,
  Frames, and audit receipts should not share one retention policy.
- Evidence refs are typed references, not uniform citations. Recall rendering
  must avoid implying that a file line, command exit, URL, receipt, and runtime
  event have the same evidentiary weight.
- `lmv.boundaries.pathScope` is subordinate to existing `module_scope` and
  policy/Atlas semantics. It must not become a competing module system.

## Non-Goals

- Do not replace STFC-local contracts.
- Do not turn LMV into a FHIR clone or a generic schema framework.
- Do not make every tool call or transcript line durable memory.
- Do not treat recall as verification.
- Do not relax guardrails for destructive, secret-bearing, remote, or unbounded
  actions.
- Do not require broad indexing of every nested LMV field before the first
  implementation proves the read paths.
