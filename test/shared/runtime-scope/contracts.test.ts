import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  AUTHORITY_DIRECTORY_CONTRACT_VERSION,
  DIAGNOSTIC_CONTRACT_VERSION,
  LOCAL_BINDING_CONTRACT_VERSION,
  RUNTIME_SCOPE_CONTRACT_VERSION,
  WORKSPACE_AUTHORITY_ERROR_CODES,
  type AuthorityDirectory,
  type LocalBindingRegistry,
} from "../../../src/shared/runtime-scope/index.js";
import { LEX_ERROR_CODES, isLexErrorCode } from "../../../src/shared/errors/index.js";

describe("trusted runtime-scope public contract", () => {
  test("serialized contract families begin at version 1", () => {
    assert.equal(AUTHORITY_DIRECTORY_CONTRACT_VERSION, 1);
    assert.equal(LOCAL_BINDING_CONTRACT_VERSION, 1);
    assert.equal(RUNTIME_SCOPE_CONTRACT_VERSION, 1);
    assert.equal(DIAGNOSTIC_CONTRACT_VERSION, 1);
  });

  test("resolver error vocabulary is stable and part of the Lex catalog", () => {
    assert.deepEqual(WORKSPACE_AUTHORITY_ERROR_CODES, {
      WORKSPACE_UNBOUND: "LEX_WORKSPACE_UNBOUND",
      REPOSITORY_BINDING_MISMATCH: "LEX_REPOSITORY_BINDING_MISMATCH",
      WORKSPACE_SELECTOR_UNAUTHORIZED: "LEX_WORKSPACE_SELECTOR_UNAUTHORIZED",
      WORKSPACE_BINDING_AMBIGUOUS: "LEX_WORKSPACE_BINDING_AMBIGUOUS",
      AUTHORITY_CACHE_EXPIRED: "LEX_AUTHORITY_CACHE_EXPIRED",
      AUTHORITY_GRANT_REVOKED: "LEX_AUTHORITY_GRANT_REVOKED",
    });

    for (const code of Object.values(WORKSPACE_AUTHORITY_ERROR_CODES)) {
      assert.equal(isLexErrorCode(code), true);
      assert.ok(Object.values(LEX_ERROR_CODES).includes(code));
    }
  });

  test("canonical authority and local binding interfaces remain separate", () => {
    const authorityMethods: readonly (keyof AuthorityDirectory)[] = [
      "resolvePrincipal",
      "getTenant",
      "getWorkspace",
      "getRepository",
      "authorizeWorkspace",
    ];
    const localRegistryMethods: readonly (keyof LocalBindingRegistry)[] = [
      "registryInstanceId",
      "executionSurfaceId",
      "findRepositoryInstances",
      "registerBinding",
      "verifyBinding",
      "revokeBinding",
    ];

    assert.equal(localRegistryMethods.includes("grantWorkspaceAccess" as never), false);
    assert.equal(localRegistryMethods.includes("addTenantMembership" as never), false);
    assert.equal(localRegistryMethods.includes("authorizePrincipal" as never), false);
    assert.equal(authorityMethods.includes("authorizeWorkspace"), true);
  });
});
