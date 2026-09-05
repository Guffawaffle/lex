import { canonicalizeJson } from "./canonical-json.js";
import {
  checkPolicyDeclarationAuthorityDecisionBindingV1,
  computePolicySemanticDigestV1,
} from "./canonical.js";
import { parsePolicyDeclarationJsonV1, POLICY_COMPILER_VERSION_V1 } from "./compiler.js";
import {
  POLICY_CANONICALIZATION_VERSION_V1,
  PolicyLogicalIdV1Schema,
  type PolicyPropositionV1,
  type PolicyRuleTargetV1,
  type PolicyScopeV1,
} from "./types.js";
import {
  computePolicyExceptionOverlayDigestV1,
  computePolicyResolutionRequestDigestV1,
  computePolicySnapshotDigestV1,
  EffectivePolicySnapshotV1Schema,
  freezeResolutionValue,
  POLICY_RESOLVER_VERSION_V1,
  PolicyResolutionRequestV1Schema,
  PolicyResolverVerificationV1Schema,
  PolicySnapshotPreimageV1Schema,
  type EffectivePolicySnapshotV1,
  type PolicyConflictV1,
  type PolicyRelationResolutionV1,
  type PolicyResolutionRequestV1,
  type PolicyResolverDiagnosticV1,
  type PolicyResolverVerificationV1,
  type PolicyResolverVerifierV1,
  type PolicyRuleResolutionV1,
  type PolicyVerificationEvidenceV1,
} from "./resolver-contract.js";

type Truth = "yes" | "no" | "unknown";
const key = canonicalizeJson;
const equal = (left: unknown, right: unknown) => key(left) === key(right);
const mandatory = (rule: PolicyRuleResolutionV1) =>
  rule.rule.kind === "require" || rule.rule.kind === "forbid";

function scopeContains(parent: PolicyScopeV1, child: PolicyScopeV1): boolean {
  if (parent.type === "global" || equal(parent, child)) return true;
  if (child.type !== "workspace_repository") return false;
  return (
    (parent.type === "workspace" && parent.workspaceId === child.workspaceId) ||
    (parent.type === "repository" && parent.repositoryId === child.repositoryId)
  );
}

function current(evidence: readonly PolicyVerificationEvidenceV1[], asOf: string): boolean {
  return (
    evidence.length > 0 &&
    evidence.every(
      (item) =>
        item.observedAt <= asOf &&
        (item.validity.type === "immutable" ||
          (item.validity.type === "until" && item.validity.validUntil > asOf) ||
          (item.validity.type === "revalidate_at_use" && item.validity.revalidatedAt === asOf))
    )
  );
}

function applicability(
  scope: PolicyScopeV1,
  verification: PolicyResolverVerificationV1 | null,
  asOf: string
): PolicyRuleResolutionV1["applicability"] {
  if (scope.type === "global") return "applicable";
  const fields =
    scope.type === "workspace_repository"
      ? ["workspaceId", "repositoryId"]
      : [
          scope.type === "tenant"
            ? "tenantId"
            : scope.type === "workspace"
              ? "workspaceId"
              : "repositoryId",
        ];
  let differs = false;
  for (const field of fields) {
    const facts = verification?.facts.filter((fact) => fact.key === field) ?? [];
    if (
      !facts.length ||
      facts.some(
        (fact) => fact.status !== "verified" || fact.value === null || !current(fact.evidence, asOf)
      ) ||
      new Set(facts.map((fact) => fact.value)).size !== 1
    )
      return "unknown";
    if (facts[0].value !== scope[field as keyof typeof scope]) differs = true;
  }
  return differs ? "not_applicable" : "applicable";
}

function membership(
  capabilityId: string,
  routeClassId: string,
  verification: PolicyResolverVerificationV1 | null,
  asOf: string
): Truth {
  const result = verification?.routeClassifications.find(
    (item) => item.capabilityId === capabilityId && item.routeClassId === routeClassId
  );
  if (!result || !current(result.evidence, asOf)) return "unknown";
  return result.status === "member" ? "yes" : result.status === "not_member" ? "no" : "unknown";
}

