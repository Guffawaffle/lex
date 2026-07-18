import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  InMemoryAuthorityDirectory,
  RUNTIME_SCOPE_CONFORMANCE_FIXTURES,
  SqliteLocalBindingRegistry,
  WORKSPACE_AUTHORITY_ERROR_CODES,
  detectExecutionSurface,
  resolveLocalRegistryLocation,
  resolveRuntimeScope,
  runtimeScopeFailureFromRegistryError,
  type AuthenticationRef,
  type AuthorityGrantId,
  type AuthorityVersion,
  type BindingId,
  type BindingReceiptId,
  type CapabilityId,
  type ContentDigest,
  type ExecutionSurfaceEvidenceV1,
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
  type RuntimeScopeConformanceExpectationV1,
  type RuntimeScopeConformanceFixtureId,
  type RuntimeScopeResolutionRequestV1,
  type RuntimeScopeResolutionResultV1,
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

interface RegistryContext {
  readonly root: string;
  readonly databasePath: string;
  readonly surface: ExecutionSurfaceEvidenceV1;
  readonly registry: SqliteLocalBindingRegistry;
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;
}

const declaration: RepositoryDeclarationV1 = {
  schemaVersion: 1,
  repositoryId: REPOSITORY_ID,
  repositorySlug: REPOSITORY_SLUG,
};

function evidence(
  root: string,
  options: { providerRepositoryId?: string; gitCommonDigest?: string } = {}
): RepositoryInstanceEvidenceV1 {
  return {
    schemaVersion: 1,
    canonicalRoot: root,
    manifestDigest: "sha256:manifest" as ContentDigest,
    gitCommonDirectoryDigest: (options.gitCommonDigest ?? "sha256:git-common") as ContentDigest,
    filesystemEvidenceDigest: "sha256:filesystem" as ContentDigest,
    provider: {
      provider: "github",
      providerRepositoryId: options.providerRepositoryId ?? "Guffawaffle/lex",
      remoteDigest: `sha256:${options.providerRepositoryId ?? "remote"}` as ContentDigest,
    },
  };
}

function authoritySeed(): InMemoryAuthoritySeedV1 {
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
          expiresAt: GRANT_EXPIRES,
        },
      },
    ],
  };
}

function authorityDirectory(): InMemoryAuthorityDirectory {
  return new InMemoryAuthorityDirectory(authoritySeed(), () => NOW);
}

function deterministicIds(prefix: string): LocalRegistryIdFactoryV1 {
  let binding = 0;
  let receipt = 0;
  return {
    bindingId: () => `${prefix}-binding-${++binding}` as BindingId,
    receiptId: () => `${prefix}-receipt-${++receipt}` as BindingReceiptId,
  };
}

function createRegistry(prefix: string, surface: ExecutionSurfaceEvidenceV1): RegistryContext {
  const root = mkdtempSync(join(tmpdir(), `lex-conformance-${prefix}-`));
  const databasePath = join(root, "registry.db");
  const registryInstanceId = `${prefix}-registry` as RegistryInstanceId;
  const executionSurfaceId = `${prefix}-surface` as ExecutionSurfaceId;
  return {
    root,
    databasePath,
    surface,
    registryInstanceId,
    executionSurfaceId,
    registry: SqliteLocalBindingRegistry.initialize({
      databasePath,
      registryInstanceId,
      executionSurfaceId,
      executionSurface: surface,
      createdAt: NOW,
      now: () => NOW,
      idFactory: deterministicIds(prefix),
    }),
  };
}

function closeRegistry(context: RegistryContext): void {
  try {
    context.registry.close();
  } catch {
    // Some scenarios close the original handle before attempting a second open.
  }
  rmSync(context.root, { recursive: true, force: true });
}

