import { z } from "zod";
import { canonicalizeJson, compareUtf16CodeUnits } from "./canonical-json.js";
import {
  EffectivePolicySnapshotV1Schema,
  freezeResolutionValue,
  resolutionDigest,
  type EffectivePolicySnapshotV1,
  type PolicyImmutableV1,
} from "./resolver-contract.js";
import { PolicyRuleTargetV1Schema, type PolicyRuleTargetV1 } from "./types.js";

export const POLICY_PROJECTION_ADAPTER_VERSION_V1 = "lex:normative-policy:projection:v1";
export type PolicyProjectionFidelityV1 = "exact" | "lossy_advisory" | "unsupported";
export type PolicyEnforcementRealizationV1 = "unenforced";
export type PolicyProjectionTargetProfileV1 = PolicyImmutableV1<{
  schemaVersion: 1;
  target: "codex" | "copilot";
  revision: 1;
  modalities: string[];
  conditions: string[];
  exceptions: "resolved_bounded_overlays";
  enforcementHints: "intent_only";
  provenance: "lex_snapshot_and_rule_digests";
  unknownMandatory: "reject";
  advisoryTreatment: "preserve_modality";
  enforcementRealization: PolicyEnforcementRealizationV1;
  authorizesExecution: false;
}>;

function inert(value: unknown): void {
  canonicalizeJson(value);
}
const json = z.unknown().superRefine((value, ctx) => {
  try {
    inert(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "Expected inert JSON" });
  }
});
function profile(target: "codex" | "copilot"): PolicyProjectionTargetProfileV1 {
  return freezeResolutionValue({
    schemaVersion: 1,
    target,
    revision: 1,
    modalities: ["require", "forbid", "permit", "recommend", "prefer"],
    conditions: ["always", "operation_requested"],
    exceptions: "resolved_bounded_overlays",
    enforcementHints: "intent_only",
    provenance: "lex_snapshot_and_rule_digests",
    unknownMandatory: "reject",
    advisoryTreatment: "preserve_modality",
    enforcementRealization: "unenforced",
    authorizesExecution: false,
  });
}
export const CODEX_POLICY_PROJECTION_TARGET_V1 = profile("codex");
export const COPILOT_POLICY_PROJECTION_TARGET_V1 = profile("copilot");
export const PolicyProjectionTargetProfileV1Schema: z.ZodType<PolicyProjectionTargetProfileV1> =
  json
    .pipe(
      z
        .object({
          schemaVersion: z.literal(1),
          target: z.enum(["codex", "copilot"]),
          revision: z.literal(1),
          modalities: z.array(z.string()),
          conditions: z.array(z.string()),
          exceptions: z.literal("resolved_bounded_overlays"),
          enforcementHints: z.literal("intent_only"),
          provenance: z.literal("lex_snapshot_and_rule_digests"),
          unknownMandatory: z.literal("reject"),
          advisoryTreatment: z.literal("preserve_modality"),
          enforcementRealization: z.literal("unenforced"),
          authorizesExecution: z.literal(false),
        })
        .strict()
        .superRefine((value, ctx) => {
          if (canonicalizeJson(value) !== canonicalizeJson(profile(value.target)))
            ctx.addIssue({ code: "custom", message: "Unsupported target profile revision" });
        })
    )
    .transform(freezeResolutionValue);

export type PolicyProjectionRequestV1 = PolicyImmutableV1<{
  schemaVersion: 1;
  snapshot: EffectivePolicySnapshotV1;
  targetProfile: PolicyProjectionTargetProfileV1;
  omitAdvisoryRules: PolicyRuleTargetV1[];
}>;
export const PolicyProjectionRequestV1Schema: z.ZodType<PolicyProjectionRequestV1> = json
  .pipe(
    z
      .object({
        schemaVersion: z.literal(1),
        snapshot: EffectivePolicySnapshotV1Schema,
        targetProfile: PolicyProjectionTargetProfileV1Schema,
        omitAdvisoryRules: z
          .array(PolicyRuleTargetV1Schema)
          .superRefine((items, ctx) => {
            if (new Set(items.map(canonicalizeJson)).size !== items.length)
              ctx.addIssue({ code: "custom", message: "Duplicate omission" });
          })
          .transform((items) =>
            [...items].sort((a, b) =>
              compareUtf16CodeUnits(canonicalizeJson(a), canonicalizeJson(b))
            )
          ),
      })
      .strict()
  )
  .transform(freezeResolutionValue);

