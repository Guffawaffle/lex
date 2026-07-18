#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

import { MCPServer } from "../src/memory/mcp_server/server.js";
import {
  FRAME_STORE_CAPABILITIES,
  POSTGRES_FRAME_STORE_SCHEMA_VERSION,
  PostgresFrameStoreAdministration,
  PostgresScopedFrameStoreBackend,
  SCOPED_FRAME_STORE_ERROR_CODES,
  ScopedFrameStoreError,
  type ScopedFrameStore,
} from "../src/memory/store/index.js";
import { run } from "../src/shared/cli/index.js";
import {
  LEX3_DOGFOOD_CANONICAL_IDS,
  POSTGRES_AUTHORITY_SCHEMA_VERSION,
  PostgresAuthorityAdministration,
  PostgresAuthorityDirectory,
  RUNTIME_OPERATION_CAPABILITIES,
  SqliteLocalBindingRegistry,
  createLex3DogfoodAuthorityTopology,
  createTrustedRuntimeScopeEntrypointGuard,
  detectExecutionSurface,
  resolveRuntimeScope,
  type AuthenticationRef,
  type BindingId,
  type BindingReceiptId,
  type BootstrapInputSnapshotV1,
  type CachedAuthorityEvidenceV1,
  type CapabilityId,
  type ContentDigest,
  type DiagnosticEnvelopeV1,
  type ExecutionSurfaceEvidenceV1,
  type ExecutionSurfaceId,
  type LocalRegistryIdFactoryV1,
  type RegistryInstanceId,
  type RepositoryDeclarationV1,
  type RepositoryId,
  type RepositoryInstanceEvidenceV1,
  type RepositoryInstanceId,
  type RuntimeId,
  type RuntimeScopeDiscoveryV1,
  type TenantId,
  type TraceId,
  type WorkspaceId,
  type WorkspaceInstanceId,
  type WorkspaceSelectorV1,
} from "../src/shared/runtime-scope/index.js";
import {
  LEX3_DOGFOOD_ACCEPTANCE_RECEIPT_VERSION,
  LEX3_DOGFOOD_CASE_ORDER,
  LEX3_DOGFOOD_CANONICAL_OUTCOMES,
  assertLex3DogfoodAcceptanceReceipt,
  type Lex3DogfoodAcceptanceCase,
  type Lex3DogfoodAcceptanceCaseResultV1,
  type Lex3DogfoodAcceptanceReceiptV1,
} from "../src/shared/runtime-scope/dogfood-acceptance.js";

interface CanaryOptions {
  readonly administrationConnectionString: string;
  readonly diagnostics: boolean;
  /** Test-only fault injection used to prove cleanup after a matrix failure. */
  readonly failAfterCase?: Lex3DogfoodAcceptanceCase;
  /** Test-only fault injection used to prove honest setup-failure evidence. */
  readonly failBeforeLiveIdentity?: boolean;
}

interface WorkspaceFixture {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly workspaceSlug: string;
  readonly repositoryId: RepositoryId;
  readonly repositorySlug: string;
}

interface SurfaceFixture {
  readonly name: "windows-native" | "wsl";
  readonly platform: NodeJS.Platform;
  readonly root: string;
  readonly surface: ExecutionSurfaceEvidenceV1;
  readonly databasePath: string;
  readonly registryInstanceId: RegistryInstanceId;
  readonly executionSurfaceId: ExecutionSurfaceId;
  registry?: SqliteLocalBindingRegistry;
}

type CanaryPhase = NonNullable<Lex3DogfoodAcceptanceReceiptV1["failure"]>["phase"];

const AUTHENTICATION_REF = "lex3-dogfood-canary-principal" as AuthenticationRef;
const AUTHORITY_SOURCE = "postgres-canary-v1";
const RUNTIME_ID = "lex3-dogfood-runtime" as RuntimeId;
const TRACE_ID = "lex3-dogfood-trace" as TraceId;
const FRAME_CAPABILITIES = Object.freeze([
  FRAME_STORE_CAPABILITIES.READ,
  FRAME_STORE_CAPABILITIES.WRITE,
  FRAME_STORE_CAPABILITIES.DELETE,
] as CapabilityId[]);

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]+$/.test(identifier)) throw new TypeError("Unsafe canary identifier.");
  return `"${identifier}"`;
}

function scopedConnectionString(connectionString: string, schema: string): string {
  const value = new URL(connectionString);
  value.searchParams.set("options", `-c search_path=${schema}`);
  return value.toString();
}

function runtimeConnectionString(
  connectionString: string,
  schema: string,
  role: string,
  password: string
): string {
  const value = new URL(scopedConnectionString(connectionString, schema));
  value.username = role;
  value.password = password;
  return value.toString();
}

function deterministicIds(prefix: string): LocalRegistryIdFactoryV1 {
  let binding = 0;
  let receipt = 0;
  return Object.freeze({
    bindingId: () => `${prefix}-binding-${++binding}` as BindingId,
    receiptId: () => `${prefix}-receipt-${++receipt}` as BindingReceiptId,
  });
}

function evidence(
  surface: SurfaceFixture,
  workspace: WorkspaceFixture
): RepositoryInstanceEvidenceV1 {
  return Object.freeze({
    schemaVersion: 1,
    canonicalRoot: surface.root,
    manifestDigest: `sha256:manifest-${workspace.repositorySlug}` as ContentDigest,
    gitCommonDirectoryDigest:
      `sha256:git-${surface.name}-${workspace.repositorySlug}` as ContentDigest,
    filesystemEvidenceDigest:
      `sha256:filesystem-${surface.name}-${workspace.repositorySlug}` as ContentDigest,
    provider: Object.freeze({
      provider: "github",
      providerRepositoryId: `Guffawaffle/${workspace.repositorySlug}`,
      remoteDigest: `sha256:remote-${workspace.repositorySlug}` as ContentDigest,
    }),
  });
}

function declaration(workspace: WorkspaceFixture): RepositoryDeclarationV1 {
  return Object.freeze({
    schemaVersion: 1,
    repositoryId: workspace.repositoryId,
    repositorySlug: workspace.repositorySlug as RepositoryDeclarationV1["repositorySlug"],
  });
}

function workspaceFixtures(): readonly WorkspaceFixture[] {
  const topology = createLex3DogfoodAuthorityTopology(AUTHENTICATION_REF);
  return Object.freeze(
    topology.workspaces.map((workspace) => {
      const association = topology.workspaceRepositories.find(
        ({ workspaceId }) => workspaceId === workspace.workspaceId
      );
      assert.ok(association);
      const repository = topology.repositories.find(
        ({ repositoryId }) => repositoryId === association.repositoryId
      );
      assert.ok(repository);
      return Object.freeze({
        tenantId: workspace.tenantId,
        workspaceId: workspace.workspaceId,
        workspaceSlug: workspace.workspaceSlug,
        repositoryId: repository.repositoryId,
        repositorySlug: repository.repositorySlug,
      });
    })
  );
}

function allFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}

async function captureConsole(action: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...values: unknown[]) => lines.push(values.map(String).join(" "));
  console.error = (...values: unknown[]) => lines.push(values.map(String).join(" "));
  try {
    await action();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return lines.join("\n");
}

function assertCompactAgentOutput(value: unknown, maximumBytes = 8 * 1024): void {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  assert.ok(Buffer.byteLength(serialized, "utf8") <= maximumBytes);
  assert.doesNotMatch(serialized, /diagnostics|tenantId|workspaceId|registryInstanceId/);
}

function safeFailureCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (/^[A-Z0-9_]{1,24}$/.test(code)) return `POSTGRES_${code}`;
  }
  if (error instanceof assert.AssertionError) return "ASSERTION_FAILED";
  if (error instanceof ScopedFrameStoreError) return error.code;
  return "CANARY_FAILED";
}

function caseResults(
  actual: ReadonlyMap<Lex3DogfoodAcceptanceCase, Lex3DogfoodAcceptanceCaseResultV1["actual"]>
): readonly Lex3DogfoodAcceptanceCaseResultV1[] {
  return Object.freeze(
    LEX3_DOGFOOD_CASE_ORDER.map((id) =>
      Object.freeze({
        id,
        expected: LEX3_DOGFOOD_CANONICAL_OUTCOMES[id],
        actual: actual.get(id) ?? "not-run",
      })
    )
  );
}

function postgresBootstrap(
  surface: SurfaceFixture,
  capturedAt: string,
  allowedEnvironment: Readonly<Record<string, string | undefined>> = {}
): BootstrapInputSnapshotV1 {
  return Object.freeze({
    schemaVersion: 1,
    cwd: surface.root,
    argv: Object.freeze(["node", "lex"]),
    allowedEnvironment: Object.freeze({ ...allowedEnvironment }),
    platform: surface.platform,
    executionSurface: surface.surface,
    capturedAt,
  });
}

async function expectRejected(action: Promise<unknown>, pattern?: RegExp): Promise<void> {
  if (pattern) await assert.rejects(action, pattern);
  else await assert.rejects(action);
}

/**
 * Run the Lex 3 GA security gate from explicit runtime handles.
 *
 * The runner never reads process.env. The executable wrapper below is the sole
 * opt-in developer boundary that converts process-local configuration into an
 * explicit connection string.
 */
