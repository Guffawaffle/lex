import { z } from "zod";

import type {
  AuthorityVersion,
  CapabilityId,
  ContentDigest,
  PrincipalId,
  RepositoryId,
  TenantId,
  WorkspaceId,
} from "../shared/runtime-scope/index.js";
import { canonicalizeJson, compareUtf16CodeUnits } from "./canonical-json.js";

export const NORMATIVE_POLICY_CONTRACT_VERSION = 1 as const;
export const POLICY_CANONICALIZATION_VERSION_V1 = "lex:normative-policy:jcs:v1" as const;

export const POLICY_ENFORCEMENT_INTENTS_V1 = Object.freeze([
  "prompt_guidance",
  "lifecycle_precondition",
  "capability_gate",
  "verifier",
  "audit",
] as const);

export const POLICY_UNAUTHORIZED_REASONS_V1 = Object.freeze([
  "issuer_unknown",
  "capability_missing",
  "scope_unauthorized",
  "attestation_invalid",
  "attestation_expired",
  "attestation_revoked",
] as const);

export const POLICY_UNKNOWN_AUTHORITY_REASONS_V1 = Object.freeze([
  "authority_unavailable",
  "evidence_stale",
  "verification_failed",
] as const);

declare const policyLogicalIdBrand: unique symbol;
declare const canonicalRepositoryRelativePathBrand: unique symbol;
declare const nonBearerReferenceBrand: unique symbol;
declare const isoDateTimeV1Brand: unique symbol;
declare const normativePolicyDigestBrand: unique symbol;

export type PolicyLogicalIdV1 = string & {
  readonly [policyLogicalIdBrand]: "PolicyLogicalIdV1";
};

export type CanonicalRepositoryRelativePathV1 = string & {
  readonly [canonicalRepositoryRelativePathBrand]: "CanonicalRepositoryRelativePathV1";
};

export type NonBearerReferenceV1 = string & {
  readonly [nonBearerReferenceBrand]: "NonBearerReferenceV1";
};

export type IsoDateTimeV1 = string & {
  readonly [isoDateTimeV1Brand]: "IsoDateTimeV1";
};

export type PolicyDigestV1<Kind extends string> = ContentDigest & {
  readonly [normativePolicyDigestBrand]: Kind;
};

export type PolicySourceContentDigestV1 = PolicyDigestV1<"source-content">;
export type PolicySemanticDigestV1 = PolicyDigestV1<"semantic">;
export type PolicyDeclarationDigestV1 = PolicyDigestV1<"declaration">;
export type PolicySourceAttestationDigestV1 = PolicyDigestV1<"source-attestation">;
export type PolicyDeclarationAuthorityDecisionDigestV1 =
  PolicyDigestV1<"declaration-authority-decision">;

type AssertFalse<Value extends false> = Value;
type _SourceAndSemanticDigestsRemainDistinct = AssertFalse<
  PolicySourceContentDigestV1 extends PolicySemanticDigestV1 ? true : false
>;
type _SemanticAndDeclarationDigestsRemainDistinct = AssertFalse<
  PolicySemanticDigestV1 extends PolicyDeclarationDigestV1 ? true : false
>;
type _AttestationAndDecisionDigestsRemainDistinct = AssertFalse<
  PolicySourceAttestationDigestV1 extends PolicyDeclarationAuthorityDecisionDigestV1 ? true : false
>;

const LOGICAL_ID_PATTERN = /^[a-z0-9][a-z0-9._:/-]*$/;
const OPAQUE_UUID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$/;
const NON_BEARER_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;
const CONTENT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ISO_DATE_TIME_V1_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function hasDuplicateBy<T>(values: readonly T[], keyOf: (value: T) => string): boolean {
  const keys = new Set<string>();
  for (const value of values) {
    const key = keyOf(value);
    if (keys.has(key)) return true;
    keys.add(key);
  }
  return false;
}

function compareCanonicalValues(left: unknown, right: unknown): number {
  return Buffer.compare(
    Buffer.from(canonicalizeJson(left), "utf8"),
    Buffer.from(canonicalizeJson(right), "utf8")
  );
}

