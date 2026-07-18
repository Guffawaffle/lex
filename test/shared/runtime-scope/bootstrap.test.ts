import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import {
  InMemoryAuthorityDirectory,
  RUNTIME_DIAGNOSTIC_CAPABILITY,
  SqliteLocalBindingRegistry,
  WORKSPACE_AUTHORITY_ERROR_CODES,
  captureTrustedBootstrapInput,
  createTrustedRuntimeScopeBootstrap,
  registryLocationFromBootstrap,
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
  type RuntimeScopeDiscoveryAdapterV1,
  type ScopeVersion,
  type TenantId,
  type TenantSlug,
  type TraceId,
  type TrustedRuntimeEntrypoint,
  type WorkspaceId,
  type WorkspaceInstanceId,
  type WorkspaceSlug,
} from "../../../src/shared/runtime-scope/index.js";

const NOW = "2026-07-18T12:00:00.000Z";
const CACHE_EXPIRES = "2026-07-18T12:30:00.000Z";
const GRANT_EXPIRES = "2026-07-18T13:00:00.000Z";
const AUTHENTICATION_REF = "auth:guff" as AuthenticationRef;
const PRINCIPAL_ID = "principal-guff" as PrincipalId;
const TENANT_ID = "tenant-platform" as TenantId;
const TENANT_SLUG = "platform-dogfood" as TenantSlug;
const WORKSPACE_ID = "workspace-lex" as WorkspaceId;
const WORKSPACE_SLUG = "lex" as WorkspaceSlug;
const REPOSITORY_ID = "repository-lex" as RepositoryId;
const REPOSITORY_SLUG = "lex" as RepositorySlug;
const FRAME_READ = "frame:read" as CapabilityId;

const declaration: RepositoryDeclarationV1 = {
  schemaVersion: 1,
  repositoryId: REPOSITORY_ID,
  repositorySlug: REPOSITORY_SLUG,
};

