import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  InMemoryAuthorityDirectory,
  SqliteLocalBindingRegistry,
  WORKSPACE_AUTHORITY_ERROR_CODES,
  detectExecutionSurface,
  resolveRuntimeScope,
  type AuthenticationRef,
  type AuthorityGrantId,
  type AuthorityVersion,
  type BindingId,
  type BindingReceiptId,
  type CapabilityId,
  type ContentDigest,
  type ExecutionSurfaceId,
  type InMemoryAuthoritySeedV1,
  type LocalRegistryIdFactoryV1,
  type PrincipalId,
  type RegistryInstanceId,
  type RepositoryDeclarationV1,
  type RepositoryId,
  type RepositoryInstanceEvidenceV1,
  type RepositoryInstanceId,
  type RepositorySlug,
  type RuntimeId,
  type RuntimeScopeResolutionRequestV1,
  type ScopeVersion,
  type TenantId,
  type TenantSlug,
  type WorkspaceId,
  type WorkspaceInstanceId,
  type WorkspaceSlug,
} from "../../../src/shared/runtime-scope/index.js";

const NOW = "2026-07-18T05:00:00.000Z";
const CACHE_EXPIRES = "2026-07-18T05:30:00.000Z";
const GRANT_EXPIRES = "2026-07-18T06:00:00.000Z";
const AUTHENTICATION_REF = "auth:guff" as AuthenticationRef;
const PRINCIPAL_ID = "principal-guff" as PrincipalId;
const TENANT_ID = "tenant-platform" as TenantId;
const TENANT_SLUG = "platform-dogfood" as TenantSlug;
const WORKSPACE_ID = "workspace-lex" as WorkspaceId;
const WORKSPACE_SLUG = "lex" as WorkspaceSlug;
const REPOSITORY_ID = "repository-lex" as RepositoryId;
const REPOSITORY_SLUG = "lex" as RepositorySlug;
const CAPABILITY = "frame:read" as CapabilityId;

const declaration: RepositoryDeclarationV1 = {
  schemaVersion: 1,
  repositoryId: REPOSITORY_ID,
  repositorySlug: REPOSITORY_SLUG,
};

function evidence(root = "/srv/lex"): RepositoryInstanceEvidenceV1 {
  return {
    schemaVersion: 1,
    canonicalRoot: root,
    manifestDigest: "sha256:manifest" as ContentDigest,
    gitCommonDirectoryDigest: "sha256:git-common" as ContentDigest,
    filesystemEvidenceDigest: "sha256:filesystem" as ContentDigest,
    provider: {
      provider: "github",
      providerRepositoryId: "Guffawaffle/lex",
      remoteDigest: "sha256:remote" as ContentDigest,
    },
  };
}

function authoritySeed(
  options: { revoked?: boolean; expiresAt?: string } = {}
): InMemoryAuthoritySeedV1 {
  return {
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
        tenantSlug: TENANT_SLUG,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
    ],
    workspaces: [
      {
        schemaVersion: 1,
        workspaceId: WORKSPACE_ID,
        tenantId: TENANT_ID,
        workspaceSlug: WORKSPACE_SLUG,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
    ],
    repositories: [
      {
        schemaVersion: 1,
        repositoryId: REPOSITORY_ID,
        repositorySlug: REPOSITORY_SLUG,
        state: "active",
        authorityVersion: "authority-v1" as AuthorityVersion,
      },
    ],
    authentication: [{ authenticationRef: AUTHENTICATION_REF, principalId: PRINCIPAL_ID }],
    grants: [
      {
        grant: {
          schemaVersion: 1,
          grantId: "grant-lex" as AuthorityGrantId,
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          principalId: PRINCIPAL_ID,
          capabilities: [CAPABILITY],
          authorityVersion: "authority-v1" as AuthorityVersion,
          scopeVersion: "scope-v1" as ScopeVersion,
          authorityDigest: "sha256:authority" as ContentDigest,
          verifiedAt: NOW,
          expiresAt: options.expiresAt ?? GRANT_EXPIRES,
        },
        ...(options.revoked ? { revokedAt: NOW } : {}),
      },
    ],
  };
}