function findForbiddenPolicyObjectKey(value: unknown, path = "$"): string | undefined {
  if (value === null || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenPolicyObjectKey(value[index], `${path}[${index}]`);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    const memberPath = `${path}[${JSON.stringify(key)}]`;
    if (key === "__proto__") return memberPath;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const memberValue: unknown = descriptor?.value;
    const nested = findForbiddenPolicyObjectKey(memberValue, memberPath);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

const policyJsonInputSchema = z.unknown().superRefine((value, context) => {
  try {
    canonicalizeJson(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error
          ? `must be JSON data: ${error.message}`
          : "must be JSON data without active or exotic values",
    });
    return;
  }

  const forbiddenKeyPath = findForbiddenPolicyObjectKey(value);
  if (forbiddenKeyPath !== undefined) {
    context.addIssue({
      code: "custom",
      message: `must not contain the reserved object member ${forbiddenKeyPath}`,
    });
  }
});

function withPolicyJsonInput<Schema extends z.ZodType>(schema: Schema) {
  return policyJsonInputSchema.pipe(schema);
}

function opaqueUuidSchema<Output extends string>(name: string) {
  return z
    .string()
    .regex(OPAQUE_UUID_PATTERN, `${name} must be an opaque UUID with RFC 4122 variant bits`)
    .transform((value): Output => value.toLowerCase() as Output);
}

function boundedOpaqueValueSchema<Output extends string>(name: string) {
  return z
    .string()
    .min(1)
    .max(200)
    .regex(NON_BEARER_REFERENCE_PATTERN, `${name} must be a bounded visible-ASCII identifier`)
    .transform((value): Output => value as Output);
}

function policyDigestSchema<Kind extends string>() {
  return z
    .string()
    .regex(CONTENT_DIGEST_PATTERN, "must be a lowercase sha256:<64-hex> digest")
    .transform((value): PolicyDigestV1<Kind> => value as PolicyDigestV1<Kind>);
}

export const PolicyLogicalIdV1Schema = z
  .string()
  .min(1)
  .max(200)
  .regex(LOGICAL_ID_PATTERN, "must be a stable lowercase policy logical ID")
  .transform((value): PolicyLogicalIdV1 => value as PolicyLogicalIdV1);

export const TenantIdV1Schema = opaqueUuidSchema<TenantId>("tenantId");
export const PrincipalIdV1Schema = opaqueUuidSchema<PrincipalId>("principalId");
export const WorkspaceIdV1Schema = opaqueUuidSchema<WorkspaceId>("workspaceId");
export const RepositoryIdV1Schema = opaqueUuidSchema<RepositoryId>("repositoryId");
export const CapabilityIdV1Schema = boundedOpaqueValueSchema<CapabilityId>("capabilityId");
export const AuthorityVersionV1Schema =
  boundedOpaqueValueSchema<AuthorityVersion>("authorityVersion");

export const NonBearerReferenceV1Schema = z
  .string()
  .min(1)
  .max(512)
  .regex(NON_BEARER_REFERENCE_PATTERN, "must be a bounded visible-ASCII non-bearer reference")
  .transform((value): NonBearerReferenceV1 => value as NonBearerReferenceV1);

export const ContentDigestV1Schema = z
  .string()
  .regex(CONTENT_DIGEST_PATTERN, "must be a lowercase sha256:<64-hex> digest")
  .transform((value): ContentDigest => value as ContentDigest);

export const PolicySourceContentDigestV1Schema = policyDigestSchema<"source-content">();
export const PolicySemanticDigestV1Schema = policyDigestSchema<"semantic">();
export const PolicyDeclarationDigestV1Schema = policyDigestSchema<"declaration">();
export const PolicySourceAttestationDigestV1Schema = policyDigestSchema<"source-attestation">();
export const PolicyDeclarationAuthorityDecisionDigestV1Schema =
  policyDigestSchema<"declaration-authority-decision">();

export const IsoDateTimeV1Schema = z
  .string()
  .regex(ISO_DATE_TIME_V1_PATTERN, "must use canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ form")
  .refine((value) => {
    const instant = new Date(value);
    return !Number.isNaN(instant.valueOf()) && instant.toISOString() === value;
  }, "must identify an actual calendar instant in canonical UTC form")
  .transform((value): IsoDateTimeV1 => value as IsoDateTimeV1);

export const PositiveSafeIntegerV1Schema = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger, "must be a positive safe integer");

export const CanonicalRepositoryRelativePathV1Schema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/"), "must be repository-relative")
  .refine((value) => !/^[A-Za-z]:/.test(value), "must not begin with a Windows drive designator")
  .refine((value) => !value.includes("\\"), "must use forward slashes")
  .refine((value) => !value.includes("\0"), "must not contain NUL")
  .refine((value) => {
    try {
      canonicalizeJson(value);
      return true;
    } catch {
      return false;
    }
  }, "must not contain unpaired UTF-16 surrogates")
  .refine(
    (value) =>
      value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "must not contain empty, dot, or dot-dot segments"
  )
  .transform(
    (value): CanonicalRepositoryRelativePathV1 => value as CanonicalRepositoryRelativePathV1
  );

