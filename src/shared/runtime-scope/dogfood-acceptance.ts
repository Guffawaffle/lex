import { LEX3_DOGFOOD_CANONICAL_IDS } from "./dogfood-topology.js";

/** Stable, secret-free evidence contract for the Lex 3 PostgreSQL GA gate. */
export const LEX3_DOGFOOD_ACCEPTANCE_RECEIPT_VERSION = 1 as const;

export const LEX3_DOGFOOD_OPERATION_CASES = Object.freeze([
  "create",
  "recall-get",
  "list",
  "search",
  "update",
  "delete",
  "count",
  "statistics",
  "export",
  "cli-dispatch",
  "mcp-dispatch",
  "cli-mcp-parity",
  "pool-scope-alternation",
  "transaction-rollback",
  "transaction-error",
  "transaction-cancellation",
  "pool-reuse-after-error",
  "windows-wsl-canonical-parity",
] as const);

export const LEX3_DOGFOOD_NEGATIVE_CASES = Object.freeze([
  "unauthorized-tenant-selector",
  "unauthorized-workspace-selector",
  "path-spoof",
  "branch-spoof",
  "manifest-spoof",
  "environment-spoof",
  "cross-workspace-identifier-collision",
  "cross-tenant-identifier-collision",
  "cross-workspace-content-collision",
  "cross-tenant-content-collision",
  "existence-leak",
  "missing-grant",
  "expired-grant",
  "revoked-grant",
  "attenuated-grant",
  "missing-runtime-scope",
  "malformed-runtime-scope",
  "rls-disable",
  "rls-policy-drop",
  "rls-bypass",
  "migration-admin-separation",
] as const);

export type Lex3DogfoodOperationCase = (typeof LEX3_DOGFOOD_OPERATION_CASES)[number];
export type Lex3DogfoodNegativeCase = (typeof LEX3_DOGFOOD_NEGATIVE_CASES)[number];
export type Lex3DogfoodAcceptanceCase = Lex3DogfoodOperationCase | Lex3DogfoodNegativeCase;

/** Canonical execution order; a failed receipt must be a completed prefix followed by not-run. */
export const LEX3_DOGFOOD_CASE_ORDER = Object.freeze([
  "windows-wsl-canonical-parity",
  "create",
  "cross-workspace-identifier-collision",
  "cross-tenant-identifier-collision",
  "cross-workspace-content-collision",
  "cross-tenant-content-collision",
  "recall-get",
  "list",
  "search",
  "update",
  "delete",
  "count",
  "statistics",
  "existence-leak",
  "pool-scope-alternation",
  "transaction-rollback",
  "transaction-error",
  "transaction-cancellation",
  "pool-reuse-after-error",
  "missing-runtime-scope",
  "malformed-runtime-scope",
  "cli-dispatch",
  "mcp-dispatch",
  "cli-mcp-parity",
  "export",
  "path-spoof",
  "manifest-spoof",
  "branch-spoof",
  "environment-spoof",
  "unauthorized-tenant-selector",
  "unauthorized-workspace-selector",
  "attenuated-grant",
  "missing-grant",
  "expired-grant",
  "revoked-grant",
  "rls-disable",
  "rls-policy-drop",
  "rls-bypass",
  "migration-admin-separation",
] as const satisfies readonly Lex3DogfoodAcceptanceCase[]);

export type Lex3DogfoodExpectedOutcome =
  "isolated" | "rejected" | "equivalent" | "reusable" | "contained";

export const LEX3_DOGFOOD_CANONICAL_OUTCOMES = Object.freeze({
  create: "isolated",
  "recall-get": "isolated",
  list: "isolated",
  search: "isolated",
  update: "isolated",
  delete: "isolated",
  count: "isolated",
  statistics: "isolated",
  export: "isolated",
  "cli-dispatch": "equivalent",
  "mcp-dispatch": "equivalent",
  "cli-mcp-parity": "equivalent",
  "pool-scope-alternation": "isolated",
  "transaction-rollback": "reusable",
  "transaction-error": "reusable",
  "transaction-cancellation": "reusable",
  "pool-reuse-after-error": "reusable",
  "windows-wsl-canonical-parity": "equivalent",
  "unauthorized-tenant-selector": "rejected",
  "unauthorized-workspace-selector": "rejected",
  "path-spoof": "rejected",
  "branch-spoof": "contained",
  "manifest-spoof": "rejected",
  "environment-spoof": "contained",
  "cross-workspace-identifier-collision": "isolated",
  "cross-tenant-identifier-collision": "isolated",
  "cross-workspace-content-collision": "isolated",
  "cross-tenant-content-collision": "isolated",
  "existence-leak": "isolated",
  "missing-grant": "rejected",
  "expired-grant": "rejected",
  "revoked-grant": "rejected",
  "attenuated-grant": "rejected",
  "missing-runtime-scope": "rejected",
  "malformed-runtime-scope": "rejected",
  "rls-disable": "rejected",
  "rls-policy-drop": "rejected",
  "rls-bypass": "rejected",
  "migration-admin-separation": "rejected",
} satisfies Record<Lex3DogfoodAcceptanceCase, Lex3DogfoodExpectedOutcome>);