async function registerBinding(
  context: RegistryContext,
  root: string,
  instanceSuffix = "1",
  repositoryEvidence = evidence(root)
) {
  return context.registry.registerBinding({
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    repositoryId: REPOSITORY_ID,
    repositoryInstanceId:
      `${context.registryInstanceId}-repository-${instanceSuffix}` as RepositoryInstanceId,
    workspaceInstanceId:
      `${context.registryInstanceId}-workspace-${instanceSuffix}` as WorkspaceInstanceId,
    evidence: repositoryEvidence,
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

function request(
  context: RegistryContext,
  projectRoot: string,
  repositoryEvidence = evidence(projectRoot),
  repositoryDeclaration: RepositoryDeclarationV1 | undefined = declaration
): RuntimeScopeResolutionRequestV1 {
  const platform = context.surface.nativePlatform === "win32" ? "win32" : "linux";
  return {
    schemaVersion: 1,
    bootstrap: {
      schemaVersion: 1,
      cwd: projectRoot,
      argv: ["lex", "recall"],
      allowedEnvironment: {},
      platform,
      executionSurface: context.surface,
      capturedAt: NOW,
    },
    projectRoot,
    authenticationRef: AUTHENTICATION_REF,
    requestedWorkspace: { workspaceId: WORKSPACE_ID },
    requestedCapabilities: [CAPABILITY],
    ...(repositoryDeclaration ? { repositoryDeclaration } : {}),
    repositoryEvidence,
    runtimeSurface: {
      schemaVersion: 1,
      registryInstanceId: context.registryInstanceId,
      executionSurfaceId: context.executionSurfaceId,
      runtimeId: `${context.registryInstanceId}-runtime` as RuntimeId,
    },
    authoritySource: "authority:test",
    authorityCacheExpiresAt: CACHE_EXPIRES,
  };
}

function resolve(
  context: RegistryContext,
  resolutionRequest: RuntimeScopeResolutionRequestV1
): Promise<RuntimeScopeResolutionResultV1> {
  return resolveRuntimeScope(resolutionRequest, {
    authorityDirectory: authorityDirectory(),
    localRegistry: context.registry,
  });
}

function failureExpectation(
  result: RuntimeScopeResolutionResultV1,
  localIdentity: RuntimeScopeConformanceExpectationV1["localIdentity"]
): RuntimeScopeConformanceExpectationV1 {
  assert.equal(result.resolved, false);
  assert.ok(!result.resolved);
  return {
    result: "fail-closed",
    errorCode: result.error.code,
    canonicalIdentity: "not-created",
    localIdentity,
    bindingMutation: "none",
    diagnosticChangesOutcome: false,
  };
}

async function receiptsUnchanged<T>(
  registry: SqliteLocalBindingRegistry,
  operation: () => Promise<T>
): Promise<{ result: T; unchanged: boolean }> {
  const before = (await registry.inspectReceipts()).length;
  const result = await operation();
  const after = (await registry.inspectReceipts()).length;
  return { result, unchanged: before === after };
}

async function crossSurfaceResolution(): Promise<{
  windows: RegistryContext;
  wsl: RegistryContext;
  windowsResult: RuntimeScopeResolutionResultV1;
  wslResult: RuntimeScopeResolutionResultV1;
  resolutionDidNotMutate: boolean;
}> {
  const windows = createRegistry(
    "windows-cross-surface",
    detectExecutionSurface({ platform: "win32", installationRef: "windows-installation" })
  );
  const wsl = createRegistry(
    "wsl-cross-surface",
    detectExecutionSurface({
      platform: "linux",
      installationRef: "wsl-installation",
      wslDistribution: "Ubuntu-24.04",
    })
  );
  await registerBinding(windows, "C:\\dev\\lex");
  await registerBinding(wsl, "/mnt/c/dev/lex");
  const before =
    (await windows.registry.inspectReceipts()).length +
    (await wsl.registry.inspectReceipts()).length;
  const windowsResult = await resolve(windows, request(windows, "C:\\dev\\lex"));
  const wslResult = await resolve(wsl, request(wsl, "/mnt/c/dev/lex"));
  const after =
    (await windows.registry.inspectReceipts()).length +
    (await wsl.registry.inspectReceipts()).length;
  return { windows, wsl, windowsResult, wslResult, resolutionDidNotMutate: before === after };
}

type ConformanceHandler = () => Promise<RuntimeScopeConformanceExpectationV1>;

const handlers: Record<RuntimeScopeConformanceFixtureId, ConformanceHandler> = {
  "cached-grant-expired": async () => {
    const context = createRegistry(
      "expired",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "expired-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      const receipt = await registerBinding(context, "/srv/lex");
      const [binding] = await context.registry.inspectBindings({ bindingId: receipt.bindingId });
      assert.ok(binding);
      const verification = await context.registry.verifyBinding({
        binding,
        declaration,
        evidence: evidence("/srv/lex"),
        authorityEvidence: {
          schemaVersion: 1,
          authoritySource: "authority:test",
          authorityVersion: "authority-v1" as AuthorityVersion,
          authorityDigest: "sha256:authority" as ContentDigest,
          verifiedAt: NOW,
          expiresAt: NOW,
        },
        verifiedAt: NOW,
      });
      assert.equal(verification.status, "authority-expired");
      assert.equal((await context.registry.inspectBindings()).length, 1);
      return {
        result: "fail-closed",
        errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED,
        canonicalIdentity: "not-created",
        localIdentity: "preserved",
        bindingMutation: "none",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(context);
    }
  },

  "conflicting-binding-evidence": async () => {
    const context = createRegistry(
      "conflicting",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "conflicting-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      await registerBinding(context, "/srv/lex", "1");
      await registerBinding(context, "/srv/lex", "2");
      return failureExpectation(await resolve(context, request(context, "/srv/lex")), "preserved");
    } finally {
      closeRegistry(context);
    }
  },

  "copied-registry-no-authority": async () => {
    const context = createRegistry(
      "copied",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "ubuntu-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      context.registry.close();
      let translated: RuntimeScopeResolutionResultV1 | undefined;
      try {
        SqliteLocalBindingRegistry.open({
          databasePath: context.databasePath,
          executionSurface: detectExecutionSurface({
            platform: "linux",
            installationRef: "debian-installation",
            wslDistribution: "Debian",
          }),
        });
      } catch (error) {
        translated = runtimeScopeFailureFromRegistryError(error);
      }
      assert.ok(translated);
      return failureExpectation(translated, "not-created");
    } finally {
      closeRegistry(context);
    }
  },

  "diagnostic-observability-only": async () => {
    const context = createRegistry(
      "diagnostic",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "diagnostic-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      await registerBinding(context, "/srv/lex");
      const mismatched = request(
        context,
        "/srv/lex",
        evidence("/srv/lex", { providerRepositoryId: "someone/fork" })
      );
      const first = await resolve(context, mismatched);
      const second = await resolve(context, mismatched);
      assert.deepEqual(second, first);
      assert.equal("diagnostics" in first, false);
      return failureExpectation(first, "preserved");
    } finally {
      closeRegistry(context);
    }
  },

  "edited-manifest-no-authority": async () => {
    const context = createRegistry(
      "edited-manifest",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "edited-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      await registerBinding(context, "/srv/lex");
      const edited: RepositoryDeclarationV1 = {
        ...declaration,
        repositoryId: "repository-forged" as RepositoryId,
      };
      return failureExpectation(
        await resolve(context, request(context, "/srv/lex", evidence("/srv/lex"), edited)),
        "preserved"
      );
    } finally {
      closeRegistry(context);
    }
  },

  "environment-selector-no-authority": async () => {
    const context = createRegistry(
      "environment-selector",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "environment-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      const base = request(context, "/srv/lex");
      const result = await resolve(context, {
        ...base,
        bootstrap: {
          ...base.bootstrap,
          allowedEnvironment: { LEX_WORKSPACE: "not-authorized" },
        },
        requestedWorkspace: { workspaceId: "workspace-not-authorized" as WorkspaceId },
      });
      return failureExpectation(result, "not-created");
    } finally {
      closeRegistry(context);
    }
  },

  "fork-declaration-mismatch": async () => {
    const context = createRegistry(
      "fork",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "fork-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      await registerBinding(context, "/srv/upstream");
      const forkEvidence = evidence("/srv/fork", { providerRepositoryId: "someone/lex-fork" });
      const result = await resolve(
        context,
        request(context, "/srv/fork", forkEvidence, declaration)
      );
      assert.equal(
        (await context.registry.inspectBindings()).some(
          ({ evidence: stored }) => stored.canonicalRoot === "/srv/fork"
        ),
        false
      );
      return failureExpectation(result, "not-created");
    } finally {
      closeRegistry(context);
    }
  },

  "missing-repository-declaration": async () => {
    const context = createRegistry(
      "missing-declaration",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "missing-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      const unchanged = await receiptsUnchanged(context.registry, () =>
        resolve(context, request(context, "/srv/unbound", evidence("/srv/unbound"), undefined))
      );
      assert.ok(unchanged.unchanged);
      assert.equal(unchanged.result.resolved, false);
      assert.ok(!unchanged.result.resolved);
      return {
        result: "fail-closed",
        errorCode: unchanged.result.error.code,
        canonicalIdentity: "not-created",
        localIdentity: "not-created",
        bindingMutation: "explicit-only",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(context);
    }
  },

  "moved-checkout-explicit-rebind": async () => {
    const context = createRegistry(
      "moved",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "moved-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      const receipt = await registerBinding(context, "/srv/lex-old");
      const before = await resolve(context, request(context, "/srv/lex-old"));
      assert.ok(before.resolved);
      const receiptsBefore = (await context.registry.inspectReceipts()).length;
      const rebind = await context.registry.rebindBinding({
        bindingId: receipt.bindingId,
        declaration,
        evidence: evidence("/srv/lex-moved"),
        authorityEvidence: {
          schemaVersion: 1,
          authoritySource: "authority:test",
          authorityVersion: "authority-v1" as AuthorityVersion,
          authorityDigest: "sha256:authority" as ContentDigest,
          verifiedAt: NOW,
          expiresAt: CACHE_EXPIRES,
        },
        reboundByPrincipalId: PRINCIPAL_ID,
        reboundAt: "2026-07-18T05:05:00.000Z",
        reason: "Explicit moved-checkout rebind.",
      });
      const after = await resolve(context, request(context, "/srv/lex-moved"));
      assert.ok(after.resolved);
      assert.equal(rebind.action, "rebind");
      assert.equal(before.authorizedScope.tenantId, after.authorizedScope.tenantId);
      assert.equal(before.authorizedScope.workspaceId, after.authorizedScope.workspaceId);
      assert.equal(
        before.invocationContext.binding?.repositoryInstanceId,
        after.invocationContext.binding?.repositoryInstanceId
      );
      return {
        result: "explicit-rebind",
        canonicalIdentity: "preserved",
        localIdentity: "preserved",
        bindingMutation:
          (await context.registry.inspectReceipts()).length === receiptsBefore + 1
            ? "explicit-only"
            : "none",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(context);
    }
  },

  "multiple-wsl-registries": async () => {
    const ubuntu = createRegistry(
      "wsl-ubuntu",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "ubuntu-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    const debian = createRegistry(
      "wsl-debian",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "debian-installation",
        wslDistribution: "Debian",
      })
    );
    try {
      await registerBinding(ubuntu, "/home/guff/src/lex");
      await registerBinding(debian, "/home/guff/src/lex");
      const ubuntuResolution = await receiptsUnchanged(ubuntu.registry, () =>
        resolve(ubuntu, request(ubuntu, "/home/guff/src/lex"))
      );
      const debianResolution = await receiptsUnchanged(debian.registry, () =>
        resolve(debian, request(debian, "/home/guff/src/lex"))
      );
      assert.ok(ubuntuResolution.result.resolved);
      assert.ok(debianResolution.result.resolved);
      assert.equal(
        ubuntuResolution.result.authorizedScope.workspaceId,
        debianResolution.result.authorizedScope.workspaceId
      );
      assert.notEqual(ubuntu.registry.registryInstanceId, debian.registry.registryInstanceId);
      return {
        result: "resolved",
        canonicalIdentity: "shared",
        localIdentity: "distinct",
        bindingMutation:
          ubuntuResolution.unchanged && debianResolution.unchanged ? "none" : "explicit-only",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(ubuntu);
      closeRegistry(debian);
    }
  },

  "same-checkout-cross-surface": async () => {
    const result = await crossSurfaceResolution();
    try {
      assert.ok(result.windowsResult.resolved);
      assert.ok(result.wslResult.resolved);
      assert.equal(
        result.windowsResult.authorizedScope.workspaceId,
        result.wslResult.authorizedScope.workspaceId
      );
      assert.notEqual(result.windows.registryInstanceId, result.wsl.registryInstanceId);
      return {
        result: "resolved",
        canonicalIdentity: "shared",
        localIdentity: "distinct",
        bindingMutation: result.resolutionDidNotMutate ? "none" : "explicit-only",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(result.windows);
      closeRegistry(result.wsl);
    }
  },

  "separate-registry-files": async () => {
    const result = await crossSurfaceResolution();
    try {
      const windowsLocation = resolveLocalRegistryLocation({
        executionSurface: result.windows.surface,
        homeDirectory: "C:\\Users\\Guff",
        localAppDataDirectory: "C:\\Users\\Guff\\AppData\\Local",
      });
      const wslLocation = resolveLocalRegistryLocation({
        executionSurface: result.wsl.surface,
        homeDirectory: "/home/guff",
        xdgStateDirectory: "/home/guff/.local/state",
      });
      assert.notEqual(windowsLocation.registryPath, wslLocation.registryPath);
      assert.notEqual(result.windows.databasePath, result.wsl.databasePath);
      assert.ok(result.windowsResult.resolved);
      assert.ok(result.wslResult.resolved);
      return {
        result: "resolved",
        canonicalIdentity: "shared",
        localIdentity: "distinct",
        bindingMutation: result.resolutionDidNotMutate ? "none" : "explicit-only",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(result.windows);
      closeRegistry(result.wsl);
    }
  },

  "verified-clone-new-instance": async () => {
    const context = createRegistry(
      "clone",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "clone-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      await registerBinding(context, "/srv/lex", "1");
      const secondReceipt = await registerBinding(context, "/srv/lex-clone", "2");
      const first = await resolve(context, request(context, "/srv/lex"));
      const second = await resolve(context, request(context, "/srv/lex-clone"));
      assert.ok(first.resolved);
      assert.ok(second.resolved);
      assert.equal(first.authorizedScope.workspaceId, second.authorizedScope.workspaceId);
      assert.notEqual(
        first.invocationContext.binding?.repositoryInstanceId,
        second.invocationContext.binding?.repositoryInstanceId
      );
      assert.equal(
        (await context.registry.inspectReceipts()).some(
          ({ receiptId }) => receiptId === secondReceipt.receiptId
        ),
        true
      );
      return {
        result: "resolved",
        canonicalIdentity: "shared",
        localIdentity: "distinct",
        bindingMutation: "explicit-only",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(context);
    }
  },

  "windows-process-via-wsl-interop": async () => {
    const surface = detectExecutionSurface({
      platform: "win32",
      installationRef: "windows-interop-installation",
      wslDistribution: "Ubuntu-24.04",
      launchOrigin: "wsl-interop",
    });
    const location = resolveLocalRegistryLocation({
      executionSurface: surface,
      homeDirectory: "C:\\Users\\Guff",
      localAppDataDirectory: "C:\\Users\\Guff\\AppData\\Local",
      xdgStateDirectory: "/home/guff/.local/state",
    });
    assert.equal(surface.kind, "windows-native");
    assert.equal(location.source, "windows-local-app-data");
    return {
      result: "resolved",
      selectedRegistryRef: "windows",
      canonicalIdentity: "preserved",
      localIdentity: "preserved",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    };
  },

  "worktree-new-instance": async () => {
    const context = createRegistry(
      "worktree",
      detectExecutionSurface({
        platform: "linux",
        installationRef: "worktree-installation",
        wslDistribution: "Ubuntu-24.04",
      })
    );
    try {
      const sharedGit = "sha256:shared-git-common";
      await registerBinding(
        context,
        "/srv/lex",
        "1",
        evidence("/srv/lex", { gitCommonDigest: sharedGit })
      );
      await registerBinding(
        context,
        "/srv/lex-feature",
        "2",
        evidence("/srv/lex-feature", { gitCommonDigest: sharedGit })
      );
      const first = await resolve(
        context,
        request(context, "/srv/lex", evidence("/srv/lex", { gitCommonDigest: sharedGit }))
      );
      const second = await resolve(
        context,
        request(
          context,
          "/srv/lex-feature",
          evidence("/srv/lex-feature", { gitCommonDigest: sharedGit })
        )
      );
      assert.ok(first.resolved);
      assert.ok(second.resolved);
      assert.equal(first.authorizedScope.workspaceId, second.authorizedScope.workspaceId);
      assert.notEqual(
        first.invocationContext.binding?.repositoryInstanceId,
        second.invocationContext.binding?.repositoryInstanceId
      );
      return {
        result: "resolved",
        canonicalIdentity: "shared",
        localIdentity: "distinct",
        bindingMutation: "explicit-only",
        diagnosticChangesOutcome: false,
      };
    } finally {
      closeRegistry(context);
    }
  },
};

describe("runtime-scope implementation conformance", () => {
  for (const fixture of RUNTIME_SCOPE_CONFORMANCE_FIXTURES) {
    test(fixture.id, async () => {
      const actual = await handlers[fixture.id]();
      assert.deepEqual(actual, fixture.expected);
    });
  }
});