function deterministicIds(prefix: string): LocalRegistryIdFactoryV1 {
  let binding = 0;
  let receipt = 0;
  return {
    bindingId: () => `${prefix}-binding-${++binding}` as BindingId,
    receiptId: () => `${prefix}-receipt-${++receipt}` as BindingReceiptId,
  };
}

async function withResolver(
  prefix: string,
  run: (context: {
    registry: SqliteLocalBindingRegistry;
    authority: InMemoryAuthorityDirectory;
    request: RuntimeScopeResolutionRequestV1;
  }) => Promise<void>,
  options: { register?: boolean; authority?: InMemoryAuthoritySeedV1 } = {}
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), `lex-runtime-resolver-${prefix}-`));
  const databasePath = join(root, "registry.db");
  const surface = detectExecutionSurface({
    platform: "linux",
    installationRef: `${prefix}-installation`,
    wslDistribution: "Ubuntu-24.04",
  });
  const registryInstanceId = `${prefix}-registry` as RegistryInstanceId;
  const executionSurfaceId = `${prefix}-surface` as ExecutionSurfaceId;
  const registry = SqliteLocalBindingRegistry.initialize({
    databasePath,
    registryInstanceId,
    executionSurfaceId,
    executionSurface: surface,
    createdAt: NOW,
    now: () => NOW,
    idFactory: deterministicIds(prefix),
  });
  const authority = new InMemoryAuthorityDirectory(options.authority ?? authoritySeed(), () => NOW);
  if (options.register !== false) {
    await registry.registerBinding({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      repositoryInstanceId: `${prefix}-repository-instance-1` as RepositoryInstanceId,
      workspaceInstanceId: `${prefix}-workspace-instance-1` as WorkspaceInstanceId,
      evidence: evidence(),
      authorityEvidence: {
        schemaVersion: 1,
        authoritySource: "authority:test",
        authorityVersion: "authority-v1" as AuthorityVersion,
        authorityDigest: "sha256:authority" as ContentDigest,
        verifiedAt: NOW,
        expiresAt: CACHE_EXPIRES,
      },
      registeredByPrincipalId: PRINCIPAL_ID,
    });
  }
  const request: RuntimeScopeResolutionRequestV1 = {
    schemaVersion: 1,
    bootstrap: {
      schemaVersion: 1,
      cwd: "/srv/lex",
      argv: ["lex", "recall"],
      allowedEnvironment: {},
      platform: "linux",
      executionSurface: surface,
      capturedAt: NOW,
    },
    projectRoot: "/srv/lex",
    authenticationRef: AUTHENTICATION_REF,
    requestedWorkspace: { workspaceId: WORKSPACE_ID },
    requestedCapabilities: [CAPABILITY],
    repositoryDeclaration: declaration,
    repositoryEvidence: evidence(),
    runtimeSurface: {
      schemaVersion: 1,
      registryInstanceId,
      executionSurfaceId,
      runtimeId: `${prefix}-runtime` as RuntimeId,
    },
    authoritySource: "authority:test",
    authorityCacheExpiresAt: CACHE_EXPIRES,
  };

  try {
    await run({ registry, authority, request });
  } finally {
    registry.close();
    rmSync(root, { recursive: true, force: true });
  }
}

