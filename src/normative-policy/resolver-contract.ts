import type {
  PolicyImmutableV1,
  PolicyExceptionOverlayV1,
  PolicyResolutionRequestV1,
  PolicyVerificationEvidenceV1,
  PolicyResolverVerificationV1,
  PolicySnapshotPreimageV1,
  EffectivePolicySnapshotV1,
} from "./resolver-data.js";
export type {
  PolicyImmutableV1,
  PolicyExceptionOverlayV1,
  PolicyResolutionRequestV1,
  PolicyVerificationEvidenceV1,
  PolicyResolverVerificationV1,
  PolicySnapshotPreimageV1,
  EffectivePolicySnapshotV1,
  PolicyVerifiedRelationV1,
  PolicyResolverDiagnosticV1,
  PolicyRuleResolutionV1,
  PolicyRelationResolutionV1,
  PolicyConflictV1,
} from "./resolver-data.js";
import { createHash } from "node:crypto";
import { z } from "zod";

import { canonicalizeJson, compareUtf16CodeUnits } from "./canonical-json.js";
import { computePolicySemanticDigestV1 } from "./canonical.js";
import { CompiledPolicyV1Schema, POLICY_COMPILER_VERSION_V1 } from "./compiler.js";
import {
  CapabilityIdV1Schema,
  ContentDigestV1Schema,
  IsoDateTimeV1Schema,
  NonBearerReferenceV1Schema,
  POLICY_CANONICALIZATION_VERSION_V1,
  PolicyDeclarationAuthorityDecisionV1Schema,
  PolicyDeclarationDigestV1Schema,
  PolicyDeclarationIssuerV1Schema,
  PolicyDeclarationSourceEvidenceV1Schema,
  PolicyLogicalIdV1Schema,
  PolicyRuleTargetV1Schema,
  PolicyScopeV1Schema,
  PolicySourceAttestationDigestV1Schema,
  PolicyRuleV1Schema,
  AuthorityVersionV1Schema,
  TenantIdV1Schema,
  WorkspaceIdV1Schema,
  RepositoryIdV1Schema,
} from "./types.js";

export const POLICY_RESOLVER_VERSION_V1 = "lex:normative-policy:resolver:v1" as const;

export function freezeResolutionValue<T>(value: T): PolicyImmutableV1<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeResolutionValue(child);
    Object.freeze(value);
  }
  return value as PolicyImmutableV1<T>;
}

const json = z.unknown().superRefine((value, ctx) => {
  try {
    canonicalizeJson(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "Expected inert JSON data" });
  }
});
function closed<S extends z.ZodType>(schema: S) {
  return json.pipe(schema);
}

function setOf<S extends z.ZodType>(
  schema: S,
  key: (value: z.output<S>) => string = canonicalizeJson
) {
  return z
    .array(schema)
    .superRefine((items, ctx) => {
      if (new Set(items.map(key)).size !== items.length)
        ctx.addIssue({ code: "custom", message: "Duplicate semantic set member" });
    })
    .transform((items) => [...items].sort((a, b) => compareUtf16CodeUnits(key(a), key(b))));
}

