import { createHash } from "node:crypto";

import { canonicalizeJson } from "./canonical-json.js";
import {
  NORMATIVE_POLICY_CONTRACT_VERSION,
  POLICY_CANONICALIZATION_VERSION_V1,
  PolicyDeclarationAuthorityDecisionV1Schema,
  PolicyDeclarationSourceEvidenceV1Schema,
  PolicyDeclarationV1Schema,
  type PolicyDeclarationAuthorityDecisionBindingResultV1,
  type PolicyDeclarationAuthorityDecisionDigestPreimageV1,
  type PolicyDeclarationAuthorityDecisionDigestV1,
  type PolicyDeclarationAuthorityDecisionPayloadV1,
  type PolicyDeclarationAuthorityDecisionV1,
  type PolicyDeclarationDigestPreimageV1,
  type PolicyDeclarationDigestRuleV1,
  type PolicyDeclarationDigestV1,
  type PolicyDeclarationSourceEvidenceBindingResultV1,
  type PolicyDeclarationSourceEvidenceV1,
  type PolicyDeclarationV1,
  type PolicyNormativeStatementV1,
  type PolicyRuleSemanticDigestPreimageV1,
  type PolicyRuleV1,
  type PolicySemanticDigestV1,
  type PolicySourceContentDigestV1,
} from "./types.js";

const POLICY_SOURCE_DIGEST_DOMAIN_V1 = "lex:normative-policy:source:v1";
const POLICY_SEMANTIC_DIGEST_DOMAIN_V1 = "lex:normative-policy:semantic:v1";
const POLICY_DECLARATION_DIGEST_DOMAIN_V1 = "lex:normative-policy:declaration:v1";
const POLICY_DECLARATION_AUTHORITY_DECISION_DIGEST_DOMAIN_V1 =
  "lex:normative-policy:declaration-authority-decision:v1";

function digestDomainBytes(domain: string, bytes: Uint8Array): string {
  return `sha256:${createHash("sha256")
    .update(domain, "ascii")
    .update(Buffer.from([0]))
    .update(bytes)
    .digest("hex")}`;
}

function digestCanonicalValue(domain: string, value: unknown): string {
  return digestDomainBytes(domain, Buffer.from(canonicalizeJson(value), "utf8"));
}

function statementFromRule(rule: PolicyRuleV1): PolicyNormativeStatementV1 {
  if (rule.kind === "prefer") {
    return { kind: rule.kind, orderedAlternatives: rule.orderedAlternatives };
  }
  return { kind: rule.kind, proposition: rule.proposition };
}

/**
 * Build the exact closed semantic preimage for an already normalized rule.
 * Callers handling untrusted values must parse with PolicyRuleV1Schema first.
 */
export function createPolicyRuleSemanticDigestPreimageV1(
  rule: PolicyRuleV1
): PolicyRuleSemanticDigestPreimageV1 {
  return {
    canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
    schemaVersion: NORMATIVE_POLICY_CONTRACT_VERSION,
    statement: statementFromRule(rule),
    activationCondition: rule.activationCondition,
    enforcementIntents: rule.enforcementIntents,
  };
}

/** Compute a rule semantic digest from an already normalized rule. */
export function computePolicySemanticDigestV1(rule: PolicyRuleV1): PolicySemanticDigestV1 {
  return digestCanonicalValue(
    POLICY_SEMANTIC_DIGEST_DOMAIN_V1,
    createPolicyRuleSemanticDigestPreimageV1(rule)
  ) as PolicySemanticDigestV1;
}

/**
 * Build the exact closed declaration preimage for an already normalized
 * declaration. Source evidence is deliberately not a member.
 */
export function createPolicyDeclarationDigestPreimageV1(
  declaration: PolicyDeclarationV1
): PolicyDeclarationDigestPreimageV1 {
  const rules = declaration.rules.map((rule): PolicyDeclarationDigestRuleV1 => ({
    ruleId: rule.ruleId,
    semanticDigest: computePolicySemanticDigestV1(rule),
    relations: rule.relations,
  })) as [PolicyDeclarationDigestRuleV1, ...PolicyDeclarationDigestRuleV1[]];

  return {
    canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
    schemaVersion: NORMATIVE_POLICY_CONTRACT_VERSION,
    declarationId: declaration.declarationId,
    revision: declaration.revision,
    issuer: declaration.issuer,
    scope: declaration.scope,
    rules,
    authorizesExecution: false,
  };
}

/** Compute a declaration digest from an already normalized declaration. */
export function computePolicyDeclarationDigestV1(
  declaration: PolicyDeclarationV1
): PolicyDeclarationDigestV1 {
  return digestCanonicalValue(
    POLICY_DECLARATION_DIGEST_DOMAIN_V1,
    createPolicyDeclarationDigestPreimageV1(declaration)
  ) as PolicyDeclarationDigestV1;
}

/** Build the exact closed digest preimage for an already normalized decision payload. */
export function createPolicyDeclarationAuthorityDecisionDigestPreimageV1(
  payload: PolicyDeclarationAuthorityDecisionPayloadV1
): PolicyDeclarationAuthorityDecisionDigestPreimageV1 {
  return {
    canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
    payload,
  };
}