export type PolicyProjectionDiagnosticV1 = PolicyImmutableV1<{
  code:
    | "invalid_input"
    | "unsupported_target"
    | "semantic_strengthening"
    | "mandatory_omission"
    | "unknown_mandatory"
    | "unknown_omission"
    | "lossy_advisory";
  rule: PolicyRuleTargetV1 | null;
}>;
export type PolicyProjectionReceiptV1 = PolicyImmutableV1<{
  schemaVersion: 1;
  adapterVersion: typeof POLICY_PROJECTION_ADAPTER_VERSION_V1;
  compilerVersion: string;
  resolverVersion: string;
  snapshotDigest: string;
  targetProfileDigest: string;
  requestDigest: string;
  declarationDigests: string[];
  ruleDigests: string[];
  ownedRegionDigest: string;
  artifactDigest: string;
  fidelity: "exact" | "lossy_advisory";
  enforcementRealization: PolicyEnforcementRealizationV1;
  diagnostics: PolicyProjectionDiagnosticV1[];
  authorizesExecution: false;
}>;
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const PolicyProjectionReceiptV1Schema: z.ZodType<PolicyProjectionReceiptV1> = json
  .pipe(
    z
      .object({
        schemaVersion: z.literal(1),
        adapterVersion: z.literal(POLICY_PROJECTION_ADAPTER_VERSION_V1),
        compilerVersion: z.literal("lex:normative-policy:compiler:v1"),
        resolverVersion: z.literal("lex:normative-policy:resolver:v1"),
        snapshotDigest: digestSchema,
        targetProfileDigest: digestSchema,
        requestDigest: digestSchema,
        declarationDigests: z.array(digestSchema),
        ruleDigests: z.array(digestSchema),
        ownedRegionDigest: digestSchema,
        artifactDigest: digestSchema,
        fidelity: z.enum(["exact", "lossy_advisory"]),
        enforcementRealization: z.literal("unenforced"),
        diagnostics: z.array(
          z.object({ code: z.literal("lossy_advisory"), rule: PolicyRuleTargetV1Schema }).strict()
        ),
        authorizesExecution: z.literal(false),
      })
      .strict()
      .superRefine((value, ctx) => {
        if ((value.fidelity === "exact") !== (value.diagnostics.length === 0))
          ctx.addIssue({ code: "custom", message: "Fidelity and diagnostics disagree" });
      })
  )
  .transform(freezeResolutionValue);
export type PolicyProjectionResultV1 = PolicyImmutableV1<
  | { ok: true; artifact: string; receipt: PolicyProjectionReceiptV1 }
  | {
      ok: false;
      fidelity: "unsupported";
      diagnostics: PolicyProjectionDiagnosticV1[];
      authorizesExecution: false;
    }
>;