export function resolutionDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(domain, "ascii")
    .update(Buffer.from([0]))
    .update(canonicalizeJson(value), "utf8")
    .digest("hex")}`;
}

export const PolicyExceptionOverlayV1Schema: z.ZodType<PolicyExceptionOverlayV1> = closed(
  z
    .object({
      schemaVersion: z.literal(1),
      overlayId: PolicyLogicalIdV1Schema,
      issuer: PolicyDeclarationIssuerV1Schema,
      target: PolicyRuleTargetV1Schema,
      requiredOverrideCapabilityId: CapabilityIdV1Schema,
      revocationEvidenceRef: NonBearerReferenceV1Schema,
      scope: PolicyScopeV1Schema,
      rationale: z
        .string()
        .min(1)
        .max(4096)
        .refine((value) => value.trim().length > 0),
      issuedAt: IsoDateTimeV1Schema,
      expiresAt: IsoDateTimeV1Schema,
      authorizesExecution: z.literal(false),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.expiresAt <= value.issuedAt)
        ctx.addIssue({ code: "custom", message: "Exception expiry must follow issuance" });
    })
).transform(freezeResolutionValue);
export function computePolicyExceptionOverlayDigestV1(value: PolicyExceptionOverlayV1): string {
  return resolutionDigest(
    "lex:normative-policy:exception:v1",
    PolicyExceptionOverlayV1Schema.parse(value)
  );
}

const base64 = z
  .string()
  .max(1400000)
  .refine(
    (value) =>
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) &&
      Buffer.from(value, "base64").toString("base64") === value,
    "Expected canonical base64"
  );
export const PolicyResolutionRequestV1Schema: z.ZodType<PolicyResolutionRequestV1> = closed(
  z
    .object({
      schemaVersion: z.literal(1),
      compiled: CompiledPolicyV1Schema,
      rawSources: setOf(
        z.object({ declarationDigest: PolicyDeclarationDigestV1Schema, base64: base64 }).strict(),
        (value) => value.declarationDigest
      ),
      overlays: setOf(PolicyExceptionOverlayV1Schema, (value) => value.overlayId),
      proposal: z
        .object({
          operationId: PolicyLogicalIdV1Schema.nullable(),
          capabilityId: CapabilityIdV1Schema.nullable(),
          implementationDigest: ContentDigestV1Schema.nullable(),
        })
        .strict(),
      asOf: IsoDateTimeV1Schema,
      evidenceRefs: setOf(NonBearerReferenceV1Schema),
    })
    .strict()
    .superRefine((value, ctx) => {
      const digests = new Set(value.compiled.declarations.map((entry) => entry.declarationDigest));
      if (value.rawSources.some((source) => !digests.has(source.declarationDigest)))
        ctx.addIssue({ code: "custom", message: "Unbound raw source" });
    })
).transform(freezeResolutionValue);
export function computePolicyResolutionRequestDigestV1(value: PolicyResolutionRequestV1): string {
  return resolutionDigest(
    "lex:normative-policy:resolution-request:v1",
    PolicyResolutionRequestV1Schema.parse(value)
  );
}

const validity = z.discriminatedUnion("type", [
  z.object({ type: z.literal("immutable") }).strict(),
  z.object({ type: z.literal("until"), validUntil: IsoDateTimeV1Schema }).strict(),
  z
    .object({ type: z.literal("revalidate_at_use"), revalidatedAt: IsoDateTimeV1Schema.nullable() })
    .strict(),
]);
export const PolicyVerificationEvidenceV1Schema: z.ZodType<PolicyVerificationEvidenceV1> = closed(
  z
    .object({
      ref: NonBearerReferenceV1Schema,
      digest: ContentDigestV1Schema,
      verificationProfileId: PolicyLogicalIdV1Schema,
      observerQualificationDigest: ContentDigestV1Schema,
      observedAt: IsoDateTimeV1Schema,
      validity,
    })
    .strict()
).transform(freezeResolutionValue);
const evidence = setOf(PolicyVerificationEvidenceV1Schema);
const relation = z
  .object({
    source: PolicyRuleTargetV1Schema,
    target: PolicyRuleTargetV1Schema,
    type: z.enum(["refines", "overrides"]),
    requiredAuthorityCapabilityId: CapabilityIdV1Schema,
  })
  .strict();
const declarationVerification = z
  .object({
    declarationDigest: PolicyDeclarationDigestV1Schema,
    decision: PolicyDeclarationAuthorityDecisionV1Schema,
    sourceEvidence: PolicyDeclarationSourceEvidenceV1Schema,
    sourceAttestationRef: NonBearerReferenceV1Schema,
    sourceAttestationDigest: PolicySourceAttestationDigestV1Schema,
    approvedRelations: setOf(relation),
    evidence,
  })
  .strict();
const factCommon = { status: z.enum(["verified", "unknown"]), evidence };
const fact = z.discriminatedUnion("key", [
  z
    .object({ ...factCommon, key: z.literal("tenantId"), value: TenantIdV1Schema.nullable() })
    .strict(),
  z
    .object({ ...factCommon, key: z.literal("workspaceId"), value: WorkspaceIdV1Schema.nullable() })
    .strict(),
  z
    .object({
      ...factCommon,
      key: z.literal("repositoryId"),
      value: RepositoryIdV1Schema.nullable(),
    })
    .strict(),
]);
const routeClassification = z
  .object({
    capabilityId: CapabilityIdV1Schema,
    routeClassId: PolicyLogicalIdV1Schema,
    status: z.enum(["member", "not_member", "unknown"]),
    evidence,
  })
  .strict();
const implementation = z
  .object({
    capabilityId: CapabilityIdV1Schema,
    implementationDigest: ContentDigestV1Schema,
    status: z.enum(["qualified", "unqualified", "unknown"]),
    evidence,
  })
  .strict();
const overlayVerification = z
  .object({
    overlayDigest: ContentDigestV1Schema,
    status: z.enum(["authorized", "unauthorized", "unknown"]),
    issuer: PolicyDeclarationIssuerV1Schema,
    target: PolicyRuleTargetV1Schema,
    scope: PolicyScopeV1Schema,
    requiredOverrideCapabilityId: CapabilityIdV1Schema,
    authorityVersion: AuthorityVersionV1Schema,
    evaluatedAt: IsoDateTimeV1Schema,
    validUntil: IsoDateTimeV1Schema,
    revocation: z.enum(["not_revoked", "revoked", "unknown"]),
    revocationEvidence: PolicyVerificationEvidenceV1Schema,
    evidence,
  })
  .strict();

export const PolicyResolverVerificationV1Schema: z.ZodType<PolicyResolverVerificationV1> = closed(
  z
    .object({
      schemaVersion: z.literal(1),
      requestDigest: ContentDigestV1Schema,
      verifierVersion: PolicyLogicalIdV1Schema,
      declarations: setOf(declarationVerification, (value) => value.declarationDigest),
      // Different observations of the same fact are retained to diagnose contradiction.
      facts: setOf(fact),
      routeClassifications: setOf(routeClassification, (value) =>
        canonicalizeJson([value.capabilityId, value.routeClassId])
      ),
      selectedImplementation: implementation.nullable(),
      overlays: setOf(overlayVerification, (value) => value.overlayDigest),
      authorizesExecution: z.literal(false),
    })
    .strict()
).transform(freezeResolutionValue);

/** Installed by protected host code, never supplied through resolution request data.
 * Implementations authenticate provenance and all exact joins described in the resolver guide.
 * This interface itself is not proof that a host protected its installation. */
export interface PolicyResolverVerifierV1 {
  readonly version: string;
  verify(input: {
    readonly request: PolicyResolutionRequestV1;
    readonly requestDigest: string;
  }): unknown | Promise<unknown>;
}

export const POLICY_RESOLVER_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "verifier_failed",
  "invalid_verification",
  "verification_binding_mismatch",
  "declaration_untrusted",
  "mandatory_unknown",
  "mandatory_unsatisfied",
  "dependency_unsatisfied",
  "relation_unauthorized",
  "conflict",
  "conflict_unknown",
  "overlay_rejected",
  "implementation_unqualified",
] as const);
const diagnostic = z
  .object({
    code: z.enum(POLICY_RESOLVER_DIAGNOSTIC_CODES_V1),
    rule: PolicyRuleTargetV1Schema.nullable(),
    related: PolicyRuleTargetV1Schema.nullable(),
    overlayId: PolicyLogicalIdV1Schema.nullable(),
  })
  .strict();
const ruleResult = z
  .object({
    target: PolicyRuleTargetV1Schema,
    rule: PolicyRuleV1Schema,
    declarationTrusted: z.boolean(),
    applicability: z.enum(["applicable", "not_applicable", "unknown"]),
    activation: z.enum(["active", "dormant", "unknown"]),
    satisfaction: z.enum(["satisfied", "unsatisfied", "unknown", "not_evaluated"]),
    disposition: z.enum(["effective", "inactive", "untrusted", "unknown", "suppressed"]),
  })
  .strict();
const trace = z
  .object({
    source: PolicyRuleTargetV1Schema,
    target: PolicyRuleTargetV1Schema,
    type: z.enum(["depends_on", "refines", "overrides"]),
    outcome: z.enum([
      "additive",
      "suppressed",
      "non_conflicting",
      "inactive",
      "unauthorized",
      "unknown",
      "satisfied",
      "unsatisfied",
    ]),
  })
  .strict();
const conflict = z
  .object({
    left: PolicyRuleTargetV1Schema,
    right: PolicyRuleTargetV1Schema,
    status: z.enum(["conflict", "unknown"]),
  })
  .strict();

export const PolicySnapshotPreimageV1Schema: z.ZodType<PolicySnapshotPreimageV1> = closed(
  z
    .object({
      schemaVersion: z.literal(1),
      canonicalizationVersion: z.literal(POLICY_CANONICALIZATION_VERSION_V1),
      compilerVersion: z.literal(POLICY_COMPILER_VERSION_V1),
      resolverVersion: z.literal(POLICY_RESOLVER_VERSION_V1),
      asOf: IsoDateTimeV1Schema,
      requestDigest: ContentDigestV1Schema,
      request: PolicyResolutionRequestV1Schema,
      verifierVersion: PolicyLogicalIdV1Schema,
      verification: PolicyResolverVerificationV1Schema.nullable(),
      rules: setOf(ruleResult, (value) => canonicalizeJson(value.target)),
      relations: setOf(trace),
      conflicts: setOf(conflict),
      diagnostics: setOf(diagnostic),
      effectiveRules: setOf(PolicyRuleTargetV1Schema),
      affirmativeAllowances: setOf(PolicyRuleTargetV1Schema),
      policyAdmission: z.enum(["satisfied", "blocked"]),
      authorizesExecution: z.literal(false),
    })
    .strict()
    .superRefine((value, ctx) => {
      const expectedRules = value.request.compiled.declarations.flatMap((entry) =>
        entry.declaration.rules.map((rule) => ({ entry, rule }))
      );
      if (
        value.rules.length !== expectedRules.length ||
        value.rules.some(
          (result) =>
            !expectedRules.some(
              ({ entry, rule }) =>
                result.target.declarationId === entry.declaration.declarationId &&
                result.target.declarationRevision === entry.declaration.revision &&
                result.target.ruleId === rule.ruleId &&
                result.target.expectedSemanticDigest === computePolicySemanticDigestV1(rule) &&
                canonicalizeJson(result.rule) === canonicalizeJson(rule)
            )
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Snapshot rule set must match its compiled declarations",
        });
      const sorted = (items: unknown[]) => items.map(canonicalizeJson).sort(compareUtf16CodeUnits);
      if (
        canonicalizeJson(sorted(value.effectiveRules)) !==
          canonicalizeJson(
            sorted(
              value.rules
                .filter((rule) => rule.disposition === "effective")
                .map((rule) => rule.target)
            )
          ) ||
        canonicalizeJson(sorted(value.affirmativeAllowances)) !==
          canonicalizeJson(
            sorted(
              value.rules
                .filter(
                  (rule) =>
                    rule.disposition === "effective" &&
                    rule.rule.kind === "permit" &&
                    rule.satisfaction === "satisfied"
                )
                .map((rule) => rule.target)
            )
          )
      )
        ctx.addIssue({
          code: "custom",
          message: "Snapshot effective rules or allowances mismatch",
        });
      if (
        (value.policyAdmission === "satisfied") !== (value.diagnostics.length === 0) ||
        (value.policyAdmission === "satisfied" &&
          (value.verification === null || value.conflicts.length > 0))
      )
        ctx.addIssue({
          code: "custom",
          message: "Snapshot admission contradicts verification or diagnostics",
        });
      if (
        value.requestDigest !==
          resolutionDigest("lex:normative-policy:resolution-request:v1", value.request) ||
        value.asOf !== value.request.asOf ||
        (value.verification !== null &&
          (value.verification.requestDigest !== value.requestDigest ||
            value.verification.verifierVersion !== value.verifierVersion))
      )
        ctx.addIssue({ code: "custom", message: "Snapshot request binding mismatch" });
    })
).transform(freezeResolutionValue);
export function computePolicySnapshotDigestV1(value: PolicySnapshotPreimageV1): string {
  return resolutionDigest(
    "lex:normative-policy:snapshot:v1",
    PolicySnapshotPreimageV1Schema.parse(value)
  );
}
export const EffectivePolicySnapshotV1Schema: z.ZodType<EffectivePolicySnapshotV1> = closed(
  z
    .object({
      payload: PolicySnapshotPreimageV1Schema,
      snapshotDigest: ContentDigestV1Schema,
    })
    .strict()
    .superRefine((value, ctx) => {
      if (
        value.snapshotDigest !== resolutionDigest("lex:normative-policy:snapshot:v1", value.payload)
      )
        ctx.addIssue({ code: "custom", message: "Snapshot digest mismatch" });
    })
).transform(freezeResolutionValue);