const GlobalPolicyScopeV1Schema = z.object({ type: z.literal("global") }).strict();
const TenantPolicyScopeV1Schema = z
  .object({ type: z.literal("tenant"), tenantId: TenantIdV1Schema })
  .strict();
const WorkspacePolicyScopeV1Schema = z
  .object({ type: z.literal("workspace"), workspaceId: WorkspaceIdV1Schema })
  .strict();
const RepositoryPolicyScopeV1Schema = z
  .object({ type: z.literal("repository"), repositoryId: RepositoryIdV1Schema })
  .strict();
const WorkspaceRepositoryPolicyScopeV1Schema = z
  .object({
    type: z.literal("workspace_repository"),
    workspaceId: WorkspaceIdV1Schema,
    repositoryId: RepositoryIdV1Schema,
  })
  .strict();

export const PolicyScopeV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("type", [
    GlobalPolicyScopeV1Schema,
    TenantPolicyScopeV1Schema,
    WorkspacePolicyScopeV1Schema,
    RepositoryPolicyScopeV1Schema,
    WorkspaceRepositoryPolicyScopeV1Schema,
  ])
);
export type PolicyScopeV1 = z.infer<typeof PolicyScopeV1Schema>;

const CapabilityPolicyRouteV1Schema = z
  .object({ type: z.literal("capability"), capabilityId: CapabilityIdV1Schema })
  .strict();
const RouteClassPolicyRouteV1Schema = z
  .object({ type: z.literal("route_class"), routeClassId: PolicyLogicalIdV1Schema })
  .strict();

export const PolicyRouteV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("type", [CapabilityPolicyRouteV1Schema, RouteClassPolicyRouteV1Schema])
);
export type PolicyRouteV1 = z.infer<typeof PolicyRouteV1Schema>;

const OperationPolicyPropositionV1Schema = z
  .object({ type: z.literal("operation"), operationId: PolicyLogicalIdV1Schema })
  .strict();
const OperationRoutePolicyPropositionV1Schema = z
  .object({
    type: z.literal("operation_route"),
    operationId: PolicyLogicalIdV1Schema,
    route: PolicyRouteV1Schema,
  })
  .strict();

export const PolicyPropositionV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("type", [
    OperationPolicyPropositionV1Schema,
    OperationRoutePolicyPropositionV1Schema,
  ])
);
export type PolicyPropositionV1 = z.infer<typeof PolicyPropositionV1Schema>;

const AlwaysPolicyActivationConditionV1Schema = z.object({ type: z.literal("always") }).strict();
const OperationRequestedPolicyActivationConditionV1Schema = z
  .object({ type: z.literal("operation_requested"), operationId: PolicyLogicalIdV1Schema })
  .strict();

export const PolicyActivationConditionV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("type", [
    AlwaysPolicyActivationConditionV1Schema,
    OperationRequestedPolicyActivationConditionV1Schema,
  ])
);
export type PolicyActivationConditionV1 = z.infer<typeof PolicyActivationConditionV1Schema>;

export const PolicyEnforcementIntentV1Schema = z.enum(POLICY_ENFORCEMENT_INTENTS_V1);
export type PolicyEnforcementIntentV1 = z.infer<typeof PolicyEnforcementIntentV1Schema>;

export const PolicyRuleTargetV1Schema = withPolicyJsonInput(
  z
    .object({
      declarationId: PolicyLogicalIdV1Schema,
      declarationRevision: PositiveSafeIntegerV1Schema,
      ruleId: PolicyLogicalIdV1Schema,
      expectedSemanticDigest: PolicySemanticDigestV1Schema,
    })
    .strict()
);
export type PolicyRuleTargetV1 = z.infer<typeof PolicyRuleTargetV1Schema>;

const DependsOnPolicyRuleRelationV1Schema = z
  .object({ type: z.literal("depends_on"), target: PolicyRuleTargetV1Schema })
  .strict();
const RefinesPolicyRuleRelationV1Schema = z
  .object({
    type: z.literal("refines"),
    target: PolicyRuleTargetV1Schema,
    requiredAuthorityCapabilityId: CapabilityIdV1Schema,
  })
  .strict();
const OverridesPolicyRuleRelationV1Schema = z
  .object({
    type: z.literal("overrides"),
    target: PolicyRuleTargetV1Schema,
    requiredAuthorityCapabilityId: CapabilityIdV1Schema,
  })
  .strict();