// Does the forbidden proposition cover the affirmative proposition? No route
// hierarchy or class disjointness is inferred from names or declaration order.
function covers(
  forbidden: PolicyPropositionV1,
  affirmative: PolicyPropositionV1,
  verification: PolicyResolverVerificationV1 | null,
  asOf: string
): Truth {
  if (forbidden.operationId !== affirmative.operationId) return "no";
  if (forbidden.type === "operation") return "yes";
  if (affirmative.type === "operation") return "no";
  if (equal(forbidden.route, affirmative.route)) return "yes";
  if (forbidden.route.type === "route_class" && affirmative.route.type === "capability")
    return membership(
      affirmative.route.capabilityId,
      forbidden.route.routeClassId,
      verification,
      asOf
    );
  return "no";
}

function opposition(
  left: PolicyRuleResolutionV1,
  right: PolicyRuleResolutionV1,
  verification: PolicyResolverVerificationV1 | null,
  asOf: string,
  allowPermit = false
): Truth {
  const a = left.rule,
    b = right.rule;
  if (
    a.kind === "require" &&
    b.kind === "require" &&
    a.proposition.operationId === b.proposition.operationId &&
    a.proposition.type === "operation_route" &&
    b.proposition.type === "operation_route" &&
    a.proposition.route.type === "capability" &&
    b.proposition.route.type === "capability"
  )
    return a.proposition.route.capabilityId === b.proposition.route.capabilityId ? "no" : "yes";
  if (a.kind === "forbid" && (b.kind === "require" || (allowPermit && b.kind === "permit")))
    return covers(a.proposition, b.proposition, verification, asOf);
  if (b.kind === "forbid" && (a.kind === "require" || (allowPermit && a.kind === "permit")))
    return covers(b.proposition, a.proposition, verification, asOf);
  return "no";
}

function propositionTruth(
  proposition: PolicyPropositionV1,
  request: PolicyResolutionRequestV1,
  verification: PolicyResolverVerificationV1 | null
): Truth {
  if (request.proposal.operationPresence === "absent") return "no";
  if (request.proposal.operationId === null) return "unknown";
  if (request.proposal.operationId !== proposition.operationId) return "no";
  if (proposition.type === "operation") return "yes";
  if (request.proposal.capabilityId === null) return "unknown";
  return proposition.route.type === "capability"
    ? request.proposal.capabilityId === proposition.route.capabilityId
      ? "yes"
      : "no"
    : membership(
        request.proposal.capabilityId,
        proposition.route.routeClassId,
        verification,
        request.asOf
      );
}

function targetFor(
  entry: PolicyResolutionRequestV1["compiled"]["declarations"][number],
  rule: PolicyResolutionRequestV1["compiled"]["declarations"][number]["declaration"]["rules"][number]
): PolicyRuleTargetV1 {
  return {
    declarationId: entry.declaration.declarationId,
    declarationRevision: entry.declaration.revision,
    ruleId: rule.ruleId,
    expectedSemanticDigest: computePolicySemanticDigestV1(rule),
  };
}

function declarationTrusted(
  entry: PolicyResolutionRequestV1["compiled"]["declarations"][number],
  request: PolicyResolutionRequestV1,
  verification: PolicyResolverVerificationV1 | null
): boolean {
  const proof = verification?.declarations.find(
    (item) => item.declarationDigest === entry.declarationDigest
  );
  const raw = request.rawSources.find((item) => item.declarationDigest === entry.declarationDigest);
  if (
    !proof ||
    !raw ||
    !entry.sourceEvidence ||
    !equal(proof.sourceEvidence, entry.sourceEvidence) ||
    !current(proof.evidence, request.asOf)
  )
    return false;
  const parsed = parsePolicyDeclarationJsonV1(
    Buffer.from(raw.base64, "base64"),
    entry.sourceEvidence.source
  );
  if (
    !parsed.ok ||
    !equal(parsed.input.declaration, entry.declaration) ||
    !equal(parsed.input.sourceEvidence, entry.sourceEvidence)
  )
    return false;
  const binding = checkPolicyDeclarationAuthorityDecisionBindingV1(
    entry.declaration,
    proof.decision
  );
  const payload = proof.decision.payload;
  const expectedRelations = entry.declaration.rules.flatMap((rule) =>
    rule.relations
      .filter((relation) => relation.type !== "depends_on")
      .map((relation) => ({
        source: targetFor(entry, rule),
        ...relation,
      }))
  );
  // Relation capability membership is not sufficient to authenticate a
  // declaration, even when a target happens to be dormant or out of scope.
  if (
    expectedRelations.length !== proof.approvedRelations.length ||
    expectedRelations.some(
      (relation) => !proof.approvedRelations.some((approved) => equal(approved, relation))
    )
  )
    return false;
  return (
    binding.bindingMatches &&
    payload.status === "authorized" &&
    payload.evaluatedAt <= request.asOf &&
    request.asOf < payload.validUntil &&
    proof.sourceAttestationRef === payload.sourceAttestationRef &&
    proof.sourceAttestationDigest === payload.sourceAttestationDigest
  );
}