export async function runLex3PostgresDogfoodCanary(
  options: CanaryOptions
): Promise<Lex3DogfoodAcceptanceReceiptV1> {
  const suffix = `${process.pid}_${randomBytes(5).toString("hex")}`;
  const schema = `lex3_canary_${suffix}`;
  const runtimeRole = `lex3_canary_runtime_${suffix}`;
  const runtimePassword = randomBytes(32).toString("base64url");
  const registryRoot = mkdtempSync(join(tmpdir(), "lex3-registry-canary-"));
  const exportRoot = mkdtempSync(join(tmpdir(), "lex3-export-canary-"));
  const now = new Date();
  const capturedAt = now.toISOString();
  const cacheExpiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const workspaces = workspaceFixtures();
  const actual = new Map<Lex3DogfoodAcceptanceCase, Lex3DogfoodAcceptanceCaseResultV1["actual"]>();
  let currentCase: Lex3DogfoodAcceptanceCase | undefined;
  let phase: CanaryPhase = "setup";
  let step = "connect";
  let failurePhase: CanaryPhase | undefined;
  let failureCode: string | undefined;
  let failure: unknown;
  let scopeTransitions = 0;
  let backendIdentity: string | undefined;
  let normalOutputCompactProven = false;
  let diagnosticsOptInProven = false;
  let diagnosticsRedactedProven = false;
  let adminPool: Pool | undefined;
  let scopedAdminPool: Pool | undefined;
  let runtimePool: Pool | undefined;
  let frameAdministration: PostgresFrameStoreAdministration | undefined;
  let frameBackend: PostgresScopedFrameStoreBackend | undefined;
  let mcp: MCPServer | undefined;
  let schemaCreated = false;
  let roleCreated = false;
  const cleanup = {
    schemaDropped: false,
    runtimeRoleDropped: false,
    registryFixturesRemoved: false,
    exportFixturesRemoved: false,
  };
  const surfaces: SurfaceFixture[] = [
    {
      name: "windows-native",
      platform: "win32",
      root: "C:\\lex3-dogfood\\repository",
      surface: detectExecutionSurface({
        platform: "win32",
        installationRef: "C:\\Program Files\\nodejs\\node.exe",
      }),
      databasePath: join(registryRoot, "windows-registry.db"),
      registryInstanceId: "windows-canary-registry" as RegistryInstanceId,
      executionSurfaceId: "windows-canary-surface" as ExecutionSurfaceId,
    },
    {
      name: "wsl",
      platform: "linux",
      root: "/opt/lex3-dogfood/repository",
      surface: detectExecutionSurface({
        platform: "linux",
        installationRef: "/usr/bin/node",
        wslDistribution: "Ubuntu-24.04",
      }),
      databasePath: join(registryRoot, "wsl-registry.db"),
      registryInstanceId: "wsl-canary-registry" as RegistryInstanceId,
      executionSurfaceId: "wsl-canary-surface" as ExecutionSurfaceId,
    },
  ];

  const runCase = async <T>(
    id: Lex3DogfoodAcceptanceCase,
    action: () => Promise<T> | T
  ): Promise<T> => {
    currentCase = id;
    step = `case-${id}`;
    try {
      const result = await action();
      if (options.failAfterCase === id) {
        throw new Error("Intentional dogfood cleanup probe.");
      }
      actual.set(id, LEX3_DOGFOOD_CANONICAL_OUTCOMES[id]);
      currentCase = undefined;
      return result;
    } catch (error) {
      actual.set(id, "failed");
      throw error;
    }
  };

  try {
    step = "connect";
    adminPool = new Pool({
      connectionString: options.administrationConnectionString,
      max: 2,
      allowExitOnIdle: true,
    });
    if (options.failBeforeLiveIdentity) {
      throw new Error("Intentional dogfood setup-evidence probe.");
    }
    const liveIdentity = await adminPool.query<{
      database_name: string;
      system_identifier: string;
    }>(`
      SELECT current_database() AS database_name,
             system_identifier::text AS system_identifier
      FROM pg_control_system()
    `);
    assert.ok(liveIdentity.rows[0]);
    backendIdentity = `postgres-live-v1:sha256:${createHash("sha256")
      .update(
        JSON.stringify([liveIdentity.rows[0].system_identifier, liveIdentity.rows[0].database_name])
      )
      .digest("hex")}`;
    step = "create-isolated-schema-and-role";
    const roleStatement = await adminPool.query<{ sql: string }>(
      `SELECT format(
         'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
         $1::text,
         $2::text
       ) AS sql`,
      [runtimeRole, runtimePassword]
    );
    assert.ok(roleStatement.rows[0]?.sql);
    await adminPool.query(roleStatement.rows[0].sql);
    roleCreated = true;
    await adminPool.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    schemaCreated = true;

    scopedAdminPool = new Pool({
      connectionString: scopedConnectionString(options.administrationConnectionString, schema),
      max: 2,
      allowExitOnIdle: true,
    });
    const liveScopedAdminPool = scopedAdminPool;
    step = "migrate-frame-store";
    frameAdministration = new PostgresFrameStoreAdministration(liveScopedAdminPool);
    await frameAdministration.migrate();
    step = "migrate-and-seed-authority";
    const authorityAdministration = new PostgresAuthorityAdministration(liveScopedAdminPool);
    const authorityMigration = await authorityAdministration.migrate(runtimeRole);
    assert.equal(authorityMigration.targetSchemaVersion, POSTGRES_AUTHORITY_SCHEMA_VERSION);
    const topology = createLex3DogfoodAuthorityTopology(AUTHENTICATION_REF);
    const seedReceipt = await authorityAdministration.seedTopology(topology);
    assert.deepEqual(seedReceipt.counts, {
      principals: 1,
      authenticationBindings: 1,
      tenants: 2,
      workspaces: 5,
      repositories: 5,
      workspaceRepositories: 5,
      memberships: 2,
      grants: 5,
    });

    step = "grant-runtime-privileges";
    await adminPool.query(`
      GRANT USAGE ON SCHEMA ${quoteIdentifier(schema)} TO ${quoteIdentifier(runtimeRole)};
      GRANT SELECT ON ${quoteIdentifier(schema)}.lex_frame_store_migrations TO ${quoteIdentifier(runtimeRole)};
      GRANT SELECT, INSERT, UPDATE, DELETE ON ${quoteIdentifier(schema)}.frames TO ${quoteIdentifier(runtimeRole)};
      GRANT EXECUTE ON FUNCTION ${quoteIdentifier(schema)}.lex_runtime_scope_is_valid() TO ${quoteIdentifier(runtimeRole)};
      GRANT EXECUTE ON FUNCTION ${quoteIdentifier(schema)}.lex_runtime_scope_matches(uuid, uuid) TO ${quoteIdentifier(runtimeRole)};
    `);

    runtimePool = new Pool({
      connectionString: runtimeConnectionString(
        options.administrationConnectionString,
        schema,
        runtimeRole,
        runtimePassword
      ),
      max: 1,
      allowExitOnIdle: true,
    });
    const liveRuntimePool = runtimePool;
    step = "verify-runtime-boundary";
    const runtimeBoundary = await liveRuntimePool.query<{
      session_role: string;
      current_role: string;
      superuser: boolean;
      bypassrls: boolean;
      owns_frames: boolean;
    }>(`
      SELECT session_user AS session_role,
        current_user AS current_role,
        role.rolsuper AS superuser,
        role.rolbypassrls AS bypassrls,
        frames.relowner = role.oid AS owns_frames
      FROM pg_roles role
      CROSS JOIN pg_class frames
      WHERE role.rolname = current_user AND frames.oid = 'frames'::regclass
    `);
    assert.deepEqual(runtimeBoundary.rows[0], {
      session_role: runtimeRole,
      current_role: runtimeRole,
      superuser: false,
      bypassrls: false,
      owns_frames: false,
    });
    await liveRuntimePool.query("RESET ROLE");
    const resetBoundary = await liveRuntimePool.query<{
      session_role: string;
      current_role: string;
    }>("SELECT session_user AS session_role, current_user AS current_role");
    assert.deepEqual(resetBoundary.rows[0], {
      session_role: runtimeRole,
      current_role: runtimeRole,
    });
    frameBackend = new PostgresScopedFrameStoreBackend(liveRuntimePool);
    const liveFrameBackend = frameBackend;
    const authorityDirectory = new PostgresAuthorityDirectory(liveRuntimePool);
    step = "resolve-principal";
    const principal = await authorityDirectory.resolvePrincipal({
      authenticationRef: AUTHENTICATION_REF,
    });
    assert.equal(principal?.principalId, LEX3_DOGFOOD_CANONICAL_IDS.principalId);

    step = "create-local-registry-fixtures";
    for (const surface of surfaces) {
      surface.registry = SqliteLocalBindingRegistry.initialize({
        databasePath: surface.databasePath,
        registryInstanceId: surface.registryInstanceId,
        executionSurfaceId: surface.executionSurfaceId,
        executionSurface: surface.surface,
        createdAt: capturedAt,
        now: () => capturedAt,
        idFactory: deterministicIds(surface.name),
      });
      for (const workspace of workspaces) {
        const decision = await authorityDirectory.authorizeWorkspace({
          principalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
          workspace: { workspaceId: workspace.workspaceId },
          requestedCapabilities: [RUNTIME_OPERATION_CAPABILITIES.FRAME_READ],
        });
        assert.equal(decision.authorized, true);
        if (!decision.authorized) throw new Error("Authority fixture was not authorized.");
        const authorityEvidence: CachedAuthorityEvidenceV1 = Object.freeze({
          schemaVersion: 1,
          authoritySource: AUTHORITY_SOURCE,
          authorityVersion: decision.grant.authorityVersion,
          authorityDigest: decision.grant.authorityDigest,
          verifiedAt: decision.grant.verifiedAt,
          expiresAt: cacheExpiresAt,
        });
        await surface.registry.registerBinding({
          tenantId: workspace.tenantId,
          workspaceId: workspace.workspaceId,
          repositoryId: workspace.repositoryId,
          repositoryInstanceId:
            `${surface.name}-${workspace.workspaceSlug}-repository-instance` as RepositoryInstanceId,
          workspaceInstanceId:
            `${surface.name}-${workspace.workspaceSlug}-workspace-instance` as WorkspaceInstanceId,
          evidence: evidence(surface, workspace),
          authorityEvidence,
          registeredByPrincipalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        });
      }
    }

    const resolveFixture = async (
      surface: SurfaceFixture,
      workspace: WorkspaceFixture,
      overrides: Partial<{
        projectRoot: string;
        requestedWorkspace: WorkspaceSelectorV1;
        repositoryEvidence: RepositoryInstanceEvidenceV1;
        branch: string;
        allowedEnvironment: Readonly<Record<string, string | undefined>>;
      }> = {}
    ) => {
      assert.ok(surface.registry);
      return resolveRuntimeScope(
        {
          schemaVersion: 1,
          bootstrap: postgresBootstrap(surface, capturedAt, overrides.allowedEnvironment ?? {}),
          projectRoot: overrides.projectRoot ?? surface.root,
          authenticationRef: AUTHENTICATION_REF,
          requestedWorkspace:
            overrides.requestedWorkspace ?? ({ workspaceId: workspace.workspaceId } as const),
          requestedCapabilities: FRAME_CAPABILITIES,
          repositoryDeclaration: declaration(workspace),
          repositoryEvidence: overrides.repositoryEvidence ?? evidence(surface, workspace),
          runtimeSurface: {
            schemaVersion: 1,
            registryInstanceId: surface.registry.registryInstanceId,
            executionSurfaceId: surface.registry.executionSurfaceId,
            runtimeId: RUNTIME_ID,
          },
          authoritySource: AUTHORITY_SOURCE,
          authorityCacheExpiresAt: cacheExpiresAt,
          sourceRevision: { branch: overrides.branch ?? "main" },
        },
        { authorityDirectory, localRegistry: surface.registry }
      );
    };

    phase = "matrix";
    await runCase("windows-wsl-canonical-parity", async () => {
      for (const workspace of workspaces) {
        const windows = await resolveFixture(surfaces[0]!, workspace);
        scopeTransitions += 1;
        const wsl = await resolveFixture(surfaces[1]!, workspace);
        scopeTransitions += 1;
        assert.equal(windows.resolved, true);
        assert.equal(wsl.resolved, true);
        if (!windows.resolved || !wsl.resolved) throw new Error("Surface fixture did not resolve.");
        assert.deepEqual(
          [windows.authorizedScope.tenantId, windows.authorizedScope.workspaceId],
          [wsl.authorizedScope.tenantId, wsl.authorizedScope.workspaceId]
        );
        assert.equal(windows.invocationContext.binding?.repositoryId, workspace.repositoryId);
        assert.equal(wsl.invocationContext.binding?.repositoryId, workspace.repositoryId);
        assert.equal(
          windows.invocationContext.binding?.repositoryId,
          wsl.invocationContext.binding?.repositoryId
        );
        assert.notEqual(
          windows.invocationContext.binding?.registryInstanceId,
          wsl.invocationContext.binding?.registryInstanceId
        );
      }
    });

    const stores: Array<{ workspace: WorkspaceFixture; store: ScopedFrameStore }> = [];
    for (const workspace of workspaces) {
      const decision = await authorityDirectory.authorizeWorkspace({
        principalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        workspace: { workspaceId: workspace.workspaceId },
        requestedCapabilities: FRAME_CAPABILITIES,
      });
      assert.equal(decision.authorized, true);
      if (!decision.authorized) throw new Error("Workspace scope was not authorized.");
      stores.push({ workspace, store: liveFrameBackend.bind(decision.grant) });
    }

    const collisionFrame = {
      id: "shared-frame-id",
      timestamp: capturedAt,
      branch: "lex-3-ga",
      module_scope: ["memory/store/postgres"],
      summary_caption: "Shared collision content",
      reference_point: "lex3 dogfood shared collision",
      status_snapshot: { next_action: "prove scoped isolation" },
    };
    await runCase("create", async () => {
      for (const { store } of stores) await store.saveFrame(collisionFrame);
      for (const { store } of stores) assert.equal(await store.getFrameCount(), 1);
    });
    await runCase("cross-workspace-identifier-collision", async () => {
      assert.equal((await stores[0]!.store.getFrameById(collisionFrame.id))?.id, collisionFrame.id);
      assert.equal((await stores[1]!.store.getFrameById(collisionFrame.id))?.id, collisionFrame.id);
    });
    await runCase("cross-tenant-identifier-collision", async () => {
      assert.equal((await stores[0]!.store.getFrameById(collisionFrame.id))?.id, collisionFrame.id);
      assert.equal((await stores[2]!.store.getFrameById(collisionFrame.id))?.id, collisionFrame.id);
    });
    await runCase("cross-workspace-content-collision", async () => {
      assert.equal(
        (await stores[0]!.store.getFrameById(collisionFrame.id))?.summary_caption,
        collisionFrame.summary_caption
      );
      assert.equal(
        (await stores[1]!.store.getFrameById(collisionFrame.id))?.summary_caption,
        collisionFrame.summary_caption
      );
    });
    await runCase("cross-tenant-content-collision", async () => {
      assert.equal(
        (await stores[0]!.store.getFrameById(collisionFrame.id))?.reference_point,
        collisionFrame.reference_point
      );
      assert.equal(
        (await stores[2]!.store.getFrameById(collisionFrame.id))?.reference_point,
        collisionFrame.reference_point
      );
    });

    await runCase("recall-get", async () => {
      for (const { store } of stores) {
        assert.equal(
          (await store.getFrameById(collisionFrame.id))?.summary_caption,
          collisionFrame.summary_caption
        );
      }
    });
    await runCase("list", async () => {
      for (const { store } of stores) {
        assert.deepEqual(
          (await store.listFrames({ limit: 10 })).frames.map(({ id }) => id),
          [collisionFrame.id]
        );
      }
    });
    await runCase("search", async () => {
      for (const { store } of stores) {
        assert.deepEqual(
          (await store.searchFrames({ query: "lex3 dogfood shared collision", exact: true })).map(
            ({ id }) => id
          ),
          [collisionFrame.id]
        );
      }
    });
    await runCase("update", async () => {
      for (const { workspace, store } of stores) {
        assert.equal(
          await store.updateFrame(collisionFrame.id, {
            summary_caption: `isolated-${workspace.workspaceSlug}`,
          }),
          true
        );
        assert.equal(
          (await store.getFrameById(collisionFrame.id))?.summary_caption,
          `isolated-${workspace.workspaceSlug}`
        );
      }
    });
    await runCase("delete", async () => {
      for (const { workspace, store } of stores) {
        const id = `delete-${workspace.workspaceSlug}`;
        await store.saveFrame({
          ...collisionFrame,
          id,
          summary_caption: `delete-${workspace.workspaceSlug}`,
        });
        assert.equal(await store.deleteFrame(id), true);
        assert.equal(await store.getFrameById(id), null);
      }
    });
    await runCase("count", async () => {
      for (const { store } of stores) assert.equal(await store.getFrameCount(), 1);
    });
    await runCase("statistics", async () => {
      for (const { store } of stores) {
        const stats = await store.getStats(true);
        assert.equal(stats.totalFrames, 1);
        assert.equal(stats.moduleDistribution?.["memory/store/postgres"], 1);
      }
    });

    await runCase("existence-leak", async () => {
      await stores[0]!.store.saveFrame({
        ...collisionFrame,
        id: "platform-lex-only",
        summary_caption: "isolated-lex-sentinel",
        reference_point: "lex workspace sentinel",
      });
      for (const { store } of stores.slice(1)) {
        assert.equal(await store.getFrameById("platform-lex-only"), null);
        assert.equal(
          await store.updateFrame("platform-lex-only", { summary_caption: "spoofed" }),
          false
        );
        assert.equal(await store.deleteFrame("platform-lex-only"), false);
        assert.equal(
          (await store.searchFrames({ query: "workspace sentinel", exact: true })).length,
          0
        );
        assert.equal(await store.getFrameCount(), 1);
      }
    });

    await runCase("pool-scope-alternation", async () => {
      for (let round = 0; round < 8; round += 1) {
        for (const { workspace, store } of stores) {
          scopeTransitions += 1;
          assert.equal(
            (await store.getFrameById(collisionFrame.id))?.summary_caption,
            `isolated-${workspace.workspaceSlug}`
          );
        }
      }
    });

    const rawScopedTransaction = async (client: PoolClient): Promise<void> => {
      await client.query("BEGIN");
      await client.query(
        `SELECT set_config('lex.tenant_id', $1, true), set_config('lex.workspace_id', $2, true), set_config('lex.principal_id', $3, true)`,
        [
          workspaces[0]!.tenantId,
          workspaces[0]!.workspaceId,
          LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        ]
      );
    };

    let client: PoolClient;
    await runCase("transaction-rollback", async () => {
      client = await liveRuntimePool.connect();
      try {
        await rawScopedTransaction(client);
        await client.query(
          `INSERT INTO frames (tenant_id, workspace_id, creator_principal_id, scope_version, id, "timestamp", branch, module_scope, summary_caption, reference_point, status_snapshot)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'dogfood-scope-v1', 'rollback-probe', $4, 'lex-3-ga', ARRAY['memory/store/postgres'], 'rollback probe', 'rollback probe', '{"next_action":"rollback"}'::jsonb)`,
          [
            workspaces[0]!.tenantId,
            workspaces[0]!.workspaceId,
            LEX3_DOGFOOD_CANONICAL_IDS.principalId,
            capturedAt,
          ]
        );
        await client.query("ROLLBACK");
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
      assert.equal(await stores[0]!.store.getFrameById("rollback-probe"), null);
    });

    await runCase("transaction-error", async () => {
      client = await liveRuntimePool.connect();
      try {
        await rawScopedTransaction(client);
        await expectRejected(
          client.query(
            `INSERT INTO frames (tenant_id, workspace_id, creator_principal_id, scope_version, id)
             VALUES ($1::uuid, $2::uuid, $3::uuid, 'dogfood-scope-v1', 'invalid-probe')`,
            [
              workspaces[0]!.tenantId,
              workspaces[0]!.workspaceId,
              LEX3_DOGFOOD_CANONICAL_IDS.principalId,
            ]
          )
        );
        await client.query("ROLLBACK");
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    });

    let cancelledBackendPid = 0;
    await runCase("transaction-cancellation", async () => {
      client = await liveRuntimePool.connect();
      try {
        await rawScopedTransaction(client);
        cancelledBackendPid = (
          await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
        ).rows[0]!.pid;
        await client.query("SET LOCAL statement_timeout = '20ms'");
        await expectRejected(client.query("SELECT pg_sleep(1)"));
        await client.query("ROLLBACK");
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
      assert.ok(cancelledBackendPid > 0);
      client = await liveRuntimePool.connect();
      try {
        const unscoped = (
          await client.query<{
            pid: number;
            tenant_id: string | null;
            workspace_id: string | null;
            principal_id: string | null;
          }>(`
            SELECT pg_backend_pid() AS pid,
              current_setting('lex.tenant_id', true) AS tenant_id,
              current_setting('lex.workspace_id', true) AS workspace_id,
              current_setting('lex.principal_id', true) AS principal_id
          `)
        ).rows[0]!;
        assert.equal(unscoped.pid, cancelledBackendPid);
        for (const value of [unscoped.tenant_id, unscoped.workspace_id, unscoped.principal_id]) {
          assert.ok(value === null || value === "");
        }
        assert.equal(
          (await client.query<{ count: string }>("SELECT COUNT(*) AS count FROM frames")).rows[0]
            ?.count,
          "0"
        );
      } finally {
        client.release();
      }
    });
    await runCase("pool-reuse-after-error", async () => {
      assert.equal(
        (await stores[0]!.store.getFrameById(collisionFrame.id))?.summary_caption,
        "isolated-lex"
      );
    });

    await runCase("missing-runtime-scope", async () => {
      assert.equal(
        (await liveRuntimePool.query<{ count: string }>("SELECT COUNT(*) AS count FROM frames"))
          .rows[0]?.count,
        "0"
      );
    });
    await runCase("malformed-runtime-scope", async () => {
      client = await liveRuntimePool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('lex.tenant_id', 'malformed', true)");
        assert.equal(
          (await client.query<{ count: string }>("SELECT COUNT(*) AS count FROM frames")).rows[0]
            ?.count,
          "0"
        );
        await client.query("ROLLBACK");
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    });

    phase = "dispatch";
    let selectedWorkspace = workspaces[0]!;
    const wsl = surfaces[1]!;
    wsl.registry?.close();
    wsl.registry = undefined;
    const discovery = Object.freeze({
      async discover(): Promise<RuntimeScopeDiscoveryV1> {
        return Object.freeze({
          schemaVersion: 1,
          projectRoot: wsl.root,
          authenticationRef: AUTHENTICATION_REF,
          requestedWorkspace: Object.freeze({ workspaceId: selectedWorkspace.workspaceId }),
          repositoryDeclaration: declaration(selectedWorkspace),
          repositoryEvidence: evidence(wsl, selectedWorkspace),
          authorityMode: "shared",
          authoritySource: AUTHORITY_SOURCE,
          authorityCacheExpiresAt: cacheExpiresAt,
          sourceRevision: Object.freeze({ branch: "untrusted-spoofed-branch" }),
        });
      },
    });
    const guard = createTrustedRuntimeScopeEntrypointGuard({
      authorityDirectory,
      discovery,
      registryFactory: {
        openReadOnly(openOptions) {
          const registry = SqliteLocalBindingRegistry.open({
            databasePath: wsl.databasePath,
            executionSurface: openOptions.executionSurface,
            expectedRegistryInstanceId: wsl.registryInstanceId,
            expectedExecutionSurfaceId: wsl.executionSurfaceId,
            access: "read-only",
          });
          return Object.freeze({ registry, close: () => registry.close() });
        },
      },
      process: {
        argv: Object.freeze(["node", "lex"]),
        cwd: wsl.root,
        environment: Object.freeze({ HOME: "/opt/lex3-dogfood", WSL_DISTRO_NAME: "Ubuntu-24.04" }),
        platform: "linux",
        installationRef: "/usr/bin/node",
        capturedAt,
      },
      runtimeId: RUNTIME_ID,
      traceId: TRACE_ID,
    });
    const emittedDiagnostics: DiagnosticEnvelopeV1[] = [];
    const cliOptions = {
      runtimeScope: {
        ...guard,
        frameStoreBinder: liveFrameBackend,
        emitDiagnostics: (diagnostics: DiagnosticEnvelopeV1) => {
          emittedDiagnostics.push(diagnostics);
        },
      },
    };
    mcp = new MCPServer({ runtimeScope: guard, frameStoreBinder: liveFrameBackend });
    const liveMcp = mcp;

    await runCase("cli-dispatch", async () => {
      for (const workspace of workspaces) {
        selectedWorkspace = workspace;
        scopeTransitions += 1;
        const output = await captureConsole(() =>
          run(
            [
              "node",
              "lex",
              "--json",
              "remember",
              "--reference-point",
              `cli-dispatch-${workspace.workspaceSlug}`,
              "--summary",
              `cli-${workspace.workspaceSlug}`,
              "--next",
              "prove MCP parity",
              "--modules",
              "unscoped",
              "--skip-policy",
            ],
            cliOptions
          )
        );
        assert.match(output, /FRAME_STORED|success/i);
        assertCompactAgentOutput(output, 4 * 1024);
      }
      assert.equal(emittedDiagnostics.length, 0);
    });

    await runCase("mcp-dispatch", async () => {
      for (const workspace of workspaces) {
        selectedWorkspace = workspace;
        scopeTransitions += 1;
        const search = await liveMcp.handleRequest({
          method: "tools/call",
          params: {
            name: "frame_search",
            arguments: {
              reference_point: `cli-dispatch-${workspace.workspaceSlug}`,
              format: "compact",
            },
          },
        });
        assert.equal(search.error, undefined);
        assert.equal((search.data?.meta as { matchCount?: number } | undefined)?.matchCount, 1);
        const compactFrames = search.data?.frames as Array<Record<string, unknown>> | undefined;
        assert.equal(compactFrames?.length, 1);
        assert.equal(typeof compactFrames?.[0]?.ref, "string");
        assert.equal("reference_point" in (compactFrames?.[0] ?? {}), false);
        assert.equal("status_snapshot" in (compactFrames?.[0] ?? {}), false);
        assertCompactAgentOutput(search);
        const created = await liveMcp.handleRequest({
          method: "tools/call",
          params: {
            name: "frame_create",
            arguments: {
              reference_point: `mcp-dispatch-${workspace.workspaceSlug}`,
              summary_caption: `mcp-${workspace.workspaceSlug}`,
              status_snapshot: { next_action: "prove CLI parity" },
              module_scope: ["memory/store"],
            },
          },
        });
        assert.equal(created.error, undefined);
        assertCompactAgentOutput(created, 4 * 1024);
      }
    });

    await runCase("cli-mcp-parity", async () => {
      for (const workspace of workspaces) {
        selectedWorkspace = workspace;
        scopeTransitions += 1;
        const output = await captureConsole(() =>
          run(
            [
              "node",
              "lex",
              "--json",
              "recall",
              `mcp-dispatch-${workspace.workspaceSlug}`,
              "--summary",
              "--exact",
            ],
            cliOptions
          )
        );
        assert.match(output, new RegExp(`mcp-${workspace.workspaceSlug}`));
        assertCompactAgentOutput(output);
      }
    });
    normalOutputCompactProven = true;

    selectedWorkspace = workspaces[0]!;
    const diagnosticResponse = await liveMcp.handleRequest({
      method: "tools/call",
      params: {
        name: "frame_list",
        arguments: { limit: 2, format: "compact", diagnostics: "full" },
      },
    });
    assert.equal(diagnosticResponse.error, undefined);
    const diagnosticJson = JSON.stringify(diagnosticResponse.data?.diagnostics);
    assert.match(diagnosticJson, /authenticationRef/);
    assert.match(diagnosticJson, /projectRoot/);
    assert.equal(diagnosticJson.includes(AUTHENTICATION_REF), false);
    assert.equal(diagnosticJson.includes(wsl.root), false);
    diagnosticsOptInProven = true;
    diagnosticsRedactedProven = true;

    await runCase("export", async () => {
      for (const workspace of workspaces) {
        selectedWorkspace = workspace;
        scopeTransitions += 1;
        const target = join(exportRoot, workspace.workspaceSlug);
        await captureConsole(() =>
          run(
            ["node", "lex", "--json", "frames", "export", "--out", target, "--format", "ndjson"],
            cliOptions
          )
        );
        const files = allFiles(target);
        assert.equal(files.length, 1);
        const frames = readFileSync(files[0]!, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as { summary_caption: string });
        assert.ok(frames.length >= 3);
        assert.ok(
          frames.every(({ summary_caption }) => summary_caption.includes(workspace.workspaceSlug))
        );
      }
    });

    phase = "negative";
    await runCase("path-spoof", async () => {
      const pathSpoof = await resolveFixture(surfaces[0]!, workspaces[0]!, {
        projectRoot: "C:\\unrelated\\spoof",
      });
      assert.equal(pathSpoof.resolved, false);
    });
    await runCase("manifest-spoof", async () => {
      const manifestSpoof = await resolveFixture(surfaces[0]!, workspaces[0]!, {
        repositoryEvidence: {
          ...evidence(surfaces[0]!, workspaces[0]!),
          manifestDigest: "sha256:spoofed-manifest" as ContentDigest,
        },
      });
      assert.equal(manifestSpoof.resolved, false);
    });
    await runCase("branch-spoof", async () => {
      const branchSpoof = await resolveFixture(surfaces[0]!, workspaces[0]!, {
        branch: "spoofed-authority-branch",
      });
      assert.equal(branchSpoof.resolved, true);
      if (branchSpoof.resolved) {
        assert.equal(branchSpoof.authorizedScope.workspaceId, workspaces[0]!.workspaceId);
        assert.equal(
          branchSpoof.invocationContext.sourceRevision?.branch,
          "spoofed-authority-branch"
        );
      }
    });
    await runCase("environment-spoof", async () => {
      const environmentSpoof = await resolveFixture(surfaces[0]!, workspaces[0]!, {
        allowedEnvironment: { LEX_WORKSPACE_ROOT: "C:\\spoofed\\workspace" },
      });
      assert.equal(environmentSpoof.resolved, true);
      if (environmentSpoof.resolved) {
        assert.equal(environmentSpoof.authorizedScope.workspaceId, workspaces[0]!.workspaceId);
        assert.equal(environmentSpoof.invocationContext.projectRoot, surfaces[0]!.root);
      }
    });
    await runCase("unauthorized-tenant-selector", async () => {
      const tenantSpoof = await resolveFixture(surfaces[0]!, workspaces[0]!, {
        requestedWorkspace: {
          tenant: { tenantId: LEX3_DOGFOOD_CANONICAL_IDS.tenants.stfc },
          workspaceSlug: "lex" as never,
        },
      });
      assert.equal(tenantSpoof.resolved, false);
    });
    await runCase("unauthorized-workspace-selector", async () => {
      const workspaceSpoof = await resolveFixture(surfaces[0]!, workspaces[0]!, {
        requestedWorkspace: {
          workspaceId: "90000000-0000-4000-8000-000000000001" as WorkspaceId,
        },
      });
      assert.equal(workspaceSpoof.resolved, false);
    });

    await runCase("attenuated-grant", async () => {
      const attenuated = await authorityDirectory.authorizeWorkspace({
        principalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        workspace: { workspaceId: workspaces[0]!.workspaceId },
        requestedCapabilities: [RUNTIME_OPERATION_CAPABILITIES.FRAME_READ],
      });
      assert.equal(attenuated.authorized, true);
      if (attenuated.authorized)
        assert.deepEqual(attenuated.grant.capabilities, [
          RUNTIME_OPERATION_CAPABILITIES.FRAME_READ,
        ]);
      const widened = await authorityDirectory.authorizeWorkspace({
        principalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        workspace: { workspaceId: workspaces[0]!.workspaceId },
        requestedCapabilities: [RUNTIME_OPERATION_CAPABILITIES.FRAME_ADMIN],
      });
      assert.equal(widened.authorized, false);
    });

    await runCase("missing-grant", async () => {
      await liveScopedAdminPool.query(
        "DELETE FROM lex_authority_workspace_grants WHERE workspace_id = $1::uuid",
        [workspaces[0]!.workspaceId]
      );
      const missingGrant = await authorityDirectory.authorizeWorkspace({
        principalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        workspace: { workspaceId: workspaces[0]!.workspaceId },
        requestedCapabilities: [RUNTIME_OPERATION_CAPABILITIES.FRAME_READ],
      });
      assert.equal(missingGrant.authorized, false);
      await authorityAdministration.seedTopology(topology);
    });

    await runCase("expired-grant", async () => {
      await liveScopedAdminPool.query(
        "UPDATE lex_authority_workspace_grants SET expires_at = $2::timestamptz WHERE workspace_id = $1::uuid",
        [workspaces[1]!.workspaceId, new Date(now.getTime() - 60_000).toISOString()]
      );
      const expired = await authorityDirectory.authorizeWorkspace({
        principalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        workspace: { workspaceId: workspaces[1]!.workspaceId },
        requestedCapabilities: [RUNTIME_OPERATION_CAPABILITIES.FRAME_READ],
      });
      assert.equal(expired.authorized, false);
      if (!expired.authorized) assert.equal(expired.reason, "grant-expired");
      await authorityAdministration.seedTopology(topology);
    });

    await runCase("revoked-grant", async () => {
      await authorityAdministration.revokeGrant({
        grantId: topology.grants.at(-1)!.grantId,
        revokedAt: new Date().toISOString(),
        authorityVersion: "dogfood-authority-revoked" as never,
      });
      const revoked = await authorityDirectory.authorizeWorkspace({
        principalId: LEX3_DOGFOOD_CANONICAL_IDS.principalId,
        workspace: { workspaceId: workspaces.at(-1)!.workspaceId },
        requestedCapabilities: [RUNTIME_OPERATION_CAPABILITIES.FRAME_READ],
      });
      assert.equal(revoked.authorized, false);
      if (!revoked.authorized) assert.equal(revoked.reason, "grant-revoked");
    });

    await runCase("rls-disable", async () => {
      await expectRejected(liveRuntimePool.query("ALTER TABLE frames DISABLE ROW LEVEL SECURITY"));
    });
    await runCase("rls-policy-drop", async () => {
      await expectRejected(
        liveRuntimePool.query("DROP POLICY lex_frames_runtime_select ON frames")
      );
    });
    await runCase("rls-bypass", async () => {
      client = await liveRuntimePool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL row_security = off");
        await expectRejected(client.query("SELECT COUNT(*) FROM frames"));
        await client.query("ROLLBACK");
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    });

    await runCase("migration-admin-separation", async () => {
      assert.equal("migrate" in liveFrameBackend, false);
      assert.equal("bindAdmin" in liveFrameBackend, false);
      assert.equal("seedTopology" in authorityDirectory, false);
      await liveRuntimePool.query("RESET ROLE");
      const resetIdentity = await liveRuntimePool.query<{
        session_role: string;
        current_role: string;
      }>("SELECT session_user AS session_role, current_user AS current_role");
      assert.deepEqual(resetIdentity.rows[0], {
        session_role: runtimeRole,
        current_role: runtimeRole,
      });
      await expectRejected(
        liveRuntimePool.query("CREATE TABLE runtime_must_not_administer (id integer)")
      );
      await expectRejected(
        liveRuntimePool.query("INSERT INTO lex_authority_migrations (version) VALUES (999)")
      );
      await expectRejected(
        liveRuntimePool.query(
          "UPDATE lex_authority_migrations SET applied_at = now() WHERE version = 1"
        )
      );
      await expectRejected(
        liveRuntimePool.query("DELETE FROM lex_authority_migrations WHERE version = 1")
      );
    });

    for (const { store } of stores) await store.close();
  } catch (error) {
    failure = error;
    failurePhase = phase;
    failureCode = `${step.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_")}_${safeFailureCode(error)}`;
  } finally {
    await mcp?.close().catch(() => undefined);
    await frameBackend?.close().catch(() => undefined);
    await frameAdministration?.close().catch(() => undefined);
    for (const surface of surfaces) {
      try {
        surface.registry?.close();
      } catch {
        // The WSL registry is deliberately reopened read-only per dispatch.
      }
    }
    await runtimePool?.end().catch(() => undefined);
    await scopedAdminPool?.end().catch(() => undefined);
    if (adminPool) {
      if (schemaCreated) {
        await adminPool
          .query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`)
          .catch((error) => {
            if (!failure) {
              failure = error;
              failurePhase = "cleanup";
              failureCode = `DROP_SCHEMA_${safeFailureCode(error)}`;
            }
          });
      }
      if (roleCreated) {
        await adminPool
          .query(`DROP ROLE IF EXISTS ${quoteIdentifier(runtimeRole)}`)
          .catch((error) => {
            if (!failure) {
              failure = error;
              failurePhase = "cleanup";
              failureCode = `DROP_ROLE_${safeFailureCode(error)}`;
            }
          });
      }
      const absent = await adminPool
        .query<{ schema_exists: boolean; role_exists: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS schema_exists,
                  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2) AS role_exists`,
          [schema, runtimeRole]
        )
        .catch(() => ({ rows: [{ schema_exists: true, role_exists: true }] }));
      cleanup.schemaDropped = absent.rows[0]?.schema_exists === false;
      cleanup.runtimeRoleDropped = absent.rows[0]?.role_exists === false;
      await adminPool.end().catch(() => undefined);
    }
    rmSync(registryRoot, { recursive: true, force: true });
    rmSync(exportRoot, { recursive: true, force: true });
    cleanup.registryFixturesRemoved = !existsSync(registryRoot);
    cleanup.exportFixturesRemoved = !existsSync(exportRoot);
    if (!Object.values(cleanup).every(Boolean) && !failure) {
      failure = new Error("Canary cleanup was incomplete.");
      failurePhase = "cleanup";
      failureCode = "CLEANUP_INCOMPLETE";
    }
  }

  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { version: string };
  const cases = caseResults(actual);
  const receipt: Lex3DogfoodAcceptanceReceiptV1 = Object.freeze({
    schemaVersion: LEX3_DOGFOOD_ACCEPTANCE_RECEIPT_VERSION,
    gate: "lex-3.0-postgres-two-tenant-five-workspace",
    ok:
      failure === undefined &&
      cases.every(({ expected, actual: outcome }) => expected === outcome) &&
      normalOutputCompactProven &&
      diagnosticsOptInProven &&
      diagnosticsRedactedProven &&
      Object.values(cleanup).every(Boolean),
    versions: Object.freeze({
      lex: packageJson.version,
      authoritySchema: String(POSTGRES_AUTHORITY_SCHEMA_VERSION),
      frameStoreSchema: String(POSTGRES_FRAME_STORE_SCHEMA_VERSION),
      policy: "lex-3-dogfood-v1",
    }),
    topology: Object.freeze({
      tenants: 2,
      workspaces: 5,
      principals: 1,
      runtimePools: 1,
      scopedFrameTables: 1,
      localRegistryFixtures: 2,
    }),
    cases,
    surfaces: Object.freeze(["windows-native", "wsl"] as const),
    output: Object.freeze({
      normalOutputCompact: normalOutputCompactProven ? "proven" : "not-proven",
      diagnosticsOptIn: diagnosticsOptInProven ? "proven" : "not-proven",
      diagnosticsRedacted: diagnosticsRedactedProven ? "proven" : "not-proven",
    }),
    cleanup: Object.freeze({ ...cleanup }),
    ...(failure
      ? {
          failure: Object.freeze({
            ...(currentCase ? { caseId: currentCase } : {}),
            phase: failurePhase ?? phase,
            code: failureCode ?? safeFailureCode(failure),
          }),
        }
      : {}),
    ...(options.diagnostics
      ? {
          diagnostics: Object.freeze({
            canonicalTenantIds: Object.freeze(Object.values(LEX3_DOGFOOD_CANONICAL_IDS.tenants)),
            canonicalWorkspaceIds: Object.freeze(
              Object.values(LEX3_DOGFOOD_CANONICAL_IDS.workspaces)
            ),
            backendIdentity: backendIdentity ?? "unavailable",
            poolMax: 1 as const,
            scopeTransitions,
            redactions: Object.freeze(["authenticationRef", "projectRoot"] as const),
          }),
        }
      : {}),
  });
  assertLex3DogfoodAcceptanceReceipt(receipt);
  return receipt;
}

function processConnectionString(): string {
  const configured = process.env.LEX_DATABASE_URL;
  const password = process.env.LEX_POSTGRES_PASSWORD;
  if (!configured || !password) {
    throw new Error(
      "The opt-in canary requires LEX_DATABASE_URL and LEX_POSTGRES_PASSWORD in this process."
    );
  }
  const connection = new URL(configured);
  connection.password = password;
  return connection.toString();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const diagnostics = args.includes("--diagnostic");
  const verifyFailureCleanup = args.includes("--verify-failure-cleanup");
  const verifySetupFailure = args.includes("--verify-setup-failure");
  if (verifyFailureCleanup && verifySetupFailure) {
    throw new Error("Choose one dogfood failure probe at a time.");
  }
  const receipt = await runLex3PostgresDogfoodCanary({
    administrationConnectionString: processConnectionString(),
    diagnostics,
    ...(verifyFailureCleanup ? { failAfterCase: "create" as const } : {}),
    ...(verifySetupFailure ? { failBeforeLiveIdentity: true } : {}),
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  if (verifyFailureCleanup) {
    assert.equal(receipt.ok, false);
    assert.equal(receipt.failure?.caseId, "create");
    assert.ok(Object.values(receipt.cleanup).every(Boolean));
  } else if (verifySetupFailure) {
    assert.equal(receipt.ok, false);
    assert.equal(receipt.failure?.phase, "setup");
    assert.equal(receipt.failure?.caseId, undefined);
    assert.ok(receipt.cases.every(({ actual }) => actual === "not-run"));
    assert.ok(Object.values(receipt.output).every((state) => state === "not-proven"));
    if (diagnostics) assert.equal(receipt.diagnostics?.backendIdentity, "unavailable");
    assert.ok(Object.values(receipt.cleanup).every(Boolean));
  } else if (!receipt.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    process.stderr.write(
      `${JSON.stringify({ schemaVersion: 1, gate: "lex-3.0-postgres-two-tenant-five-workspace", ok: false, failure: { phase: "setup", code: "WRAPPER_FAILED" } })}\n`
    );
    process.exitCode = 1;
  });
}