export const PolicyRuleRelationV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("type", [
    DependsOnPolicyRuleRelationV1Schema,
    RefinesPolicyRuleRelationV1Schema,
    OverridesPolicyRuleRelationV1Schema,
  ])
);
export type PolicyRuleRelationV1 = z.infer<typeof PolicyRuleRelationV1Schema>;

export const PolicyRuleRelationsV1Schema = withPolicyJsonInput(
  z
    .array(PolicyRuleRelationV1Schema)
    .superRefine((relations, context) => {
      if (hasDuplicateBy(relations, canonicalizeJson)) {
        context.addIssue({ code: "custom", message: "relations must not contain duplicates" });
      }
    })
    .transform((relations): readonly PolicyRuleRelationV1[] =>
      [...relations].sort(compareCanonicalValues)
    )
);

const enforcementIntentOrder = new Map<PolicyEnforcementIntentV1, number>(
  POLICY_ENFORCEMENT_INTENTS_V1.map((intent, index) => [intent, index])
);

export const PolicyEnforcementIntentsV1Schema = withPolicyJsonInput(
  z
    .array(PolicyEnforcementIntentV1Schema)
    .min(1)
    .superRefine((intents, context) => {
      if (hasDuplicateBy(intents, (intent) => intent)) {
        context.addIssue({
          code: "custom",
          message: "enforcementIntents must not contain duplicates",
        });
      }
    })
    .transform((intents): readonly PolicyEnforcementIntentV1[] =>
      [...intents].sort(
        (left, right) =>
          (enforcementIntentOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (enforcementIntentOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      )
    )
);

export const PolicyOrderedAlternativesV1Schema = withPolicyJsonInput(
  z
    .array(PolicyPropositionV1Schema)
    .min(2)
    .superRefine((alternatives, context) => {
      if (hasDuplicateBy(alternatives, canonicalizeJson)) {
        context.addIssue({
          code: "custom",
          message: "orderedAlternatives must not contain duplicates",
        });
      }
    })
    .transform(
      (
        alternatives
      ): readonly [PolicyPropositionV1, PolicyPropositionV1, ...PolicyPropositionV1[]] =>
        [...alternatives] as [PolicyPropositionV1, PolicyPropositionV1, ...PolicyPropositionV1[]]
    )
);

const RequirePolicyNormativeStatementV1Schema = z
  .object({ kind: z.literal("require"), proposition: PolicyPropositionV1Schema })
  .strict();
const ForbidPolicyNormativeStatementV1Schema = z
  .object({ kind: z.literal("forbid"), proposition: PolicyPropositionV1Schema })
  .strict();
const PermitPolicyNormativeStatementV1Schema = z
  .object({ kind: z.literal("permit"), proposition: PolicyPropositionV1Schema })
  .strict();
const RecommendPolicyNormativeStatementV1Schema = z
  .object({ kind: z.literal("recommend"), proposition: PolicyPropositionV1Schema })
  .strict();
const PreferPolicyNormativeStatementV1Schema = z
  .object({ kind: z.literal("prefer"), orderedAlternatives: PolicyOrderedAlternativesV1Schema })
  .strict();

export const PolicyNormativeStatementV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("kind", [
    RequirePolicyNormativeStatementV1Schema,
    ForbidPolicyNormativeStatementV1Schema,
    PermitPolicyNormativeStatementV1Schema,
    RecommendPolicyNormativeStatementV1Schema,
    PreferPolicyNormativeStatementV1Schema,
  ])
);
export type PolicyNormativeStatementV1 = z.infer<typeof PolicyNormativeStatementV1Schema>;

const policyRuleCommonShape = {
  ruleId: PolicyLogicalIdV1Schema,
  activationCondition: PolicyActivationConditionV1Schema,
  relations: PolicyRuleRelationsV1Schema,
  enforcementIntents: PolicyEnforcementIntentsV1Schema,
};

export const PolicyRuleCommonV1Schema = withPolicyJsonInput(
  z.object(policyRuleCommonShape).strict()
);
export type PolicyRuleCommonV1 = z.infer<typeof PolicyRuleCommonV1Schema>;

const RequirePolicyRuleV1Schema = z
  .object({
    ...policyRuleCommonShape,
    kind: z.literal("require"),
    proposition: PolicyPropositionV1Schema,
  })
  .strict();
const ForbidPolicyRuleV1Schema = z
  .object({
    ...policyRuleCommonShape,
    kind: z.literal("forbid"),
    proposition: PolicyPropositionV1Schema,
  })
  .strict();
const PermitPolicyRuleV1Schema = z
  .object({
    ...policyRuleCommonShape,
    kind: z.literal("permit"),
    proposition: PolicyPropositionV1Schema,
  })
  .strict();
const RecommendPolicyRuleV1Schema = z
  .object({
    ...policyRuleCommonShape,
    kind: z.literal("recommend"),
    proposition: PolicyPropositionV1Schema,
  })
  .strict();
const PreferPolicyRuleV1Schema = z
  .object({
    ...policyRuleCommonShape,
    kind: z.literal("prefer"),
    orderedAlternatives: PolicyOrderedAlternativesV1Schema,
  })
  .strict();

const policyRuleShapeSchema = z.discriminatedUnion("kind", [
  RequirePolicyRuleV1Schema,
  ForbidPolicyRuleV1Schema,
  PermitPolicyRuleV1Schema,
  RecommendPolicyRuleV1Schema,
  PreferPolicyRuleV1Schema,
]);

export const PolicyRuleV1Schema = withPolicyJsonInput(
  policyRuleShapeSchema.superRefine((rule, context) => {
    const intents = new Set<PolicyEnforcementIntentV1>(rule.enforcementIntents);
    if (rule.kind === "permit" && intents.has("verifier")) {
      context.addIssue({
        code: "custom",
        path: ["enforcementIntents"],
        message: "permit rules cannot carry verifier enforcement intent",
      });
    }
    if (
      (rule.kind === "recommend" || rule.kind === "prefer") &&
      [...intents].some((intent) => intent !== "prompt_guidance" && intent !== "audit")
    ) {
      context.addIssue({
        code: "custom",
        path: ["enforcementIntents"],
        message: "recommend and prefer rules may carry only prompt_guidance and audit intents",
      });
    }

    if (rule.activationCondition.type === "operation_requested") {
      const requestedOperationId = rule.activationCondition.operationId;
      const propositions =
        rule.kind === "prefer" ? rule.orderedAlternatives : ([rule.proposition] as const);
      propositions.forEach((proposition, index) => {
        if (proposition.operationId !== requestedOperationId) {
          context.addIssue({
            code: "custom",
            path:
              rule.kind === "prefer"
                ? ["orderedAlternatives", index, "operationId"]
                : ["proposition", "operationId"],
            message:
              "operation_requested operationId must match every proposition operationId in V1",
          });
        }
      });
    }
  })
);
export type PolicyRuleV1 = z.infer<typeof PolicyRuleV1Schema>;

export const PolicyRulesV1Schema = withPolicyJsonInput(
  z
    .array(PolicyRuleV1Schema)
    .min(1)
    .superRefine((rules, context) => {
      if (hasDuplicateBy(rules, (rule) => rule.ruleId)) {
        context.addIssue({
          code: "custom",
          message: "rules must not contain duplicate ruleId values",
        });
      }
    })
    .transform(
      (rules): readonly [PolicyRuleV1, ...PolicyRuleV1[]] =>
        [...rules].sort((left, right) => compareUtf16CodeUnits(left.ruleId, right.ruleId)) as [
          PolicyRuleV1,
          ...PolicyRuleV1[],
        ]
    )
);

const RepositoryFilePolicySourceLocatorV1Schema = z
  .object({
    type: z.literal("repository_file"),
    repositoryId: RepositoryIdV1Schema,
    path: CanonicalRepositoryRelativePathV1Schema,
    revision: PolicyLogicalIdV1Schema,
  })
  .strict();
const AuthorityRecordPolicySourceLocatorV1Schema = z
  .object({
    type: z.literal("authority_record"),
    recordRef: NonBearerReferenceV1Schema,
    revision: PolicyLogicalIdV1Schema,
  })
  .strict();
const SyntheticFixturePolicySourceLocatorV1Schema = z
  .object({ type: z.literal("synthetic_fixture"), fixtureId: PolicyLogicalIdV1Schema })
  .strict();

export const PolicySourceLocatorV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("type", [
    RepositoryFilePolicySourceLocatorV1Schema,
    AuthorityRecordPolicySourceLocatorV1Schema,
    SyntheticFixturePolicySourceLocatorV1Schema,
  ])
);
export type PolicySourceLocatorV1 = z.infer<typeof PolicySourceLocatorV1Schema>;