function resolveVerified(
  request: PolicyResolutionRequestV1,
  requestDigest: string,
  verifierVersion: string,
  verification: PolicyResolverVerificationV1 | null,
  initial: PolicyResolverDiagnosticV1["code"] | null
): EffectivePolicySnapshotV1 {
  const diagnostics: PolicyResolverDiagnosticV1[] = [];
  const add = (
    code: PolicyResolverDiagnosticV1["code"],
    rule: PolicyRuleTargetV1 | null = null,
    related: PolicyRuleTargetV1 | null = null,
    overlayId: PolicyResolverDiagnosticV1["overlayId"] = null
  ) => {
    diagnostics.push({ code, rule, related, overlayId });
  };
  if (initial) add(initial);
  const rules: PolicyRuleResolutionV1[] = [];
  const declarations = new Map<
    string,
    PolicyResolutionRequestV1["compiled"]["declarations"][number]
  >();
  for (const entry of request.compiled.declarations) {
    const trusted = declarationTrusted(entry, request, verification);
    const scope = applicability(entry.declaration.scope, verification, request.asOf);
    for (const rule of entry.declaration.rules) {
      const target = targetFor(entry, rule);
      declarations.set(key(target), entry);
      const activation =
        rule.activationCondition.type === "always"
          ? "active"
          : request.proposal.operationPresence === "absent"
            ? "dormant"
            : request.proposal.operationId === null
              ? "unknown"
              : request.proposal.operationId === rule.activationCondition.operationId
                ? "active"
                : "dormant";
      const disposition = !trusted
        ? "untrusted"
        : scope === "unknown" || activation === "unknown"
          ? "unknown"
          : scope === "not_applicable" || activation === "dormant"
            ? "inactive"
            : "effective";
      rules.push({
        target,
        rule,
        declarationTrusted: trusted,
        applicability: scope,
        activation,
        satisfaction: "not_evaluated",
        disposition,
      });
      // Explicit declarations cannot disappear into a successful partial policy set.
      if (!trusted) add("declaration_untrusted", target);
    }
  }
  const byTarget = new Map(rules.map((rule) => [key(rule.target), rule]));
  const relations: PolicyRelationResolutionV1[] = [];

  // Exceptions act before ordinary edges so excepted sources cannot override.
  for (const overlay of request.overlays) {
    const target = byTarget.get(key(overlay.target));
    const parent = declarations.get(key(overlay.target));
    const proof = verification?.overlays.find(
      (item) => item.overlayDigest === computePolicyExceptionOverlayDigestV1(overlay)
    );
    const valid =
      target &&
      parent &&
      (target.disposition === "effective" || target.disposition === "suppressed") &&
      proof &&
      overlay.issuedAt <= request.asOf &&
      request.asOf < overlay.expiresAt &&
      scopeContains(parent.declaration.scope, overlay.scope) &&
      applicability(overlay.scope, verification, request.asOf) === "applicable" &&
      proof.status === "authorized" &&
      proof.revocation === "not_revoked" &&
      proof.evaluatedAt <= request.asOf &&
      request.asOf < proof.validUntil &&
      equal(proof.issuer, overlay.issuer) &&
      equal(proof.target, overlay.target) &&
      equal(proof.scope, overlay.scope) &&
      proof.requiredOverrideCapabilityId === overlay.requiredOverrideCapabilityId &&
      proof.revocationEvidence.ref === overlay.revocationEvidenceRef &&
      current([proof.revocationEvidence], request.asOf) &&
      current(proof.evidence, request.asOf);
    if (valid) target.disposition = "suppressed";
    else add("overlay_rejected", overlay.target, null, overlay.overlayId);
  }

  // The compiler has already rejected every mixed relation cycle. Process sources
  // before targets; this is ordering of explicit edges, not transitive precedence.
  const incoming = new Map(rules.map((rule) => [key(rule.target), 0]));
  for (const source of rules)
    for (const relation of source.rule.relations)
      incoming.set(key(relation.target), incoming.get(key(relation.target))! + 1);
  const ready = rules.filter((rule) => incoming.get(key(rule.target)) === 0);
  const ordered: PolicyRuleResolutionV1[] = [];
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const source = ready[cursor];
    ordered.push(source);
    for (const relation of source.rule.relations) {
      const target = byTarget.get(key(relation.target))!;
      const remaining = incoming.get(key(target.target))! - 1;
      incoming.set(key(target.target), remaining);
      if (remaining === 0) ready.push(target);
      if (relation.type === "depends_on") continue;
      const entry = declarations.get(key(source.target))!;
      const proof = verification?.declarations.find(
        (item) => item.declarationDigest === entry.declarationDigest
      );
      const approved = proof?.approvedRelations.some((item) =>
        equal(item, {
          source: source.target,
          target: relation.target,
          type: relation.type,
          requiredAuthorityCapabilityId: relation.requiredAuthorityCapabilityId,
        })
      );
      let outcome: PolicyRelationResolutionV1["outcome"];
      if (!approved) {
        outcome = "unauthorized";
        add("relation_unauthorized", source.target, target.target);
      } else if (source.disposition !== "effective" || target.disposition !== "effective")
        outcome = "inactive";
      else if (relation.type === "refines") outcome = "additive";
      else if (
        source.rule.kind === "permit" &&
        propositionTruth(source.rule.proposition, request, verification) !== "yes"
      ) {
        // A route-specific allowance cannot remove a broader prohibition for a
        // different (or unknown) selected route merely by naming an override.
        outcome = "inactive";
      } else {
        const conflict = opposition(source, target, verification, request.asOf, true);
        outcome =
          conflict === "yes" ? "suppressed" : conflict === "no" ? "non_conflicting" : "unknown";
        if (outcome === "suppressed") target.disposition = "suppressed";
        if (outcome === "unknown") add("conflict_unknown", source.target, target.target);
      }
      relations.push({
        source: source.target,
        target: target.target,
        type: relation.type,
        outcome,
      });
    }
  }

  // Full closure, including advisory intermediate nodes, before any consumer can
  // treat the mandatory source as admitted. No material is relevance-pruned.
  const dependencyReady = new Map<string, boolean>();
  for (const source of [...ordered].reverse()) {
    let satisfied = source.disposition === "effective";
    for (const relation of source.rule.relations)
      if (relation.type === "depends_on") {
        const good = dependencyReady.get(key(relation.target)) === true;
        if (!good) satisfied = false;
        relations.push({
          source: source.target,
          target: relation.target,
          type: "depends_on",
          outcome: good ? "satisfied" : "unsatisfied",
        });
        if (!good && mandatory(source) && source.disposition === "effective")
          add("dependency_unsatisfied", source.target, relation.target);
      }
    dependencyReady.set(key(source.target), satisfied);
  }

  const conflicts: PolicyConflictV1[] = [];
  for (let i = 0; i < rules.length; i++) {
    const left = rules[i];
    if (!mandatory(left) || left.disposition !== "effective") continue;
    for (let j = i + 1; j < rules.length; j++) {
      const right = rules[j];
      if (!mandatory(right) || right.disposition !== "effective") continue;
      const result = opposition(left, right, verification, request.asOf);
      if (result !== "no") {
        conflicts.push({
          left: left.target,
          right: right.target,
          status: result === "yes" ? "conflict" : "unknown",
        });
        add(result === "yes" ? "conflict" : "conflict_unknown", left.target, right.target);
      }
    }
  }

  for (const result of rules) {
    if (result.disposition === "unknown" && mandatory(result))
      add("mandatory_unknown", result.target);
    if (result.disposition !== "effective" || result.rule.kind === "prefer") continue;
    const truth = propositionTruth(result.rule.proposition, request, verification);
    result.satisfaction =
      truth === "unknown"
        ? "unknown"
        : (result.rule.kind === "forbid" ? truth === "no" : truth === "yes")
          ? "satisfied"
          : "unsatisfied";
    if (mandatory(result) && result.satisfaction !== "satisfied")
      add(
        result.satisfaction === "unknown" ? "mandatory_unknown" : "mandatory_unsatisfied",
        result.target
      );
  }

  if (request.proposal.capabilityId !== null || request.proposal.implementationDigest !== null) {
    const qualified = verification?.selectedImplementation;
    if (
      !qualified ||
      qualified.status !== "qualified" ||
      qualified.capabilityId !== request.proposal.capabilityId ||
      qualified.implementationDigest !== request.proposal.implementationDigest ||
      !current(qualified.evidence, request.asOf)
    )
      add("implementation_unqualified");
  }
  const unique = <T>(items: T[]) => [...new Map(items.map((item) => [key(item), item])).values()];
  const payload = PolicySnapshotPreimageV1Schema.parse({
    schemaVersion: 1,
    canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
    compilerVersion: POLICY_COMPILER_VERSION_V1,
    resolverVersion: POLICY_RESOLVER_VERSION_V1,
    asOf: request.asOf,
    requestDigest,
    request,
    verifierVersion,
    verification,
    rules,
    relations,
    conflicts,
    diagnostics: unique(diagnostics),
    effectiveRules: rules
      .filter((rule) => rule.disposition === "effective")
      .map((rule) => rule.target),
    affirmativeAllowances: rules
      .filter(
        (rule) =>
          rule.disposition === "effective" &&
          rule.rule.kind === "permit" &&
          rule.satisfaction === "satisfied"
      )
      .map((rule) => rule.target),
    policyAdmission: diagnostics.length ? "blocked" : "satisfied",
    authorizesExecution: false,
  });
  return EffectivePolicySnapshotV1Schema.parse({
    payload,
    snapshotDigest: computePolicySnapshotDigestV1(payload),
  });
}

