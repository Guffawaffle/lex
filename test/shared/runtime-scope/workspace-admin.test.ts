import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  InMemoryAuthorityDirectory,
  LocalRegistryError,
  RUNTIME_OPERATION_CAPABILITIES,
  WorkspaceBindingAdminService,
  captureTrustedBootstrapInput,
  registryLocationFromBootstrap,
  type AuthenticationRef,
  type AuthorityGrantId,
  type AuthorityVersion,
  type CapabilityId,
  type ContentDigest,
  type InMemoryAuthoritySeedV1,
  type PrincipalId,
  type RepositoryId,
  type RepositorySlug,
  type RuntimeScopeDiscoveryAdapterV1,
  type ScopeVersion,
  type TenantId,
  type TenantSlug,
  type WorkspaceId,
  type WorkspaceSlug,
} from "../../../src/shared/runtime-scope/index.js";

const NOW = "2026-07-18T12:00:00.000Z";
const AUTH_REF = "auth:guff" as AuthenticationRef;
const PRINCIPAL_ID = "principal-guff" as PrincipalId;
const TENANT_ID = "tenant-platform" as TenantId;
const WORKSPACE_ID = "workspace-lex" as WorkspaceId;
const WORKSPACE_AXF_ID = "workspace-axf" as WorkspaceId;
const REPOSITORY_ID = "repository-lex" as RepositoryId;