export const PolicyDeclarationIssuerV1Schema = withPolicyJsonInput(
  z
    .object({
      principalId: PrincipalIdV1Schema,
      authorityDomainId: PolicyLogicalIdV1Schema,
      requiredAuthoringCapabilityId: CapabilityIdV1Schema,
    })
    .strict()
);
export type PolicyDeclarationIssuerV1 = z.infer<typeof PolicyDeclarationIssuerV1Schema>;

export const PolicyDeclarationV1Schema = withPolicyJsonInput(
  z
    .object({
      schemaVersion: z.literal(NORMATIVE_POLICY_CONTRACT_VERSION),
      declarationId: PolicyLogicalIdV1Schema,
      revision: PositiveSafeIntegerV1Schema,
      issuer: PolicyDeclarationIssuerV1Schema,
      scope: PolicyScopeV1Schema,
      rules: PolicyRulesV1Schema,
      authorizesExecution: z.literal(false),
    })
    .strict()
);
export type PolicyDeclarationV1 = z.infer<typeof PolicyDeclarationV1Schema>;

export const PolicyDeclarationSourceEvidenceV1Schema = withPolicyJsonInput(
  z
    .object({
      schemaVersion: z.literal(NORMATIVE_POLICY_CONTRACT_VERSION),
      source: PolicySourceLocatorV1Schema,
      sourceContentDigest: PolicySourceContentDigestV1Schema,
      declarationDigest: PolicyDeclarationDigestV1Schema,
      authorizesExecution: z.literal(false),
    })
    .strict()
);
export type PolicyDeclarationSourceEvidenceV1 = z.infer<
  typeof PolicyDeclarationSourceEvidenceV1Schema
