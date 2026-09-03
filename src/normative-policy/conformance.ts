import type {
  CapabilityId,
  PrincipalId,
  RepositoryId,
  WorkspaceId,
} from "../shared/runtime-scope/index.js";
import type {
  PolicyDeclarationIssuerV1,
  PolicyDeclarationV1,
  PolicyLogicalIdV1,
  PolicyRuleV1,
} from "./types.js";

export const NORMATIVE_POLICY_CONFORMANCE_VERSION = 1 as const;

export type NormativePolicyConformanceFixtureId =
  | "forbid-manual-route"
  | "permit-cycle-policy-only"
  | "prefer-managed-tooling"
  | "recommend-managed-tooling"
  | "require-public-managed-route";

export type NormativePolicyConformancePolicyEffectV1 =
  | "affirmative_allowance_only"
  | "mandatory_prohibition"
  | "mandatory_requirement"
  | "ordered_advisory_preference"
  | "advisory_recommendation";

/**
 * Expected semantic boundaries for a data-only policy fixture. These fields
 * describe policy-layer behavior; they are not resolver or effect decisions.
 */
export interface NormativePolicyConformanceExpectationV1 {
  readonly policyEffect: NormativePolicyConformancePolicyEffectV1;
  readonly authorizesExecution: false;
  readonly createsEffectGrant: false;
  readonly requestsOperation: false;
  readonly bindsLiveCapability: false;
  readonly implicitlyOverridesForbid: false;
  readonly enablesAdmissionWhenApplicabilityUnknown: false;
}

/**
 * Static conformance input. Implementations validate and adapt the declaration
 * in their own test harness; this module performs no resolution or projection.
 */
export interface NormativePolicyConformanceFixtureV1 {
  readonly schemaVersion: typeof NORMATIVE_POLICY_CONFORMANCE_VERSION;
  readonly id: NormativePolicyConformanceFixtureId;
  readonly requirement: string;
  readonly focusRuleId: PolicyLogicalIdV1;
  readonly focusModality: PolicyRuleV1["kind"];
  readonly declaration: PolicyDeclarationV1;
  readonly expected: NormativePolicyConformanceExpectationV1;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}

const policyId = (value: string): PolicyLogicalIdV1 => value as PolicyLogicalIdV1;
const capabilityId = (value: string): CapabilityId => value as CapabilityId;

const fixturePrincipalId = "01900000-0000-7000-8000-000000000901" as PrincipalId;
const fixtureWorkspaceId = "01900000-0000-7000-8000-000000000902" as WorkspaceId;
const fixtureRepositoryId = "01900000-0000-7000-8000-000000000903" as RepositoryId;

const fixtureIssuer = {
  principalId: fixturePrincipalId,
  authorityDomainId: policyId("fixture.stfc.public.lifecycle"),
  requiredAuthoringCapabilityId: capabilityId("stfc.policy.author.lifecycle"),
} as const satisfies PolicyDeclarationIssuerV1;

const operationRequested = {
  type: "operation_requested",
  operationId: policyId("stfc.runtime.cycle"),
} as const;

/**
 * Production-shaped only. The issuer and scope identities are synthetic test
 * values, so this is not the canonical public-STFC policy declaration.
 */
export const STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1 = deepFreeze({
  schemaVersion: 1,
  declarationId: policyId("stfc.lifecycle.cycle.managed-route"),
  revision: 1,
  issuer: fixtureIssuer,
  scope: {
    type: "workspace_repository",
    workspaceId: fixtureWorkspaceId,
    repositoryId: fixtureRepositoryId,
  },
  rules: [
    {
      ruleId: policyId("stfc.lifecycle.cycle.forbid-manual-fallback"),
      kind: "forbid",
      proposition: {
        type: "operation_route",
        operationId: policyId("stfc.runtime.cycle"),
        route: {
          type: "route_class",
          routeClassId: policyId("stfc.lifecycle.route.manual"),
        },
      },
      activationCondition: operationRequested,
      relations: [],
      enforcementIntents: ["lifecycle_precondition", "capability_gate", "audit"],
    },
    {
      ruleId: policyId("stfc.lifecycle.cycle.forbid-private-fallback"),
      kind: "forbid",
      proposition: {
        type: "operation_route",
        operationId: policyId("stfc.runtime.cycle"),
        route: {
          type: "route_class",
          routeClassId: policyId("stfc.lifecycle.route.private"),
        },
      },
      activationCondition: operationRequested,
      relations: [],
      enforcementIntents: ["lifecycle_precondition", "capability_gate", "audit"],
    },
    {
      ruleId: policyId("stfc.lifecycle.cycle.require-public-managed-route"),
      kind: "require",
      proposition: {
        type: "operation_route",
        operationId: policyId("stfc.runtime.cycle"),
        route: {
          type: "capability",
          capabilityId: capabilityId("stfc.public.lifecycle.cycle.managed"),
        },
      },
      activationCondition: operationRequested,
      relations: [],
      enforcementIntents: ["lifecycle_precondition", "capability_gate", "audit"],
    },
  ],
  authorizesExecution: false,
} as const satisfies PolicyDeclarationV1);

/**
 * A synthetic policy-layer allowance used to demonstrate that `permit` is not
 * an operation request, an effect grant, or an implicit override.
 */