/** Construct in protected host code. Requests cannot install or replace this verifier.
 * Invalid request data throws; verifier failures return a non-authorizing blocked snapshot. */
export function createPolicyResolverV1(verifier: PolicyResolverVerifierV1): {
  resolve(input: unknown): Promise<EffectivePolicySnapshotV1>;
} {
  const version = PolicyLogicalIdV1Schema.parse(verifier.version);
  if (typeof verifier.verify !== "function")
    throw new TypeError("A protected verifier is required");
  const verify = verifier.verify.bind(verifier);
  return Object.freeze({
    async resolve(input: unknown): Promise<EffectivePolicySnapshotV1> {
      const request = PolicyResolutionRequestV1Schema.parse(input);
      const requestDigest = computePolicyResolutionRequestDigestV1(request);
      let verification: PolicyResolverVerificationV1 | null = null;
      let failure: PolicyResolverDiagnosticV1["code"] | null = null;
      try {
        const parsed = PolicyResolverVerificationV1Schema.safeParse(
          await verify(freezeResolutionValue({ request, requestDigest }))
        );
        if (!parsed.success) failure = "invalid_verification";
        else if (
          parsed.data.requestDigest !== requestDigest ||
          parsed.data.verifierVersion !== version
        )
          failure = "verification_binding_mismatch";
        else verification = parsed.data;
      } catch {
        failure = "verifier_failed";
      }
      return resolveVerified(request, requestDigest, version, verification, failure);
    },
  });
}