function authority(capabilities: readonly CapabilityId[]): InMemoryAuthorityDirectory {
  const seed: InMemoryAuthoritySeedV1 = {
    principals: [
      {
        schemaVersion: 1,
        principalId: PRINCIPAL_ID,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
    ],
    tenants: [
      {
        schemaVersion: 1,
        tenantId: TENANT_ID,
        tenantSlug: "platform-dogfood" as TenantSlug,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
    ],
    workspaces: [
      {
        schemaVersion: 1,
        workspaceId: WORKSPACE_ID,
        tenantId: TENANT_ID,
        workspaceSlug: "lex" as WorkspaceSlug,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
      {
        schemaVersion: 1,
        workspaceId: WORKSPACE_AXF_ID,
        tenantId: TENANT_ID,
        workspaceSlug: "axf" as WorkspaceSlug,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
    ],
    repositories: [
      {
        schemaVersion: 1,
        repositoryId: REPOSITORY_ID,
        repositorySlug: "lex" as RepositorySlug,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
    ],
    authentication: [{ authenticationRef: AUTH_REF, principalId: PRINCIPAL_ID }],
    grants: [
      {
        grant: {
          schemaVersion: 1,
          grantId: "grant-lex" as AuthorityGrantId,
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          principalId: PRINCIPAL_ID,
          capabilities,
          authorityVersion: "authority-v1" as AuthorityVersion,
          scopeVersion: "scope-v1" as ScopeVersion,
          authorityDigest: "sha256:authority" as ContentDigest,
          verifiedAt: NOW,
          expiresAt: "2026-07-18T13:00:00.000Z",
        },
      },
      {
        grant: {
          schemaVersion: 1,
          grantId: "grant-axf" as AuthorityGrantId,
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_AXF_ID,
          principalId: PRINCIPAL_ID,
          capabilities,
          authorityVersion: "authority-v1" as AuthorityVersion,
          scopeVersion: "scope-v1" as ScopeVersion,
          authorityDigest: "sha256:authority-axf" as ContentDigest,
          verifiedAt: NOW,
          expiresAt: "2026-07-18T13:00:00.000Z",
        },
      },
    ],
  };
  return new InMemoryAuthorityDirectory(seed, () => NOW);
}

function discovery(
  projectRoot: string,
  workspaceId: WorkspaceId = WORKSPACE_ID
): RuntimeScopeDiscoveryAdapterV1 {
  return {
    async discover() {
      return {
        schemaVersion: 1,
        projectRoot,
        authenticationRef: AUTH_REF,
        requestedWorkspace: { workspaceId },
        repositoryDeclaration: {
          schemaVersion: 1,
          repositoryId: REPOSITORY_ID,
          repositorySlug: "lex" as RepositorySlug,
        },
        repositoryEvidence: {
          schemaVersion: 1,
          canonicalRoot: projectRoot,
          gitCommonDirectoryDigest: "sha256:git-common" as ContentDigest,
          filesystemEvidenceDigest: "sha256:filesystem" as ContentDigest,
        },
        authorityMode: "shared",
        authoritySource: "authority:test",
        authorityCacheExpiresAt: "2026-07-18T12:30:00.000Z",
      };
    },
  };
}

const ADMIN_CAPABILITIES = Object.freeze([
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_BIND,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_INSPECT,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_REBIND,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_REVOKE,
  RUNTIME_OPERATION_CAPABILITIES.WORKSPACE_RECOVER,
]);

describe("workspace binding administration", () => {
  test("requires explicit recovery, then binds, inspects, rebinds, and revokes", async () => {
    const root = mkdtempSync(join(tmpdir(), "lex-workspace-admin-"));
    const projectRoot = join(root, "repo");
    mkdirSync(projectRoot, { recursive: true });
    const bootstrap = captureTrustedBootstrapInput({
      argv: ["node", "lex", "workspace"],
      cwd: projectRoot,
      environment: { HOME: root, XDG_STATE_HOME: join(root, "state") },
      platform: "linux",
      installationRef: "/usr/bin/node",
      capturedAt: NOW,
    });
    let nextId = 0;
    const service = new WorkspaceBindingAdminService({
      authorityDirectory: authority(ADMIN_CAPABILITIES),
      discovery: discovery(projectRoot),
      now: () => NOW,
      newId: () => `local-id-${(nextId += 1)}`,
    });
    const invocation = { schemaVersion: 1 as const, entrypoint: "cli" as const, bootstrap };
    try {
      await assert.rejects(
        () => service.bind(invocation),
        (error: unknown) =>
          error instanceof LocalRegistryError && error.code === "REGISTRY_NOT_FOUND"
      );
      assert.equal(
        registryLocationFromBootstrap(bootstrap).registryPath.endsWith("registry.db"),
        true
      );

      const recovery = await service.recover(invocation);
      assert.equal(recovery.created, true);
      await assert.rejects(
        () => service.recover(invocation),
        (error: unknown) =>
          error instanceof LocalRegistryError && error.code === "REGISTRY_CONFLICT"
      );

      const registered = await service.bind(invocation);
      const firstInspection = await service.inspect(invocation);
      assert.equal(firstInspection.bindings.length, 1);
      assert.equal(firstInspection.bindings[0]?.state, "active");
      assert.equal(firstInspection.receipts.length, 1);

      const otherWorkspaceService = new WorkspaceBindingAdminService({
        authorityDirectory: authority(ADMIN_CAPABILITIES),
        discovery: discovery(projectRoot, WORKSPACE_AXF_ID),
        now: () => NOW,
      });
      await otherWorkspaceService.bind(invocation);
      const isolatedInspection = await service.inspect(invocation);
      assert.equal(isolatedInspection.bindings.length, 1);
      assert.equal(isolatedInspection.bindings[0]?.workspaceId, WORKSPACE_ID);
      assert.equal(isolatedInspection.receipts.length, 1);

      const rebound = await service.rebind({
        ...invocation,
        bindingId: registered.bindingId,
        reason: "verified move",
      });
      assert.equal(rebound.action, "rebind");

      await service.revoke({
        ...invocation,
        bindingId: registered.bindingId,
        reason: "dogfood lifecycle complete",
      });
      const finalInspection = await service.inspect(invocation);
      assert.equal(finalInspection.bindings[0]?.state, "revoked");
      assert.deepEqual(finalInspection.receipts.map(({ action }) => action).sort(), [
        "rebind",
        "register",
        "revoke",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not create a registry when canonical authority denies recovery", async () => {
    const root = mkdtempSync(join(tmpdir(), "lex-workspace-admin-denied-"));
    const projectRoot = join(root, "repo");
    mkdirSync(projectRoot, { recursive: true });
    const bootstrap = captureTrustedBootstrapInput({
      argv: ["node", "lex", "workspace", "recover"],
      cwd: projectRoot,
      environment: { HOME: root, XDG_STATE_HOME: join(root, "state") },
      platform: "linux",
      installationRef: "/usr/bin/node",
      capturedAt: NOW,
    });
    const service = new WorkspaceBindingAdminService({
      authorityDirectory: authority([]),
      discovery: discovery(projectRoot),
      now: () => NOW,
    });
    try {
      await assert.rejects(() =>
        service.recover({ schemaVersion: 1, entrypoint: "cli", bootstrap })
      );
      assert.equal(
        await import("node:fs").then(({ existsSync }) =>
          existsSync(registryLocationFromBootstrap(bootstrap).registryPath)
        ),
        false
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