export interface Lex3DogfoodAcceptanceCaseResultV1 {
  readonly id: Lex3DogfoodAcceptanceCase;
  readonly expected: Lex3DogfoodExpectedOutcome;
  readonly actual: Lex3DogfoodExpectedOutcome | "failed" | "not-run";
}

export interface Lex3DogfoodAcceptanceReceiptV1 {
  readonly schemaVersion: typeof LEX3_DOGFOOD_ACCEPTANCE_RECEIPT_VERSION;
  readonly gate: "lex-3.0-postgres-two-tenant-five-workspace";
  readonly ok: boolean;
  readonly versions: Readonly<{
    lex: string;
    authoritySchema: string;
    frameStoreSchema: string;
    policy: string;
  }>;
  readonly topology: Readonly<{
    tenants: 2;
    workspaces: 5;
    principals: 1;
    runtimePools: 1;
    scopedFrameTables: 1;
    localRegistryFixtures: 2;
  }>;
  readonly cases: readonly Lex3DogfoodAcceptanceCaseResultV1[];
  readonly surfaces: readonly ["windows-native", "wsl"];
  readonly output: Readonly<{
    normalOutputCompact: "proven" | "not-proven";
    diagnosticsOptIn: "proven" | "not-proven";
    diagnosticsRedacted: "proven" | "not-proven";
  }>;
  readonly cleanup: Readonly<{
    schemaDropped: boolean;
    runtimeRoleDropped: boolean;
    registryFixturesRemoved: boolean;
    exportFixturesRemoved: boolean;
  }>;
  readonly failure?: Readonly<{
    caseId?: Lex3DogfoodAcceptanceCase;
    phase: "setup" | "matrix" | "dispatch" | "negative" | "cleanup";
    code: string;
  }>;
  readonly diagnostics?: Readonly<{
    canonicalTenantIds: readonly string[];
    canonicalWorkspaceIds: readonly string[];
    backendIdentity: string | "unavailable";
    poolMax: 1;
    scopeTransitions: number;
    redactions: readonly ["authenticationRef", "projectRoot"];
  }>;
}

function assertExactKeys(value: object, expected: readonly string[], name: string): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new TypeError(`${name} has an unsupported shape.`);
  }
}

function assertExactArray(
  actual: readonly string[],
  expected: readonly string[],
  name: string
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new TypeError(`${name} does not match the canonical gate contract.`);
  }
}

