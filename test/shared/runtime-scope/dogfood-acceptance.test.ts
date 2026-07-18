import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  LEX3_DOGFOOD_ACCEPTANCE_RECEIPT_VERSION,
  LEX3_DOGFOOD_CASE_ORDER,
  LEX3_DOGFOOD_CANONICAL_OUTCOMES,
  LEX3_DOGFOOD_NEGATIVE_CASES,
  LEX3_DOGFOOD_OPERATION_CASES,
  assertLex3DogfoodAcceptanceReceipt,
  type Lex3DogfoodAcceptanceCase,
  type Lex3DogfoodAcceptanceReceiptV1,
} from "../../../src/shared/runtime-scope/dogfood-acceptance.js";

function receipt(): Lex3DogfoodAcceptanceReceiptV1 {
  return {
    schemaVersion: LEX3_DOGFOOD_ACCEPTANCE_RECEIPT_VERSION,
    gate: "lex-3.0-postgres-two-tenant-five-workspace",
    ok: true,
    versions: {
      lex: "3.0.0-rc",
      authoritySchema: "1",
      frameStoreSchema: "3",
      policy: "lex-3-dogfood-v1",
    },
    topology: {
      tenants: 2,
      workspaces: 5,
      principals: 1,
      runtimePools: 1,
      scopedFrameTables: 1,
      localRegistryFixtures: 2,
    },
    cases: LEX3_DOGFOOD_CASE_ORDER.map((id) => ({
      id,
      expected: LEX3_DOGFOOD_CANONICAL_OUTCOMES[id],
      actual: LEX3_DOGFOOD_CANONICAL_OUTCOMES[id],
    })),
    surfaces: ["windows-native", "wsl"],
    output: {
      normalOutputCompact: "proven",
      diagnosticsOptIn: "proven",
      diagnosticsRedacted: "proven",
    },
    cleanup: {
      schemaDropped: true,
      runtimeRoleDropped: true,
      registryFixturesRemoved: true,
      exportFixturesRemoved: true,
    },
  };
}

function failedReceipt(caseId: Lex3DogfoodAcceptanceCase): Lex3DogfoodAcceptanceReceiptV1 {
  const canonical = receipt();
  const failedIndex = LEX3_DOGFOOD_CASE_ORDER.indexOf(caseId);
  return {
    ...canonical,
    ok: false,
    output: {
      normalOutputCompact: "not-proven",
      diagnosticsOptIn: "not-proven",
      diagnosticsRedacted: "not-proven",
    },
    cases: canonical.cases.map((result, index) => ({
      ...result,
      actual:
        index < failedIndex
          ? result.expected
          : index === failedIndex
            ? ("failed" as const)
            : ("not-run" as const),
    })),
    failure: { caseId, phase: "matrix", code: "ASSERTION_FAILED" },
  };
}

function diagnostics() {
  return {
    canonicalTenantIds: [
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    ],
    canonicalWorkspaceIds: [
      "30000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000002",
      "30000000-0000-4000-8000-000000000003",
      "30000000-0000-4000-8000-000000000004",
      "30000000-0000-4000-8000-000000000005",
    ],
    backendIdentity: `postgres-live-v1:sha256:${"a".repeat(64)}`,
    poolMax: 1 as const,
    scopeTransitions: 70,
    redactions: ["authenticationRef", "projectRoot"] as const,
  };
}

