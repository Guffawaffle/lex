import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  RUNTIME_SCOPE_CONFORMANCE_FIXTURES,
  RUNTIME_SCOPE_CONFORMANCE_VERSION,
  WORKSPACE_AUTHORITY_ERROR_CODES,
} from "../../../src/shared/runtime-scope/index.js";

function fixture(id: (typeof RUNTIME_SCOPE_CONFORMANCE_FIXTURES)[number]["id"]) {
  const match = RUNTIME_SCOPE_CONFORMANCE_FIXTURES.find((candidate) => candidate.id === id);
  assert.ok(match, `Missing runtime-scope conformance fixture: ${id}`);
  return match;
}

describe("runtime-scope conformance fixtures", () => {
  test("are versioned, unique, deterministic, and behavior-neutral", () => {
    const ids = RUNTIME_SCOPE_CONFORMANCE_FIXTURES.map(({ id }) => id);

    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(ids, [...ids].sort());
    assert.ok(ids.length >= 12);

    for (const candidate of RUNTIME_SCOPE_CONFORMANCE_FIXTURES) {
      assert.equal(candidate.schemaVersion, RUNTIME_SCOPE_CONFORMANCE_VERSION);
      assert.equal(candidate.expected.diagnosticChangesOutcome, false);
    }
  });

  test("Windows and WSL share canonical IDs but not local identities", () => {
    const candidate = fixture("same-checkout-cross-surface");
    const [windows, wsl] = candidate.surfaces;

    assert.ok(windows?.canonical);
    assert.ok(wsl?.canonical);
    assert.deepEqual(windows.canonical, wsl.canonical);
    assert.notEqual(windows.local.executionSurfaceId, wsl.local.executionSurfaceId);
    assert.notEqual(windows.local.registryInstanceId, wsl.local.registryInstanceId);
    assert.notEqual(windows.local.workspaceInstanceId, wsl.local.workspaceInstanceId);
    assert.notEqual(windows.local.repositoryInstanceId, wsl.local.repositoryInstanceId);
    assert.notEqual(windows.registryPath, wsl.registryPath);
  });

  test("each WSL distribution has a distinct registry and local identity", () => {
    const candidate = fixture("multiple-wsl-registries");
    const [ubuntu, debian] = candidate.surfaces;

    assert.notEqual(ubuntu?.wslDistribution, debian?.wslDistribution);
    assert.notEqual(ubuntu?.registryPath, debian?.registryPath);
    assert.notEqual(ubuntu?.local.registryInstanceId, debian?.local.registryInstanceId);
    assert.deepEqual(ubuntu?.canonical, debian?.canonical);
  });

  test("a Windows process launched through WSL interop selects Windows state", () => {
    const candidate = fixture("windows-process-via-wsl-interop");
    const [surface] = candidate.surfaces;

    assert.equal(surface?.nativePlatform, "win32");
    assert.equal(surface?.kind, "windows-native");
    assert.equal(surface?.launchOrigin, "wsl-interop");
    assert.equal(candidate.expected.selectedRegistryRef, "windows");
  });

  test("selectors, manifests, copies, forks, and expired caches fail closed", () => {
    assert.equal(
      fixture("environment-selector-no-authority").expected.errorCode,
      WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED
    );
    assert.equal(
      fixture("edited-manifest-no-authority").expected.errorCode,
      WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH
    );
    assert.equal(
      fixture("copied-registry-no-authority").expected.errorCode,
      WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED
    );
    assert.equal(
      fixture("fork-declaration-mismatch").expected.errorCode,
      WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH
    );
    assert.equal(
      fixture("cached-grant-expired").expected.errorCode,
      WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED
    );

    for (const id of [
      "environment-selector-no-authority",
      "edited-manifest-no-authority",
      "copied-registry-no-authority",
      "fork-declaration-mismatch",
      "cached-grant-expired",
    ] as const) {
      const candidate = fixture(id);
      assert.equal(candidate.expected.result, "fail-closed");
      assert.equal(candidate.expected.bindingMutation, "none");
    }
  });

  test("clone, worktree, and moved-root cases preserve canonical identity", () => {
    for (const id of [
      "verified-clone-new-instance",
      "worktree-new-instance",
      "moved-checkout-explicit-rebind",
    ] as const) {
      const candidate = fixture(id);
      assert.notEqual(candidate.expected.canonicalIdentity, "not-created");
      assert.equal(candidate.expected.bindingMutation, "explicit-only");
    }
  });

  test("diagnostics never change a failed resolution", () => {
    const candidate = fixture("diagnostic-observability-only");

    assert.equal(candidate.expected.result, "fail-closed");
    assert.equal(candidate.expected.diagnosticChangesOutcome, false);
    assert.equal(
      candidate.expected.errorCode,
      WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH
    );
  });
});