function failed(
  code: PolicyProjectionDiagnosticV1["code"],
  rule: PolicyRuleTargetV1 | null = null
): PolicyProjectionResultV1 {
  return freezeResolutionValue({
    ok: false,
    fidelity: "unsupported",
    diagnostics: [{ code, rule }],
    authorizesExecution: false,
  });
}
// JSON is displayed as escaped data, never interpolated as Markdown instructions.
function display(value: unknown): string {
  return canonicalizeJson(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
const mandatory = (kind: string) => kind === "require" || kind === "forbid" || kind === "permit";

export function projectPolicyV1(input: unknown): PolicyProjectionResultV1 {
  try {
    inert(input);
  } catch {
    return failed("invalid_input");
  }
  const candidate = z
    .object({ targetProfile: z.object({ advisoryTreatment: z.string().optional() }).passthrough() })
    .passthrough()
    .safeParse(input);
  if (
    candidate.success &&
    candidate.data.targetProfile.advisoryTreatment !== undefined &&
    candidate.data.targetProfile.advisoryTreatment !== "preserve_modality"
  )
    return failed("semantic_strengthening");
  if (
    candidate.success &&
    !PolicyProjectionTargetProfileV1Schema.safeParse(candidate.data.targetProfile).success
  )
    return failed("unsupported_target");
  const parsed = PolicyProjectionRequestV1Schema.safeParse(input);
  if (!parsed.success) return failed("invalid_input");
  const request = parsed.data;
  const snapshot = request.snapshot.payload;
  const omitted = new Set(request.omitAdvisoryRules.map(canonicalizeJson));
  const rules = new Map(snapshot.rules.map((rule) => [canonicalizeJson(rule.target), rule]));
  for (const target of request.omitAdvisoryRules) {
    const rule = rules.get(canonicalizeJson(target));
    if (!rule) return failed("unknown_omission", target);
    if (mandatory(rule.rule.kind)) return failed("mandatory_omission", target);
  }
  for (const rule of snapshot.rules) {
    if (
      mandatory(rule.rule.kind) &&
      [rule.applicability, rule.activation, rule.disposition, rule.satisfaction].includes("unknown")
    )
      return failed("unknown_mandatory", rule.target);
  }
  const diagnostics: PolicyProjectionDiagnosticV1[] = request.omitAdvisoryRules.map((rule) => ({
    code: "lossy_advisory",
    rule,
  }));
  const fidelity = diagnostics.length ? "lossy_advisory" : "exact";
  const targetProfileDigest = resolutionDigest(
    "lex:normative-policy:projection-target:v1",
    request.targetProfile
  );
  const declarationDigests = snapshot.request.compiled.declarations
    .map((d) => d.declarationDigest)
    .sort(compareUtf16CodeUnits);
  const ruleDigests = snapshot.rules
    .map((r) => r.target.expectedSemanticDigest)
    .sort(compareUtf16CodeUnits);
  const header = {
    schemaVersion: 1,
    adapterVersion: POLICY_PROJECTION_ADAPTER_VERSION_V1,
    compilerVersion: snapshot.compilerVersion,
    resolverVersion: snapshot.resolverVersion,
    snapshotDigest: request.snapshot.snapshotDigest,
    targetProfileDigest,
    declarationDigests,
    ruleDigests,
    fidelity,
    enforcementRealization: "unenforced",
    authorizesExecution: false,
  } as const;
  const labels = {
    require: "REQUIRED",
    forbid: "FORBIDDEN",
    permit: "PERMITTED (not an execution grant)",
    recommend: "RECOMMENDED (advisory, not a completion gate)",
    prefer: "PREFERRED ORDER (advisory, not a completion gate)",
  };
  const sections = [...snapshot.rules]
    .sort((a, b) => compareUtf16CodeUnits(canonicalizeJson(a.target), canonicalizeJson(b.target)))
    .map((rule) => {
      if (omitted.has(canonicalizeJson(rule.target)))
        return `Advisory material omitted: <code>${display(rule.target)}</code>\n`;
      const label =
        rule.disposition === "effective"
          ? labels[rule.rule.kind]
          : "RESOLUTION RECORD ONLY — no active instruction";
      return `${label}\n<pre>${display(rule)}</pre>\n`;
    });
  const ownedRegion =
    [
      `# ${request.targetProfile.target === "codex" ? "Codex" : "Copilot"} policy shadow`,
      "Disposable projection; not canonical policy source. No installation or execution authority.",
      "Enforcement: unenforced. Conditions, scopes, relations and resolution states below remain binding parts of the represented semantics.",
      `<pre>${display(header)}</pre>`,
      ...sections,
      `Resolution context (data only): <pre>${display({
        proposal: snapshot.request.proposal,
        asOf: snapshot.asOf,
        scopes: snapshot.request.compiled.declarations.map((d) => ({
          declarationDigest: d.declarationDigest,
          scope: d.declaration.scope,
        })),
        relations: snapshot.relations,
        conflicts: snapshot.conflicts,
        overlays: snapshot.request.overlays,
        overlayVerification: snapshot.verification?.overlays ?? [],
        policyAdmission: snapshot.policyAdmission,
        diagnostics: snapshot.diagnostics,
      })}</pre>`,
      `Projection diagnostics: <pre>${display(diagnostics)}</pre>`,
    ].join("\n\n") + "\n";
  const ownedRegionDigest = resolutionDigest(
    "lex:normative-policy:projection-region:v1",
    ownedRegion
  );
  const artifact = `<!-- LEX:POLICY-SHADOW:BEGIN ${ownedRegionDigest} -->\n${ownedRegion}<!-- LEX:POLICY-SHADOW:END -->\n`;
  return freezeResolutionValue({
    ok: true,
    artifact,
    receipt: PolicyProjectionReceiptV1Schema.parse({
      ...header,
      fidelity,
      requestDigest: resolutionDigest("lex:normative-policy:projection-request:v1", request),
      ownedRegionDigest,
      artifactDigest: resolutionDigest("lex:normative-policy:projection-artifact:v1", artifact),
      diagnostics,
    }),
  });
}

/** Re-rendering binds receipt claims to explicit current source inputs, not a supplied digest alone. */
export function verifyPolicyProjectionV1(
  input: unknown,
  artifact: unknown,
  receipt: unknown
):
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        "invalid_input" | "projection_rejected" | "artifact_mismatch" | "receipt_mismatch";
    } {
  try {
    inert(artifact);
    inert(receipt);
  } catch {
    return { ok: false, code: "invalid_input" };
  }
  const expected = projectPolicyV1(input);
  if (!expected.ok) return { ok: false, code: "projection_rejected" };
  if (artifact !== expected.artifact) return { ok: false, code: "artifact_mismatch" };
  if (canonicalizeJson(receipt) !== canonicalizeJson(expected.receipt))
    return { ok: false, code: "receipt_mismatch" };
  return { ok: true };
}