/** Validate exact case coverage without accepting an accidentally weakened gate. */
export function assertLex3DogfoodAcceptanceReceipt(receipt: Lex3DogfoodAcceptanceReceiptV1): void {
  assertExactKeys(
    receipt,
    [
      "schemaVersion",
      "gate",
      "ok",
      "versions",
      "topology",
      "cases",
      "surfaces",
      "output",
      "cleanup",
      ...(receipt.failure === undefined ? [] : ["failure"]),
      ...(receipt.diagnostics === undefined ? [] : ["diagnostics"]),
    ],
    "receipt"
  );
  if (
    receipt.schemaVersion !== LEX3_DOGFOOD_ACCEPTANCE_RECEIPT_VERSION ||
    receipt.gate !== "lex-3.0-postgres-two-tenant-five-workspace"
  ) {
    throw new TypeError("Unsupported Lex 3 dogfood acceptance receipt.");
  }
  assertExactKeys(
    receipt.versions,
    ["lex", "authoritySchema", "frameStoreSchema", "policy"],
    "versions"
  );
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(receipt.versions.lex) ||
    receipt.versions.authoritySchema !== "1" ||
    receipt.versions.frameStoreSchema !== "2" ||
    receipt.versions.policy !== "lex-3-dogfood-v1"
  ) {
    throw new TypeError("Lex 3 dogfood receipt has unsupported version policy evidence.");
  }
  assertExactKeys(
    receipt.topology,
    [
      "tenants",
      "workspaces",
      "principals",
      "runtimePools",
      "scopedFrameTables",
      "localRegistryFixtures",
    ],
    "topology"
  );
  if (
    receipt.topology.tenants !== 2 ||
    receipt.topology.workspaces !== 5 ||
    receipt.topology.principals !== 1 ||
    receipt.topology.runtimePools !== 1 ||
    receipt.topology.scopedFrameTables !== 1 ||
    receipt.topology.localRegistryFixtures !== 2
  ) {
    throw new TypeError("Lex 3 dogfood receipt does not prove the canonical topology.");
  }
  assertExactArray(receipt.surfaces, ["windows-native", "wsl"], "surfaces");
  assertExactKeys(
    receipt.output,
    ["normalOutputCompact", "diagnosticsOptIn", "diagnosticsRedacted"],
    "output"
  );
  if (
    !["proven", "not-proven"].includes(receipt.output.normalOutputCompact) ||
    !["proven", "not-proven"].includes(receipt.output.diagnosticsOptIn) ||
    !["proven", "not-proven"].includes(receipt.output.diagnosticsRedacted)
  ) {
    throw new TypeError("Lex 3 dogfood receipt has unsupported output-proof state.");
  }
  assertExactKeys(
    receipt.cleanup,
    ["schemaDropped", "runtimeRoleDropped", "registryFixturesRemoved", "exportFixturesRemoved"],
    "cleanup"
  );
  assertExactArray(
    receipt.cases.map(({ id }) => id),
    LEX3_DOGFOOD_CASE_ORDER,
    "case order and coverage"
  );
  for (const result of receipt.cases) {
    assertExactKeys(result, ["id", "expected", "actual"], `case ${result.id}`);
    if (result.expected !== LEX3_DOGFOOD_CANONICAL_OUTCOMES[result.id]) {
      throw new TypeError(`Lex 3 dogfood receipt weakens the expected outcome for ${result.id}.`);
    }
    if (
      result.actual !== result.expected &&
      result.actual !== "failed" &&
      result.actual !== "not-run"
    ) {
      throw new TypeError(
        `Lex 3 dogfood receipt has an unsupported actual outcome for ${result.id}.`
      );
    }
  }
  if (receipt.failure) {
    assertExactKeys(
      receipt.failure,
      receipt.failure.caseId === undefined ? ["phase", "code"] : ["caseId", "phase", "code"],
      "failure"
    );
    if (!/^[A-Z0-9_]{1,96}$/.test(receipt.failure.code)) {
      throw new TypeError("Lex 3 dogfood receipt has an unsafe failure code.");
    }
    if (!["setup", "matrix", "dispatch", "negative", "cleanup"].includes(receipt.failure.phase)) {
      throw new TypeError("Lex 3 dogfood receipt has an unsupported failure phase.");
    }
  }
  if (receipt.diagnostics) {
    assertExactKeys(
      receipt.diagnostics,
      [
        "canonicalTenantIds",
        "canonicalWorkspaceIds",
        "backendIdentity",
        "poolMax",
        "scopeTransitions",
        "redactions",
      ],
      "diagnostics"
    );
    assertExactArray(
      receipt.diagnostics.canonicalTenantIds,
      Object.values(LEX3_DOGFOOD_CANONICAL_IDS.tenants),
      "diagnostic tenant IDs"
    );
    assertExactArray(
      receipt.diagnostics.canonicalWorkspaceIds,
      Object.values(LEX3_DOGFOOD_CANONICAL_IDS.workspaces),
      "diagnostic workspace IDs"
    );
    if (
      (receipt.diagnostics.backendIdentity !== "unavailable" &&
        !/^postgres-live-v1:sha256:[0-9a-f]{64}$/.test(receipt.diagnostics.backendIdentity)) ||
      receipt.diagnostics.poolMax !== 1 ||
      !Number.isSafeInteger(receipt.diagnostics.scopeTransitions) ||
      receipt.diagnostics.scopeTransitions < 0
    ) {
      throw new TypeError("Lex 3 dogfood diagnostic evidence is not canonical.");
    }
    assertExactArray(
      receipt.diagnostics.redactions,
      ["authenticationRef", "projectRoot"],
      "diagnostic redactions"
    );
    if (receipt.diagnostics.backendIdentity === "unavailable" && receipt.failure === undefined) {
      throw new TypeError("A successful Lex 3 dogfood receipt requires live backend identity.");
    }
    if (receipt.failure === undefined && receipt.diagnostics.scopeTransitions < 1) {
      throw new TypeError("A successful Lex 3 dogfood receipt requires live scope transitions.");
    }
  }
  const failedIndexes = receipt.cases.flatMap(({ actual }, index) =>
    actual === "failed" ? [index] : []
  );
  if (receipt.failure?.caseId !== undefined) {
    const failedIndex = LEX3_DOGFOOD_CASE_ORDER.indexOf(receipt.failure.caseId);
    if (failedIndexes.length !== 1 || failedIndexes[0] !== failedIndex) {
      throw new TypeError("Lex 3 dogfood failure does not identify exactly one failed case.");
    }
    if (
      receipt.cases.slice(0, failedIndex).some(({ expected, actual }) => actual !== expected) ||
      receipt.cases.slice(failedIndex + 1).some(({ actual }) => actual !== "not-run")
    ) {
      throw new TypeError("Lex 3 dogfood failed case must terminate an ordered execution prefix.");
    }
  } else if (receipt.failure) {
    if (failedIndexes.length !== 0) {
      throw new TypeError("A phase-only Lex 3 dogfood failure cannot claim a failed case.");
    }
    const firstNotRun = receipt.cases.findIndex(({ actual }) => actual === "not-run");
    const prefixLength = firstNotRun === -1 ? receipt.cases.length : firstNotRun;
    if (
      receipt.cases.slice(0, prefixLength).some(({ expected, actual }) => actual !== expected) ||
      receipt.cases.slice(prefixLength).some(({ actual }) => actual !== "not-run")
    ) {
      throw new TypeError("Lex 3 dogfood phase failure must preserve an ordered execution prefix.");
    }
  } else if (
    failedIndexes.length !== 0 ||
    receipt.cases.some(({ expected, actual }) => actual !== expected)
  ) {
    throw new TypeError("Lex 3 dogfood incomplete cases require failure evidence.");
  }
  const resultFor = (id: Lex3DogfoodAcceptanceCase) =>
    receipt.cases[LEX3_DOGFOOD_CASE_ORDER.indexOf(id)]!;
  const compactOutputCompleted = ["cli-dispatch", "mcp-dispatch", "cli-mcp-parity"].every((id) => {
    const result = resultFor(id as Lex3DogfoodAcceptanceCase);
    return result.actual === result.expected;
  });
  const diagnosticsCompleted = resultFor("export").actual !== "not-run";
  if (
    receipt.output.normalOutputCompact !== (compactOutputCompleted ? "proven" : "not-proven") ||
    receipt.output.diagnosticsOptIn !== (diagnosticsCompleted ? "proven" : "not-proven") ||
    receipt.output.diagnosticsRedacted !== (diagnosticsCompleted ? "proven" : "not-proven")
  ) {
    throw new TypeError("Lex 3 dogfood output proof does not match completed assertions.");
  }
  const outcomesMatch = receipt.cases.every(({ expected, actual }) => expected === actual);
  const cleanupComplete = Object.values(receipt.cleanup).every(Boolean);
  const outputProven = Object.values(receipt.output).every((state) => state === "proven");
  if (
    receipt.ok !==
    (outcomesMatch && outputProven && cleanupComplete && receipt.failure === undefined)
  ) {
    throw new TypeError("Lex 3 dogfood receipt outcome does not match case and cleanup evidence.");
  }
  const serialized = JSON.stringify(receipt);
  if (
    /postgres(?:ql)?:\/\//i.test(serialized) ||
    /password|token|authentication_ref|authenticationRef\"\s*:/i.test(serialized) ||
    /(?:[A-Za-z]:\\|\/(?:home|srv|mnt|tmp)\/)/.test(serialized)
  ) {
    throw new TypeError("Lex 3 dogfood acceptance receipt contains secret or host-path data.");
  }
}