describe("deterministic runtime-scope resolver", () => {
  test("resolves one immutable authorized scope without returning diagnostic metadata", async () => {
    await withResolver("success", async ({ registry, authority, request }) => {
      const result = await resolveRuntimeScope(request, {
        authorityDirectory: authority,
        localRegistry: registry,
      });

      assert.equal(result.resolved, true);
      if (!result.resolved) return;
      assert.equal(result.authorizedScope.tenantId, TENANT_ID);
      assert.equal(result.authorizedScope.workspaceId, WORKSPACE_ID);
      assert.equal(result.invocationContext.binding?.repositoryId, REPOSITORY_ID);
      assert.equal("diagnostics" in result, false);
      assert.equal(Object.isFrozen(result), true);
      assert.equal(Object.isFrozen(result.authorizedScope), true);
      assert.equal(Object.isFrozen(result.authorizedScope.capabilities), true);
      assert.equal(Object.isFrozen(result.invocationContext), true);
    });
  });

  test("clones and deeply freezes a binding returned by an injected registry", async () => {
    await withResolver("mutable-binding", async ({ registry, authority, request }) => {
      const [storedBinding] = await registry.inspectBindings();
      assert.ok(storedBinding);
      const mutableBinding = {
        ...storedBinding,
        evidence: {
          ...storedBinding.evidence,
          provider: storedBinding.evidence.provider
            ? { ...storedBinding.evidence.provider }
            : undefined,
        },
        cachedAuthority: storedBinding.cachedAuthority
          ? { ...storedBinding.cachedAuthority }
          : undefined,
      };
      const mutableRegistry = new Proxy(registry, {
        get(target, property) {
          if (property === "findRepositoryInstances") return async () => [mutableBinding];
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });

      const result = await resolveRuntimeScope(request, {
        authorityDirectory: authority,
        localRegistry: mutableRegistry,
      });
      assert.equal(result.resolved, true);
      if (!result.resolved || !result.invocationContext.binding) return;

      const resolvedBinding = result.invocationContext.binding;
      assert.notEqual(resolvedBinding, mutableBinding);
      assert.notEqual(resolvedBinding.evidence, mutableBinding.evidence);
      assert.notEqual(resolvedBinding.evidence.provider, mutableBinding.evidence.provider);
      assert.notEqual(resolvedBinding.cachedAuthority, mutableBinding.cachedAuthority);
      assert.equal(Object.isFrozen(resolvedBinding), true);
      assert.equal(Object.isFrozen(resolvedBinding.evidence), true);
      assert.equal(Object.isFrozen(resolvedBinding.evidence.provider), true);
      assert.equal(Object.isFrozen(resolvedBinding.cachedAuthority), true);
      assert.equal(Reflect.set(resolvedBinding, "state", "revoked"), false);
      assert.equal(Reflect.set(resolvedBinding.evidence, "canonicalRoot", "/srv/tampered"), false);

      Reflect.set(mutableBinding, "state", "revoked");
      Reflect.set(mutableBinding.evidence, "canonicalRoot", "/srv/tampered");
      assert.equal(resolvedBinding.state, "active");
      assert.equal(resolvedBinding.evidence.canonicalRoot, "/srv/lex");
    });
  });

  test("resolves an existing verified binding when no declaration is present", async () => {
    await withResolver("no-declaration-existing", async ({ registry, authority, request }) => {
      const { repositoryDeclaration: _omitted, ...withoutDeclaration } = request;
      const result = await resolveRuntimeScope(withoutDeclaration, {
        authorityDirectory: authority,
        localRegistry: registry,
      });

      assert.equal(result.resolved, true);
      if (result.resolved) {
        assert.equal(result.invocationContext.repositoryDeclaration, undefined);
      }
    });
  });

  test("leaves a repository with no declaration and no binding explicitly unbound", async () => {
    await withResolver(
      "no-declaration-unbound",
      async ({ registry, authority, request }) => {
        const { repositoryDeclaration: _omitted, ...withoutDeclaration } = request;
        const result = await resolveRuntimeScope(withoutDeclaration, {
          authorityDirectory: authority,
          localRegistry: registry,
        });
        assert.deepEqual(result, {
          resolved: false,
          error: {
            code: WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND,
            message: "No trusted local workspace binding matched this invocation.",
          },
        });
      },
      { register: false }
    );
  });

  test("fails closed on conflicting repository evidence", async () => {
    await withResolver("mismatch", async ({ registry, authority, request }) => {
      const result = await resolveRuntimeScope(
        {
          ...request,
          repositoryEvidence: {
            ...evidence(),
            provider: {
              provider: "github",
              providerRepositoryId: "someone/fork",
              remoteDigest: "sha256:fork" as ContentDigest,
            },
          },
        },
        { authorityDirectory: authority, localRegistry: registry }
      );
      assert.equal(result.resolved, false);
      if (!result.resolved) {
        assert.equal(
          result.error.code,
          WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH
        );
      }
    });
  });

  test("returns a stable ambiguity error when two verified bindings match", async () => {
    await withResolver("ambiguous", async ({ registry, authority, request }) => {
      await registry.registerBinding({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        repositoryId: REPOSITORY_ID,
        repositoryInstanceId: "ambiguous-repository-instance-2" as RepositoryInstanceId,
        workspaceInstanceId: "ambiguous-workspace-instance-2" as WorkspaceInstanceId,
        evidence: evidence(),
        authorityEvidence: {
          schemaVersion: 1,
          authoritySource: "authority:test",
          authorityVersion: "authority-v1" as AuthorityVersion,
          authorityDigest: "sha256:authority" as ContentDigest,
          verifiedAt: NOW,
          expiresAt: CACHE_EXPIRES,
        },
        registeredByPrincipalId: PRINCIPAL_ID,
      });

      const result = await resolveRuntimeScope(request, {
        authorityDirectory: authority,
        localRegistry: registry,
      });
      assert.equal(result.resolved, false);
      if (!result.resolved) {
        assert.equal(
          result.error.code,
          WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_BINDING_AMBIGUOUS
        );
      }
    });
  });

  test("maps canonical revocation and expiry to stable fail-closed errors", async () => {
    for (const scenario of [
      {
        name: "revoked",
        seed: authoritySeed({ revoked: true }),
        code: WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_GRANT_REVOKED,
      },
      {
        name: "expired",
        seed: authoritySeed({ expiresAt: NOW }),
        code: WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED,
      },
    ] as const) {
      await withResolver(
        scenario.name,
        async ({ registry, authority, request }) => {
          const result = await resolveRuntimeScope(request, {
            authorityDirectory: authority,
            localRegistry: registry,
          });
          assert.equal(result.resolved, false);
          if (!result.resolved) assert.equal(result.error.code, scenario.code);
        },
        { authority: scenario.seed }
      );
    }
  });

  test("rejects runtime-surface identity substitution before local lookup", async () => {
    await withResolver("surface-mismatch", async ({ registry, authority, request }) => {
      const result = await resolveRuntimeScope(
        {
          ...request,
          runtimeSurface: {
            ...request.runtimeSurface,
            registryInstanceId: "copied-registry" as RegistryInstanceId,
          },
        },
        { authorityDirectory: authority, localRegistry: registry }
      );
      assert.equal(result.resolved, false);
      if (!result.resolved) {
        assert.equal(
          result.error.code,
          WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH
        );
      }
    });
  });

  test("maps dependency exceptions to stable compact failures", async () => {
    await withResolver("dependency-failure", async ({ registry, authority, request }) => {
      const throwingAuthority = new Proxy(authority, {
        get(target, property) {
          if (property === "resolvePrincipal") {
            return async () => {
              throw new Error("credential provider details must stay private");
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const authorityFailure = await resolveRuntimeScope(request, {
        authorityDirectory: throwingAuthority,
        localRegistry: registry,
      });
      assert.deepEqual(authorityFailure, {
        resolved: false,
        error: {
          code: WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED,
          message: "Canonical authority did not authorize the requested workspace selector.",
        },
      });

      const throwingRegistry = new Proxy(registry, {
        get(target, property) {
          if (property === "findRepositoryInstances") {
            return async () => {
              throw new Error("database path must stay private");
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const registryFailure = await resolveRuntimeScope(request, {
        authorityDirectory: authority,
        localRegistry: throwingRegistry,
      });
      assert.deepEqual(registryFailure, {
        resolved: false,
        error: {
          code: WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH,
          message: "Repository identity evidence did not match the trusted local binding.",
        },
      });
    });
  });
});