function repositoryEvidence(projectRoot: string): RepositoryInstanceEvidenceV1 {
  return {
    schemaVersion: 1,
    canonicalRoot: projectRoot,
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

function authoritySeed(capabilities: readonly CapabilityId[]): InMemoryAuthoritySeedV1 {
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
          capabilities,
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

function deterministicIds(): LocalRegistryIdFactoryV1 {
  return {
    bindingId: () => "binding-1" as BindingId,
    receiptId: () => "receipt-1" as BindingReceiptId,
  };
}

interface BootstrapFixture {
  readonly root: string;
  readonly projectRoot: string;
  readonly bootstrap: ReturnType<typeof captureTrustedBootstrapInput>;
  readonly databasePath: string;
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;
  readonly discoveryEntrypoints: TrustedRuntimeEntrypoint[];
  readonly discovery: RuntimeScopeDiscoveryAdapterV1;
  close(): void;
}

async function createFixture(options: { register?: boolean } = {}): Promise<BootstrapFixture> {
  const root = mkdtempSync(join(tmpdir(), "lex-trusted-bootstrap-"));
  const projectRoot = join(root, "repo");
  mkdirSync(projectRoot, { recursive: true });
  const bootstrap = captureTrustedBootstrapInput({
    argv: ["node", "lex", "recall"],
    cwd: projectRoot,
    environment: {
      HOME: root,
      XDG_STATE_HOME: join(root, "state"),
      LEX_WORKSPACE_ROOT: projectRoot,
      LEX_REGISTRY_PATH: join(root, "forbidden-registry.db"),
      LEX_DATABASE_URL: "postgresql://secret",
    },
    platform: "linux",
    installationRef: "/usr/local/bin/node",
    capturedAt: NOW,
  });
  const databasePath = registryLocationFromBootstrap(bootstrap).registryPath;
  const registryInstanceId = "registry-linux" as RegistryInstanceId;
  const executionSurfaceId = "surface-linux" as ExecutionSurfaceId;
  const registry = SqliteLocalBindingRegistry.initialize({
    databasePath,
    registryInstanceId,
    executionSurfaceId,
    executionSurface: bootstrap.executionSurface,
    createdAt: NOW,
    now: () => NOW,
    idFactory: deterministicIds(),
  });
  if (options.register !== false) {
    await registry.registerBinding({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      repositoryId: REPOSITORY_ID,
      repositoryInstanceId: "repository-instance-linux" as RepositoryInstanceId,
      workspaceInstanceId: "workspace-instance-linux" as WorkspaceInstanceId,
      evidence: repositoryEvidence(projectRoot),
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
  registry.close();

  const discoveryEntrypoints: TrustedRuntimeEntrypoint[] = [];
  const discovery: RuntimeScopeDiscoveryAdapterV1 = {
    async discover(request) {
      discoveryEntrypoints.push(request.entrypoint);
      return {
        schemaVersion: 1,
        projectRoot,
        authenticationRef: AUTHENTICATION_REF,
        requestedWorkspace: { workspaceId: WORKSPACE_ID },
        repositoryDeclaration: declaration,
        repositoryEvidence: repositoryEvidence(projectRoot),
        authorityMode: "shared",
        authoritySource: "authority:test",
        authorityCacheExpiresAt: CACHE_EXPIRES,
      };
    },
  };

  return {
    root,
    projectRoot,
    bootstrap,
    databasePath,
    registryInstanceId,
    executionSurfaceId,
    discoveryEntrypoints,
    discovery,
    close: () => rmSync(root, { recursive: true, force: true }),
  };
}

function request(
  fixture: BootstrapFixture,
  entrypoint: TrustedRuntimeEntrypoint,
  diagnosticRequest?: { readonly schemaVersion: 1; readonly level: "summary" | "full" }
) {
  return {
    schemaVersion: 1 as const,
    entrypoint,
    bootstrap: fixture.bootstrap,
    runtimeId: "runtime-1" as RuntimeId,
    traceId: "trace-1" as TraceId,
    requestedCapabilities: [FRAME_READ],
    ...(diagnosticRequest ? { diagnosticRequest } : {}),
  };
}

describe("trusted runtime-scope bootstrap", () => {
  test("captures one deeply immutable allow-listed snapshot", () => {
    const environment: Record<string, string> = {
      HOME: "/home/guff",
      XDG_STATE_HOME: "/home/guff/.state",
      LEX_WORKSPACE_ROOT: "/srv/lex",
      LEX_REGISTRY_PATH: "/tmp/authority-substitution.db",
      LEX_DATABASE_URL: "postgresql://secret",
    };
    const argv = ["node", "lex", "recall"];
    const bootstrap = captureTrustedBootstrapInput({
      argv,
      cwd: "/srv/lex",
      environment,
      platform: "linux",
      installationRef: "/usr/bin/node",
      capturedAt: NOW,
    });

    argv.push("--later");
    environment.HOME = "/changed";
    assert.deepEqual(bootstrap.argv, ["node", "lex", "recall"]);
    assert.equal(bootstrap.allowedEnvironment.HOME, "/home/guff");
    assert.equal("LEX_REGISTRY_PATH" in bootstrap.allowedEnvironment, false);
    assert.equal("LEX_DATABASE_URL" in bootstrap.allowedEnvironment, false);
    assert.equal(Object.isFrozen(bootstrap), true);
    assert.equal(Object.isFrozen(bootstrap.argv), true);
    assert.equal(Object.isFrozen(bootstrap.allowedEnvironment), true);
    assert.equal(Object.isFrozen(bootstrap.executionSurface), true);
  });

  test("gives CLI and MCP equivalent attenuated scope without mutating registry state", async () => {
    const fixture = await createFixture();
    try {
      const authority = new InMemoryAuthorityDirectory(
        authoritySeed([FRAME_READ, RUNTIME_DIAGNOSTIC_CAPABILITY]),
        () => NOW
      );
      const bootstrap = createTrustedRuntimeScopeBootstrap({
        authorityDirectory: authority,
        discovery: fixture.discovery,
      });

      const cli = await bootstrap.resolve(request(fixture, "cli"));
      const mcp = await bootstrap.resolve(request(fixture, "mcp"));
      const empty = await bootstrap.resolve({
        ...request(fixture, "cli"),
        requestedCapabilities: [],
      });
      assert.equal(cli.resolved, true);
      assert.equal(mcp.resolved, true);
      assert.equal(empty.resolved, true);
      if (!cli.resolved || !mcp.resolved || !empty.resolved) return;
      assert.deepEqual(cli.authorizedScope, mcp.authorizedScope);
      assert.deepEqual(cli.authorizedScope.capabilities, [FRAME_READ]);
      assert.deepEqual(empty.authorizedScope.capabilities, []);
      assert.equal("diagnostics" in cli, false);
      assert.equal("diagnostics" in mcp, false);
      assert.deepEqual(fixture.discoveryEntrypoints, ["cli", "mcp", "cli"]);

      const registry = SqliteLocalBindingRegistry.open({
        databasePath: fixture.databasePath,
        executionSurface: fixture.bootstrap.executionSurface,
      });
      assert.equal((await registry.inspectBindings()).length, 1);
      assert.equal((await registry.inspectReceipts()).length, 1);
      registry.close();
    } finally {
      fixture.close();
    }
  });

  test("keeps full diagnostics opt-in, redacted, and behavior-neutral", async () => {
    const fixture = await createFixture();
    try {
      const withoutDiagnosticGrant = createTrustedRuntimeScopeBootstrap({
        authorityDirectory: new InMemoryAuthorityDirectory(authoritySeed([FRAME_READ]), () => NOW),
        discovery: fixture.discovery,
      });
      const redacted = await withoutDiagnosticGrant.resolve(
        request(fixture, "cli", { schemaVersion: 1, level: "full" })
      );
      assert.equal(redacted.resolved, true);
      assert.ok(redacted.diagnostics);
      assert.equal(redacted.diagnostics.authority, undefined);
      assert.equal(redacted.diagnostics.binding, undefined);
      assert.ok(
        redacted.diagnostics.redactions.some(
          ({ field, reason }) => field === "authority" && reason === "capability-required"
        )
      );

      const withDiagnosticGrant = createTrustedRuntimeScopeBootstrap({
        authorityDirectory: new InMemoryAuthorityDirectory(
          authoritySeed([FRAME_READ, RUNTIME_DIAGNOSTIC_CAPABILITY]),
          () => NOW
        ),
        discovery: fixture.discovery,
      });
      const detailed = await withDiagnosticGrant.resolve(
        request(fixture, "mcp", { schemaVersion: 1, level: "full" })
      );
      assert.equal(detailed.resolved, true);
      assert.ok(detailed.diagnostics?.authority);
      assert.ok(detailed.diagnostics.binding);
      assert.equal(JSON.stringify(detailed.diagnostics).includes(fixture.projectRoot), false);
      assert.equal(JSON.stringify(detailed.diagnostics).includes(AUTHENTICATION_REF), false);
      assert.deepEqual(
        detailed.resolved ? detailed.authorizedScope.capabilities : [],
        redacted.resolved ? redacted.authorizedScope.capabilities : []
      );
    } finally {
      fixture.close();
    }
  });

  test("fails closed without creating a missing local registry", async () => {
    const fixture = await createFixture();
    try {
      rmSync(fixture.databasePath, { force: true });
      const bootstrap = createTrustedRuntimeScopeBootstrap({
        authorityDirectory: new InMemoryAuthorityDirectory(authoritySeed([FRAME_READ]), () => NOW),
        discovery: fixture.discovery,
      });
      const result = await bootstrap.resolve(
        request(fixture, "cli", { schemaVersion: 1, level: "summary" })
      );

      assert.equal(result.resolved, false);
      if (result.resolved) return;
      assert.equal(result.error.code, WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND);
      assert.equal(result.diagnostics?.decisions[0]?.code, result.error.code);
      assert.throws(() =>
        SqliteLocalBindingRegistry.open({
          databasePath: fixture.databasePath,
          executionSurface: fixture.bootstrap.executionSurface,
        })
      );
    } finally {
      fixture.close();
    }
  });

  test("marks local-offline authority as bounded and still requires expiring evidence", async () => {
    const fixture = await createFixture();
    try {
      const offlineDiscovery: RuntimeScopeDiscoveryAdapterV1 = {
        async discover(request) {
          const discovered = await fixture.discovery.discover(request);
          return {
            ...discovered,
            authorityMode: "local-offline",
          };
        },
      };
      const bootstrap = createTrustedRuntimeScopeBootstrap({
        authorityDirectory: new InMemoryAuthorityDirectory(authoritySeed([FRAME_READ]), () => NOW),
        discovery: offlineDiscovery,
      });
      const result = await bootstrap.resolve(
        request(fixture, "cli", { schemaVersion: 1, level: "summary" })
      );

      assert.equal(result.resolved, true);
      assert.equal(result.diagnostics?.warnings[0]?.code, "LEX_LOCAL_OFFLINE_AUTHORITY");
    } finally {
      fixture.close();
    }
  });

  test("rejects future bootstrap versions before discovery", async () => {
    const fixture = await createFixture();
    try {
      const bootstrap = createTrustedRuntimeScopeBootstrap({
        authorityDirectory: new InMemoryAuthorityDirectory(authoritySeed([FRAME_READ]), () => NOW),
        discovery: fixture.discovery,
      });
      const result = await bootstrap.resolve({
        ...request(fixture, "cli"),
        schemaVersion: 2 as 1,
      });

      assert.equal(result.resolved, false);
      if (result.resolved) return;
      assert.equal(result.error.code, WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH);
      assert.deepEqual(fixture.discoveryEntrypoints, []);
    } finally {
      fixture.close();
    }
  });
});