describe("Lex 3 PostgreSQL dogfood acceptance receipt", () => {
  test("requires every operation, negative case, and cleanup assertion", () => {
    assert.equal(new Set(LEX3_DOGFOOD_CASE_ORDER).size, LEX3_DOGFOOD_CASE_ORDER.length);
    assert.deepEqual(
      [...LEX3_DOGFOOD_CASE_ORDER].sort(),
      [...LEX3_DOGFOOD_OPERATION_CASES, ...LEX3_DOGFOOD_NEGATIVE_CASES].sort()
    );
    assert.doesNotThrow(() => assertLex3DogfoodAcceptanceReceipt(receipt()));

    const missingCase = receipt();
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...missingCase,
          cases: missingCase.cases.slice(1),
        }),
      /case order and coverage/
    );

    const incompleteCleanup = receipt();
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...incompleteCleanup,
          cleanup: { ...incompleteCleanup.cleanup, schemaDropped: false },
        }),
      /outcome does not match/
    );

    assert.doesNotThrow(() => assertLex3DogfoodAcceptanceReceipt(failedReceipt("create")));
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...failedReceipt("create"),
          output: receipt().output,
        }),
      /output proof does not match completed assertions/
    );
  });

  test("pins canonical outcomes, topology, surfaces, output, and versions", () => {
    const canonical = receipt();
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...canonical,
          cases: canonical.cases.map((result) =>
            result.id === "branch-spoof" ? { ...result, expected: "rejected" as const } : result
          ),
        }),
      /weakens the expected outcome/
    );
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...receipt(),
          topology: { ...receipt().topology, workspaces: 4 as 5 },
        }),
      /canonical topology/
    );
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...receipt(),
          surfaces: ["wsl", "windows-native"] as unknown as readonly ["windows-native", "wsl"],
        }),
      /canonical gate contract/
    );
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...receipt(),
          output: {
            ...receipt().output,
            normalOutputCompact: false as unknown as "proven",
          },
        }),
      /unsupported output-proof state/
    );
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...receipt(),
          versions: { ...receipt().versions, policy: "lex-3-dogfood-v2" },
        }),
      /version policy/
    );
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...canonical,
          ok: false,
          cases: canonical.cases.map((result) =>
            result.id === "create" ? { ...result, actual: "rejected" as const } : result
          ),
          failure: { phase: "matrix", code: "ASSERTION_FAILED" },
        }),
      /unsupported actual outcome/
    );
  });

  test("ties failure evidence to the exact failed case", () => {
    const canonical = receipt();
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...canonical,
          ok: false,
          failure: { caseId: "create", phase: "matrix", code: "ASSERTION_FAILED" },
        }),
      /identify exactly one failed case/
    );
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...canonical,
          ok: false,
          cases: canonical.cases.map((result) =>
            result.id === "create" ? { ...result, actual: "failed" as const } : result
          ),
        }),
      /incomplete cases require failure evidence/
    );

    const outOfOrder = failedReceipt("create");
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...outOfOrder,
          cases: outOfOrder.cases.map((result) =>
            result.id === "recall-get" ? { ...result, actual: result.expected } : result
          ),
        }),
      /ordered execution prefix/
    );

    const doubleFailure = failedReceipt("create");
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...doubleFailure,
          cases: doubleFailure.cases.map((result) =>
            result.id === "recall-get" ? { ...result, actual: "failed" as const } : result
          ),
        }),
      /exactly one failed case/
    );
  });

  test("validates exact conditional root keys and unavailable setup evidence", () => {
    assert.doesNotThrow(() =>
      assertLex3DogfoodAcceptanceReceipt({ ...receipt(), diagnostics: diagnostics() })
    );
    assert.doesNotThrow(() =>
      assertLex3DogfoodAcceptanceReceipt({ ...failedReceipt("create"), diagnostics: diagnostics() })
    );

    const setupFailure: Lex3DogfoodAcceptanceReceiptV1 = {
      ...receipt(),
      ok: false,
      cases: receipt().cases.map((result) => ({ ...result, actual: "not-run" })),
      output: {
        normalOutputCompact: "not-proven",
        diagnosticsOptIn: "not-proven",
        diagnosticsRedacted: "not-proven",
      },
      failure: { phase: "setup", code: "INJECTED_SETUP_FAILURE" },
      diagnostics: { ...diagnostics(), backendIdentity: "unavailable", scopeTransitions: 0 },
    };
    assert.doesNotThrow(() => assertLex3DogfoodAcceptanceReceipt(setupFailure));

    const extraRoot = { ...receipt(), unexpected: true } as Lex3DogfoodAcceptanceReceiptV1;
    assert.throws(
      () => assertLex3DogfoodAcceptanceReceipt(extraRoot),
      /receipt has an unsupported shape/
    );
    const undefinedConditional = {
      ...receipt(),
      failure: undefined,
    } as Lex3DogfoodAcceptanceReceiptV1;
    assert.throws(
      () => assertLex3DogfoodAcceptanceReceipt(undefinedConditional),
      /receipt has an unsupported shape/
    );
  });

  test("rejects connection material and host paths from receipts", () => {
    assert.throws(
      () =>
        assertLex3DogfoodAcceptanceReceipt({
          ...receipt(),
          versions: { ...receipt().versions, lex: "3.0.0+password" },
        }),
      /secret or host-path/
    );
    const receiptWithHostPath = {
      ...receipt(),
      hostPath: "/tmp/private/canary",
    } as Lex3DogfoodAcceptanceReceiptV1;
    assert.throws(
      () => assertLex3DogfoodAcceptanceReceipt(receiptWithHostPath),
      /receipt has an unsupported shape/
    );
  });
});