>;

const sortedCapabilitiesSchema = z
  .array(CapabilityIdV1Schema)
  .min(1)
  .superRefine((capabilities, context) => {
    if (hasDuplicateBy(capabilities, (capability) => capability)) {
      context.addIssue({
        code: "custom",
        message: "grantedAuthoringCapabilities must not contain duplicates",
      });
    }
  })
  .transform(
    (capabilities): readonly [CapabilityId, ...CapabilityId[]] =>
      [...capabilities].sort(compareCanonicalValues) as [CapabilityId, ...CapabilityId[]]
  );

const sortedEvidenceRefsSchema = z
  .array(NonBearerReferenceV1Schema)
  .superRefine((references, context) => {
    if (hasDuplicateBy(references, (reference) => reference)) {
      context.addIssue({ code: "custom", message: "evidenceRefs must not contain duplicates" });
    }
  })
  .transform((references): readonly NonBearerReferenceV1[] =>
    [...references].sort(compareCanonicalValues)
  );

export const PolicyRevocationEvidenceV1Schema = withPolicyJsonInput(
  z
    .object({
      ref: NonBearerReferenceV1Schema,
      digest: ContentDigestV1Schema,
      observedAt: IsoDateTimeV1Schema,
      state: z.literal("not_revoked"),
    })
    .strict()
);
export type PolicyRevocationEvidenceV1 = z.infer<typeof PolicyRevocationEvidenceV1Schema>;

const policyDeclarationAuthorityDecisionCommonShape = {
  schemaVersion: z.literal(NORMATIVE_POLICY_CONTRACT_VERSION),
  declarationDigest: PolicyDeclarationDigestV1Schema,
  issuerPrincipalId: PrincipalIdV1Schema,
  authorityDomainId: PolicyLogicalIdV1Schema,
  requiredAuthoringCapabilityId: CapabilityIdV1Schema,
  evaluatedAt: IsoDateTimeV1Schema,
  validUntil: IsoDateTimeV1Schema,
  authorizesExecution: z.literal(false),
};

export const PolicyDeclarationAuthorityDecisionCommonV1Schema = withPolicyJsonInput(
  z
    .object(policyDeclarationAuthorityDecisionCommonShape)
    .strict()
    .superRefine((payload, context) => {
      if (Date.parse(payload.validUntil) <= Date.parse(payload.evaluatedAt)) {
        context.addIssue({
          code: "custom",
          path: ["validUntil"],
          message: "validUntil must be later than evaluatedAt",
        });
      }
    })
);
export type PolicyDeclarationAuthorityDecisionCommonV1 = z.infer<
  typeof PolicyDeclarationAuthorityDecisionCommonV1Schema
>;

const AuthorizedPolicyDeclarationAuthorityDecisionPayloadV1Schema = z
  .object({
    ...policyDeclarationAuthorityDecisionCommonShape,
    status: z.literal("authorized"),
    authorityVersion: AuthorityVersionV1Schema,
    sourceAttestationRef: NonBearerReferenceV1Schema,
    sourceAttestationDigest: PolicySourceAttestationDigestV1Schema,
    grantedAuthoringCapabilities: sortedCapabilitiesSchema,
    revocationEvidence: PolicyRevocationEvidenceV1Schema,
  })
  .strict();