/** Compute a declaration-authority-decision digest from an already normalized payload. */
export function computePolicyDeclarationAuthorityDecisionDigestV1(
  payload: PolicyDeclarationAuthorityDecisionPayloadV1
): PolicyDeclarationAuthorityDecisionDigestV1 {
  return digestCanonicalValue(
    POLICY_DECLARATION_AUTHORITY_DECISION_DIGEST_DOMAIN_V1,
    createPolicyDeclarationAuthorityDecisionDigestPreimageV1(payload)
  ) as PolicyDeclarationAuthorityDecisionDigestV1;
}

/** Hash exact source bytes without text decoding or JSON normalization. */
export function computePolicySourceContentDigestV1(
  rawSource: Uint8Array
): PolicySourceContentDigestV1 {
  if (!(rawSource instanceof Uint8Array)) {
    throw new TypeError("rawSource must be a Uint8Array");
  }
  return digestDomainBytes(
    POLICY_SOURCE_DIGEST_DOMAIN_V1,
    rawSource
  ) as PolicySourceContentDigestV1;
}

/**
 * Check internal source-evidence binding. This validates structure and
 * integrity only; it does not authenticate the source locator or authorize an
 * effect.
 */
export function checkPolicyDeclarationSourceEvidenceBindingV1(
  rawSource: Uint8Array,
  declarationInput: PolicyDeclarationV1,
  evidenceInput: PolicyDeclarationSourceEvidenceV1
): PolicyDeclarationSourceEvidenceBindingResultV1 {
  const declaration = PolicyDeclarationV1Schema.parse(declarationInput);
  const evidence = PolicyDeclarationSourceEvidenceV1Schema.parse(evidenceInput);
  const sourceContentDigest = computePolicySourceContentDigestV1(rawSource);

  if (sourceContentDigest !== evidence.sourceContentDigest) {
    return {
      matches: false,
      reason: "source_content_digest_mismatch",
      authorizesExecution: false,
    };
  }

  const declarationDigest = computePolicyDeclarationDigestV1(declaration);
  if (declarationDigest !== evidence.declarationDigest) {
    return {
      matches: false,
      reason: "declaration_digest_mismatch",
      authorizesExecution: false,
    };
  }

  return {
    matches: true,
    sourceContentDigest,
    declarationDigest,
    authorizesExecution: false,
  };
}

/**
 * Check internal declaration/decision binding with the contract's fixed
 * failure precedence. A successful binding reports the decision's status so
 * callers cannot treat binding alone as authorization. It is not proof that
 * the decision is trusted or current.
 */
export function checkPolicyDeclarationAuthorityDecisionBindingV1(
  declarationInput: PolicyDeclarationV1,
  decisionInput: PolicyDeclarationAuthorityDecisionV1
): PolicyDeclarationAuthorityDecisionBindingResultV1 {
  const declaration = PolicyDeclarationV1Schema.parse(declarationInput);
  const decision = PolicyDeclarationAuthorityDecisionV1Schema.parse(decisionInput);
  const declarationAuthorityDecisionDigest = computePolicyDeclarationAuthorityDecisionDigestV1(
    decision.payload
  );

  if (declarationAuthorityDecisionDigest !== decision.declarationAuthorityDecisionDigest) {
    return {
      bindingMatches: false,
      reason: "decision_digest_mismatch",
      authorizesExecution: false,
    };
  }

  const declarationDigest = computePolicyDeclarationDigestV1(declaration);
  if (declarationDigest !== decision.payload.declarationDigest) {
    return {
      bindingMatches: false,
      reason: "declaration_digest_mismatch",
      authorizesExecution: false,
    };
  }
  if (declaration.issuer.principalId !== decision.payload.issuerPrincipalId) {
    return {
      bindingMatches: false,
      reason: "issuer_principal_mismatch",
      authorizesExecution: false,
    };
  }
  if (declaration.issuer.authorityDomainId !== decision.payload.authorityDomainId) {
    return {
      bindingMatches: false,
      reason: "authority_domain_mismatch",
      authorizesExecution: false,
    };
  }
  if (
    declaration.issuer.requiredAuthoringCapabilityId !==
    decision.payload.requiredAuthoringCapabilityId
  ) {
    return {
      bindingMatches: false,
      reason: "required_authoring_capability_mismatch",
      authorizesExecution: false,
    };
  }

  if (decision.payload.status === "authorized") {
    const grantedCapabilities = new Set(decision.payload.grantedAuthoringCapabilities);
    if (!grantedCapabilities.has(declaration.issuer.requiredAuthoringCapabilityId)) {
      return {
        bindingMatches: false,
        reason: "granted_authoring_capability_missing",
        authorizesExecution: false,
      };
    }

    const relationCapabilityMissing = declaration.rules.some((rule) =>
      rule.relations.some(
        (relation) =>
          (relation.type === "refines" || relation.type === "overrides") &&
          !grantedCapabilities.has(relation.requiredAuthorityCapabilityId)
      )
    );
    if (relationCapabilityMissing) {
      return {
        bindingMatches: false,
        reason: "relation_authority_capability_missing",
        authorizesExecution: false,
      };
    }
  }

  return {
    bindingMatches: true,
    decisionStatus: decision.payload.status,
    declarationDigest,
    declarationAuthorityDecisionDigest,
    authorizesExecution: false,
  };
}