export const SYNTHETIC_PERMIT_CONFORMANCE_DECLARATION_V1 = deepFreeze({
  schemaVersion: 1,
  declarationId: policyId("fixture.stfc.lifecycle.cycle.permit"),
  revision: 1,
  issuer: fixtureIssuer,
  scope: { type: "global" },
  rules: [
    {
      ruleId: policyId("fixture.stfc.lifecycle.cycle.permit-operation"),
      kind: "permit",
      proposition: {
        type: "operation",
        operationId: policyId("stfc.runtime.cycle"),
      },
      activationCondition: operationRequested,
      relations: [],
      enforcementIntents: ["lifecycle_precondition", "capability_gate", "audit"],
    },
  ],
  authorizesExecution: false,
} as const satisfies PolicyDeclarationV1);

const recommendManagedToolingDeclaration = {
  schemaVersion: 1,
  declarationId: policyId("fixture.lifecycle.managed-tooling.recommend"),
  revision: 1,
  issuer: fixtureIssuer,
  scope: { type: "global" },
  rules: [
    {
      ruleId: policyId("fixture.lifecycle.managed-tooling.recommend-route"),
      kind: "recommend",
      proposition: {
        type: "operation_route",
        operationId: policyId("stfc.runtime.cycle"),
        route: {
          type: "route_class",
          routeClassId: policyId("lifecycle.route.managed"),
        },
      },
      activationCondition: operationRequested,
      relations: [],
      enforcementIntents: ["prompt_guidance", "audit"],
    },
  ],
  authorizesExecution: false,
} as const satisfies PolicyDeclarationV1;

const preferManagedToolingDeclaration = {
  schemaVersion: 1,
  declarationId: policyId("fixture.lifecycle.managed-tooling.prefer"),
  revision: 1,
  issuer: fixtureIssuer,
  scope: { type: "global" },
  rules: [
    {
      ruleId: policyId("fixture.lifecycle.managed-tooling.prefer-managed-route"),
      kind: "prefer",
      orderedAlternatives: [
        {
          type: "operation_route",
          operationId: policyId("stfc.runtime.cycle"),
          route: {
            type: "route_class",
            routeClassId: policyId("lifecycle.route.managed"),
          },
        },
        {
          type: "operation_route",
          operationId: policyId("stfc.runtime.cycle"),
          route: {
            type: "route_class",
            routeClassId: policyId("stfc.lifecycle.route.manual"),
          },
        },
      ],
      activationCondition: operationRequested,
      relations: [],
      enforcementIntents: ["prompt_guidance", "audit"],
    },
  ],
  authorizesExecution: false,
} as const satisfies PolicyDeclarationV1;

const nonAuthorizingExpectation = {
  authorizesExecution: false,
  createsEffectGrant: false,
  requestsOperation: false,
  bindsLiveCapability: false,
  implicitlyOverridesForbid: false,
  enablesAdmissionWhenApplicabilityUnknown: false,
} as const;

export const NORMATIVE_POLICY_CONFORMANCE_FIXTURES = deepFreeze([
  {
    schemaVersion: 1,
    id: "forbid-manual-route",
    requirement: "A requested cycle cannot fall back to a manual lifecycle route.",
    focusRuleId: policyId("stfc.lifecycle.cycle.forbid-manual-fallback"),
    focusModality: "forbid",
    declaration: STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1,
    expected: {
      ...nonAuthorizingExpectation,
      policyEffect: "mandatory_prohibition",
    },
  },
  {
    schemaVersion: 1,
    id: "permit-cycle-policy-only",
    requirement: "A permit is an affirmative policy allowance and never effect authority.",
    focusRuleId: policyId("fixture.stfc.lifecycle.cycle.permit-operation"),
    focusModality: "permit",
    declaration: SYNTHETIC_PERMIT_CONFORMANCE_DECLARATION_V1,
    expected: {
      ...nonAuthorizingExpectation,
      policyEffect: "affirmative_allowance_only",
    },
  },
  {
    schemaVersion: 1,
    id: "prefer-managed-tooling",
    requirement: "A preference orders allowed alternatives without creating a gate.",
    focusRuleId: policyId("fixture.lifecycle.managed-tooling.prefer-managed-route"),
    focusModality: "prefer",
    declaration: preferManagedToolingDeclaration,
    expected: {
      ...nonAuthorizingExpectation,
      policyEffect: "ordered_advisory_preference",
    },
  },
  {
    schemaVersion: 1,
    id: "recommend-managed-tooling",
    requirement: "A recommendation remains advisory and never becomes a lifecycle requirement.",
    focusRuleId: policyId("fixture.lifecycle.managed-tooling.recommend-route"),
    focusModality: "recommend",
    declaration: recommendManagedToolingDeclaration,
    expected: {
      ...nonAuthorizingExpectation,
      policyEffect: "advisory_recommendation",
    },
  },
  {
    schemaVersion: 1,
    id: "require-public-managed-route",
    requirement: "A requested cycle requires the qualified public managed route.",
    focusRuleId: policyId("stfc.lifecycle.cycle.require-public-managed-route"),
    focusModality: "require",
    declaration: STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1,
    expected: {
      ...nonAuthorizingExpectation,
      policyEffect: "mandatory_requirement",
    },
  },
] as const satisfies readonly NormativePolicyConformanceFixtureV1[]);