const UnauthorizedPolicyDeclarationAuthorityDecisionPayloadV1Schema = z
  .object({
    ...policyDeclarationAuthorityDecisionCommonShape,
    status: z.literal("unauthorized"),
    authorityVersion: AuthorityVersionV1Schema,
    reason: z.enum(POLICY_UNAUTHORIZED_REASONS_V1),
    evidenceRefs: sortedEvidenceRefsSchema,
  })
  .strict();

const UnknownPolicyDeclarationAuthorityDecisionPayloadV1Schema = z
  .object({
    ...policyDeclarationAuthorityDecisionCommonShape,
    status: z.literal("unknown"),
    lastKnownAuthorityVersion: AuthorityVersionV1Schema.optional(),
    reason: z.enum(POLICY_UNKNOWN_AUTHORITY_REASONS_V1),
    evidenceRefs: sortedEvidenceRefsSchema,
  })
  .strict();

const policyDeclarationAuthorityDecisionPayloadShapeSchema = z.discriminatedUnion("status", [
  AuthorizedPolicyDeclarationAuthorityDecisionPayloadV1Schema,
  UnauthorizedPolicyDeclarationAuthorityDecisionPayloadV1Schema,
  UnknownPolicyDeclarationAuthorityDecisionPayloadV1Schema,
]);

export const PolicyDeclarationAuthorityDecisionPayloadV1Schema = withPolicyJsonInput(
  policyDeclarationAuthorityDecisionPayloadShapeSchema.superRefine((payload, context) => {
    if (Date.parse(payload.validUntil) <= Date.parse(payload.evaluatedAt)) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "validUntil must be later than evaluatedAt",
      });
    }
    if (
      payload.status === "authorized" &&
      Date.parse(payload.revocationEvidence.observedAt) > Date.parse(payload.evaluatedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["revocationEvidence", "observedAt"],
        message: "revocationEvidence.observedAt must be no later than evaluatedAt",
      });
    }
    if (
      payload.status === "unknown" &&
      Object.prototype.hasOwnProperty.call(payload, "lastKnownAuthorityVersion") &&
      payload.lastKnownAuthorityVersion === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["lastKnownAuthorityVersion"],
        message: "explicit undefined is not a JSON value; omit lastKnownAuthorityVersion",
      });
    }
  })
);
export type PolicyDeclarationAuthorityDecisionPayloadV1 = z.infer<
  typeof PolicyDeclarationAuthorityDecisionPayloadV1Schema
>;

export const PolicyDeclarationAuthorityDecisionV1Schema = withPolicyJsonInput(
  z
    .object({
      payload: PolicyDeclarationAuthorityDecisionPayloadV1Schema,
      declarationAuthorityDecisionDigest: PolicyDeclarationAuthorityDecisionDigestV1Schema,
    })
    .strict()
);
export type PolicyDeclarationAuthorityDecisionV1 = z.infer<
  typeof PolicyDeclarationAuthorityDecisionV1Schema
>;

export const PolicyRuleSemanticDigestPreimageV1Schema = withPolicyJsonInput(
  z
    .object({
      canonicalizationVersion: z.literal(POLICY_CANONICALIZATION_VERSION_V1),
      schemaVersion: z.literal(NORMATIVE_POLICY_CONTRACT_VERSION),
      statement: PolicyNormativeStatementV1Schema,
      activationCondition: PolicyActivationConditionV1Schema,
      enforcementIntents: PolicyEnforcementIntentsV1Schema,
    })
    .strict()
    .superRefine((preimage, context) => {
      const ruleLike = {
        ruleId: "preimage.validation" as PolicyLogicalIdV1,
        relations: [] as const,
        activationCondition: preimage.activationCondition,
        enforcementIntents: preimage.enforcementIntents,
        ...preimage.statement,
      };
      const result = PolicyRuleV1Schema.safeParse(ruleLike);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const path =
            issue.path[0] === "proposition" || issue.path[0] === "orderedAlternatives"
              ? ["statement", ...issue.path]
              : issue.path;
          context.addIssue({ code: "custom", path, message: issue.message });
        }
      }
    })
);
export type PolicyRuleSemanticDigestPreimageV1 = z.infer<
  typeof PolicyRuleSemanticDigestPreimageV1Schema
>;

export const PolicyDeclarationDigestRuleV1Schema = withPolicyJsonInput(
  z
    .object({
      ruleId: PolicyLogicalIdV1Schema,
      semanticDigest: PolicySemanticDigestV1Schema,
      relations: PolicyRuleRelationsV1Schema,
    })
    .strict()
);
export type PolicyDeclarationDigestRuleV1 = z.infer<typeof PolicyDeclarationDigestRuleV1Schema>;

const policyDeclarationDigestRulesV1Schema = z
  .array(PolicyDeclarationDigestRuleV1Schema)
  .min(1)
  .superRefine((rules, context) => {
    if (hasDuplicateBy(rules, (rule) => rule.ruleId)) {
      context.addIssue({
        code: "custom",
        message: "declaration digest rules must not contain duplicate ruleId values",
      });
    }
  })
  .transform(
    (rules): readonly [PolicyDeclarationDigestRuleV1, ...PolicyDeclarationDigestRuleV1[]] =>
      [...rules].sort((left, right) => compareUtf16CodeUnits(left.ruleId, right.ruleId)) as [
        PolicyDeclarationDigestRuleV1,
        ...PolicyDeclarationDigestRuleV1[],
      ]
  );

export const PolicyDeclarationDigestPreimageV1Schema = withPolicyJsonInput(
  z
    .object({
      canonicalizationVersion: z.literal(POLICY_CANONICALIZATION_VERSION_V1),
      schemaVersion: z.literal(NORMATIVE_POLICY_CONTRACT_VERSION),
      declarationId: PolicyLogicalIdV1Schema,
      revision: PositiveSafeIntegerV1Schema,
      issuer: PolicyDeclarationIssuerV1Schema,
      scope: PolicyScopeV1Schema,
      rules: policyDeclarationDigestRulesV1Schema,
      authorizesExecution: z.literal(false),
    })
    .strict()
);
export type PolicyDeclarationDigestPreimageV1 = z.infer<
  typeof PolicyDeclarationDigestPreimageV1Schema
>;

export const PolicyDeclarationAuthorityDecisionDigestPreimageV1Schema = withPolicyJsonInput(
  z
    .object({
      canonicalizationVersion: z.literal(POLICY_CANONICALIZATION_VERSION_V1),
      payload: PolicyDeclarationAuthorityDecisionPayloadV1Schema,
    })
    .strict()
);
export type PolicyDeclarationAuthorityDecisionDigestPreimageV1 = z.infer<
  typeof PolicyDeclarationAuthorityDecisionDigestPreimageV1Schema
>;

const MatchingPolicyDeclarationSourceEvidenceBindingResultV1Schema = z
  .object({
    matches: z.literal(true),
    sourceContentDigest: PolicySourceContentDigestV1Schema,
    declarationDigest: PolicyDeclarationDigestV1Schema,
    authorizesExecution: z.literal(false),
  })
  .strict();
const MismatchingPolicyDeclarationSourceEvidenceBindingResultV1Schema = z
  .object({
    matches: z.literal(false),
    reason: z.enum(["source_content_digest_mismatch", "declaration_digest_mismatch"]),
    authorizesExecution: z.literal(false),
  })
  .strict();

export const PolicyDeclarationSourceEvidenceBindingResultV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("matches", [
    MatchingPolicyDeclarationSourceEvidenceBindingResultV1Schema,
    MismatchingPolicyDeclarationSourceEvidenceBindingResultV1Schema,
  ])
);
export type PolicyDeclarationSourceEvidenceBindingResultV1 = z.infer<
  typeof PolicyDeclarationSourceEvidenceBindingResultV1Schema
>;

const MatchingPolicyDeclarationAuthorityDecisionBindingResultV1Schema = z
  .object({
    bindingMatches: z.literal(true),
    decisionStatus: z.enum(["authorized", "unauthorized", "unknown"]),
    declarationDigest: PolicyDeclarationDigestV1Schema,
    declarationAuthorityDecisionDigest: PolicyDeclarationAuthorityDecisionDigestV1Schema,
    authorizesExecution: z.literal(false),
  })
  .strict();
const MismatchingPolicyDeclarationAuthorityDecisionBindingResultV1Schema = z
  .object({
    bindingMatches: z.literal(false),
    reason: z.enum([
      "decision_digest_mismatch",
      "declaration_digest_mismatch",
      "issuer_principal_mismatch",
      "authority_domain_mismatch",
      "required_authoring_capability_mismatch",
      "granted_authoring_capability_missing",
      "relation_authority_capability_missing",
    ]),
    authorizesExecution: z.literal(false),
  })
  .strict();

export const PolicyDeclarationAuthorityDecisionBindingResultV1Schema = withPolicyJsonInput(
  z.discriminatedUnion("bindingMatches", [
    MatchingPolicyDeclarationAuthorityDecisionBindingResultV1Schema,
    MismatchingPolicyDeclarationAuthorityDecisionBindingResultV1Schema,
  ])
);
export type PolicyDeclarationAuthorityDecisionBindingResultV1 = z.infer<
  typeof PolicyDeclarationAuthorityDecisionBindingResultV1Schema
>;
