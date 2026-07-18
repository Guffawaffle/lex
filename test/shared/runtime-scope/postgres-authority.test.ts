import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Pool, PoolClient, QueryResult } from "pg";

import type { MCPServerOptions } from "../../../src/memory/mcp_server/server.js";
import { MemoryScopedFrameStoreBackend } from "../../../src/memory/store/memory/index.js";
import type { CliRunOptionsV1 } from "../../../src/shared/cli/index.js";
import {
  LEX3_DOGFOOD_CANONICAL_IDS,
  POSTGRES_AUTHORITY_TABLES,
  PostgresAuthorityAdministration,
  PostgresAuthorityDirectory,
  createPostgresSchemaTarget,
  createLex3DogfoodAuthorityTopology,
  createPostgresTrustedRuntimeHost,
  postgresAuthorityMigrationSql,
  resolveRuntimeScope,
  type AuthenticationRef,
  type AuthorityVersion,
  type BindingId,
  type CapabilityId,
  type ContentDigest,
  type ExecutionSurfaceId,
  type LocalBindingRegistry,
  type RegistryInstanceId,
  type RepositoryId,
  type RepositoryInstanceBindingV1,
  type RepositoryInstanceId,
  type RuntimeId,
  type ScopeVersion,
  type TraceId,
  type WorkspaceInstanceId,
} from "../../../src/shared/runtime-scope/index.js";

const NOW = "2026-07-18T12:00:00.000Z";
const AUTHORITY_SCHEMA = "lex_authority_test";
const PRINCIPAL = LEX3_DOGFOOD_CANONICAL_IDS.principalId;
const TENANT = LEX3_DOGFOOD_CANONICAL_IDS.tenants.platform;
const WORKSPACE = LEX3_DOGFOOD_CANONICAL_IDS.workspaces.lex;
const REPOSITORY = LEX3_DOGFOOD_CANONICAL_IDS.repositories.lex;
const AUTH_REF = "secret-provider://desktop/session" as AuthenticationRef;
const AUTHORITY_VERSION = "authority-v1" as AuthorityVersion;
const SCOPE_VERSION = "scope-v1" as ScopeVersion;
const AUTHORITY_DIGEST = `sha256:${"a".repeat(64)}` as ContentDigest;
const FRAME_READ = "frame:read" as CapabilityId;
const FRAME_WRITE = "frame:write" as CapabilityId;

function authorityRelation(name: string): string {
  return `"${AUTHORITY_SCHEMA}"."${name}"`;
}

interface QueryCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

function result<Row extends Record<string, unknown>>(rows: readonly Row[], rowCount = rows.length) {
  return { rows, rowCount } as unknown as QueryResult<Row>;
}

class AuthorityClient {
  readonly calls: QueryCall[] = [];
  releaseCount = 0;
  readonly unsafeRole: boolean;
  readonly schemaCreate: boolean;
  readonly grantRevoked: boolean;
  readonly grantExpired: boolean;

  constructor(
    options: {
      readonly unsafeRole?: boolean;
      readonly schemaCreate?: boolean;
      readonly grantRevoked?: boolean;
      readonly grantExpired?: boolean;
    } = {}
  ) {
    this.unsafeRole = options.unsafeRole ?? false;
    this.schemaCreate = options.schemaCreate ?? false;
    this.grantRevoked = options.grantRevoked ?? false;
    this.grantExpired = options.grantExpired ?? false;
  }

  async query(sqlValue: string, params: readonly unknown[] = []): Promise<QueryResult> {
    const sql = sqlValue.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return result([]);
    if (sql.includes("role_is_superuser")) {
      return result([
        {
          schema_version: 1,
          role_is_superuser: this.unsafeRole,
          role_bypasses_rls: false,
          role_owns_authority: false,
          role_can_mutate_authority: false,
          role_can_create_in_schema: this.schemaCreate,
        },
      ]);
    }
    if (sql.includes(`FROM ${authorityRelation("lex_authority_authentication_refs")}`)) {
      return result([
        {
          principal_id: PRINCIPAL,
          display_name: "guff",
          state: "active",
          authority_version: AUTHORITY_VERSION,
        },
      ]);
    }
    if (
      sql.includes(`FROM ${authorityRelation("lex_authority_workspace_repositories")} association`)
    ) {
      return result([{ authorized: params[2] === REPOSITORY }]);
    }
    if (sql.includes(`FROM ${authorityRelation("lex_authority_tenant_memberships")}`)) {
      return result([{ state: "active", revoked_at: null, authority_version: AUTHORITY_VERSION }]);
    }
    if (sql.includes(`FROM ${authorityRelation("lex_authority_workspace_grants")}`)) {
      return result([
        {
          grant_id: "50000000-0000-4000-8000-000000000001",
          tenant_id: TENANT,
          workspace_id: WORKSPACE,
          principal_id: PRINCIPAL,
          capabilities: [FRAME_READ, FRAME_WRITE],
          authority_version: AUTHORITY_VERSION,
          grant_version: "grant-v1",
          scope_version: SCOPE_VERSION,
          authority_digest: AUTHORITY_DIGEST,
          expires_at: this.grantExpired ? "2026-07-18T11:00:00.000Z" : null,
          revoked_at: this.grantRevoked ? "2026-07-18T11:00:00.000Z" : null,
        },
      ]);
    }
    if (sql.includes(`FROM ${authorityRelation("lex_authority_principals")}`)) {
      return result([
        {
          principal_id: PRINCIPAL,
          display_name: "guff",
          state: "active",
          authority_version: AUTHORITY_VERSION,
        },
      ]);
    }
    if (sql.includes(`FROM ${authorityRelation("lex_authority_workspaces")}`)) {
      return result([
        {
          workspace_id: WORKSPACE,
          tenant_id: TENANT,
          workspace_slug: "lex",
          display_name: "Lex",
          state: "active",
          authority_version: AUTHORITY_VERSION,
        },
      ]);
    }
    if (sql.includes(`FROM ${authorityRelation("lex_authority_tenants")}`)) {
      return result([
        {
          tenant_id: TENANT,
          tenant_slug: "platform-dogfood",
          display_name: "Platform Dogfood",
          state: "active",
          authority_version: AUTHORITY_VERSION,
        },
      ]);
    }
    if (sql.includes(`FROM ${authorityRelation("lex_authority_repositories")}`)) {
      return result([
        {
          repository_id: params[0] as string,
          repository_slug: params[0] === REPOSITORY ? "lex" : "other",
          display_name: "Repository",
          state: "active",
          authority_version: AUTHORITY_VERSION,
        },
      ]);
    }
    throw new Error(`Unexpected authority SQL: ${sql}`);
  }

  release(): void {
    this.releaseCount += 1;
  }
}

class AdministrationClient {
  readonly calls: QueryCall[] = [];
  releaseCount = 0;

  constructor(
    private readonly conflictSql?: string,
    private readonly schemaCreate = false
  ) {}

  async query(sqlValue: string, params: readonly unknown[] = []): Promise<QueryResult> {
    const sql = sqlValue.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, params });
    if (
      sql.includes(
        `SELECT version FROM ${authorityRelation("lex_authority_migrations")} WHERE version >`
      )
    ) {
      return result([]);
    }
    if (sql.includes("has_schema_privilege")) {
      return result([{ role_can_create_in_schema: this.schemaCreate }]);
    }
    if (sql.startsWith("SELECT") && sql.includes("<>")) return result([]);
    if (this.conflictSql && sql.includes(this.conflictSql)) return result([], 0);
    return result([], 1);
  }

  release(): void {
    this.releaseCount += 1;
  }
}

class SlugHistoryAdministrationClient extends AdministrationClient {
  constructor(
    private readonly options: {
      readonly currentTenantSlug?: string;
      readonly currentWorkspaceSlug?: string;
      readonly conflictingTenantAlias?: string;
      readonly conflictingWorkspaceAlias?: string;
    }
  ) {
    super();
  }

  override async query(sqlValue: string, params: readonly unknown[] = []): Promise<QueryResult> {
    const sql = sqlValue.replace(/\s+/g, " ").trim();
    if (sql.includes("SELECT tenant_slug") && sql.includes("FOR UPDATE") && params[0] === TENANT) {
      this.calls.push({ sql, params });
      return this.options.currentTenantSlug
        ? result([{ tenant_slug: this.options.currentTenantSlug }])
        : result([]);
    }
    if (
      sql.includes("SELECT tenant_id::text, workspace_slug") &&
      sql.includes("FOR UPDATE") &&
      params[0] === WORKSPACE
    ) {
      this.calls.push({ sql, params });
      return this.options.currentWorkspaceSlug
        ? result([{ tenant_id: TENANT, workspace_slug: this.options.currentWorkspaceSlug }])
        : result([]);
    }
    if (
      this.options.conflictingTenantAlias &&
      sql.includes(`FROM ${authorityRelation("lex_authority_tenant_slug_aliases")}`) &&
      params[0] === this.options.conflictingTenantAlias
    ) {
      this.calls.push({ sql, params });
      return result([{ tenant_id: TENANT }]);
    }
    if (
      this.options.conflictingWorkspaceAlias &&
      sql.includes(`FROM ${authorityRelation("lex_authority_workspace_slug_aliases")}`) &&
      params[1] === this.options.conflictingWorkspaceAlias
    ) {
      this.calls.push({ sql, params });
      return result([{ workspace_id: WORKSPACE }]);
    }
    return super.query(sqlValue, params);
  }
}

function poolFor(client: AuthorityClient | AdministrationClient): Pool {
  return { connect: async () => client as unknown as PoolClient } as unknown as Pool;
}

function binding(): RepositoryInstanceBindingV1 {
  return Object.freeze({
    schemaVersion: 1,
    bindingId: "60000000-0000-4000-8000-000000000001" as BindingId,
    registryInstanceId: "60000000-0000-4000-8000-000000000002" as RegistryInstanceId,
    executionSurfaceId: "60000000-0000-4000-8000-000000000003" as ExecutionSurfaceId,
    workspaceInstanceId: "60000000-0000-4000-8000-000000000004" as WorkspaceInstanceId,
    repositoryInstanceId: "60000000-0000-4000-8000-000000000005" as RepositoryInstanceId,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    repositoryId: REPOSITORY,
    evidence: Object.freeze({
      schemaVersion: 1,
      canonicalRoot: "/srv/lex",
      filesystemEvidenceDigest: `sha256:${"b".repeat(64)}` as ContentDigest,
    }),
    cachedAuthority: Object.freeze({
      schemaVersion: 1,
      authoritySource: "postgres-v1",
      authorityVersion: AUTHORITY_VERSION,
      authorityDigest: AUTHORITY_DIGEST,
      verifiedAt: NOW,
      expiresAt: "2026-07-18T13:00:00.000Z",
    }),
    state: "active",
    createdAt: NOW,
  });
}

function localRegistry(storedBinding: RepositoryInstanceBindingV1): LocalBindingRegistry {
  return {
    registryInstanceId: storedBinding.registryInstanceId,
    executionSurfaceId: storedBinding.executionSurfaceId,
    findRepositoryInstances: async () => [storedBinding],
    registerBinding: async () => {
      throw new Error("not available");
    },
    verifyBinding: async (request) => ({
      schemaVersion: 1,
      status:
        request.authorityEvidence.authorityVersion ===
          storedBinding.cachedAuthority?.authorityVersion &&
        request.authorityEvidence.authorityDigest === storedBinding.cachedAuthority.authorityDigest
          ? "verified"
          : "mismatch",
      bindingId: storedBinding.bindingId,
      evidenceDigest: `sha256:${"b".repeat(64)}` as ContentDigest,
      authorityDigest: request.authorityEvidence.authorityDigest,
      verifiedAt: request.verifiedAt,
      reasons: [],
    }),
    revokeBinding: async () => {},
  };
}

describe("PostgreSQL canonical authority", () => {
  test("requires a validated explicit schema and qualifies migration objects", () => {
    const target = createPostgresSchemaTarget(AUTHORITY_SCHEMA);
    assert.equal(target.schema, AUTHORITY_SCHEMA);
    assert.equal(target.quotedSchema, `"${AUTHORITY_SCHEMA}"`);
    assert.equal(
      target.relation("lex_authority_tenants"),
      authorityRelation("lex_authority_tenants")
    );
    assert.equal(
      target.function("lex_authority_helper"),
      authorityRelation("lex_authority_helper")
    );
    for (const invalid of ["", "Public", "tenant-authority", "pg_catalog", "a".repeat(64)]) {
      assert.throws(() => createPostgresSchemaTarget(invalid), /PostgreSQL schema/);
    }

    const migrationSql = postgresAuthorityMigrationSql(target);
    for (const table of ["lex_authority_migrations", ...POSTGRES_AUTHORITY_TABLES]) {
      assert.equal(migrationSql.includes(authorityRelation(table)), true, table);
    }
    assert.doesNotMatch(
      migrationSql,
      /(?:TABLE|REFERENCES|ON)\s+lex_authority_[a-z0-9_]+/,
      "authority migration objects must never use ambient schema resolution"
    );
  });

  test("pins resolver reads to one snapshot and attenuates the authorized scope", async () => {
    const client = new AuthorityClient();
    const authorityDirectory = new PostgresAuthorityDirectory(poolFor(client), {
      schema: AUTHORITY_SCHEMA,
      now: () => NOW,
    });
    const storedBinding = binding();
    const resolution = await resolveRuntimeScope(
      {
        schemaVersion: 1,
        bootstrap: {
          schemaVersion: 1,
          cwd: "/srv/lex",
          argv: ["node", "lex", "recall"],
          allowedEnvironment: {},
          platform: "linux",
          executionSurface: {
            schemaVersion: 1,
            nativePlatform: "linux",
            kind: "linux-native",
            installationRef: "/usr/bin/node",
            evidenceDigest: `sha256:${"c".repeat(64)}` as ContentDigest,
          },
          capturedAt: NOW,
        },
        projectRoot: "/srv/lex",
        authenticationRef: AUTH_REF,
        requestedWorkspace: { workspaceId: WORKSPACE },
        requestedCapabilities: [FRAME_READ],
        repositoryDeclaration: {
          schemaVersion: 1,
          repositoryId: REPOSITORY,
          repositorySlug: "lex" as never,
        },
        repositoryEvidence: storedBinding.evidence,
        runtimeSurface: {
          schemaVersion: 1,
          registryInstanceId: storedBinding.registryInstanceId,
          executionSurfaceId: storedBinding.executionSurfaceId,
          runtimeId: "70000000-0000-4000-8000-000000000001" as RuntimeId,
        },
        authoritySource: "postgres-v1",
        authorityCacheExpiresAt: "2026-07-18T13:00:00.000Z",
      },
      { authorityDirectory, localRegistry: localRegistry(storedBinding) }
    );

    assert.equal(resolution.resolved, true, JSON.stringify({ resolution, calls: client.calls }));
    if (resolution.resolved) {
      assert.deepEqual(resolution.authorizedScope.capabilities, [FRAME_READ]);
      assert.equal(Object.isFrozen(resolution.authorizedScope), true);
    }
    assert.equal(client.calls.filter(({ sql }) => sql.startsWith("BEGIN")).length, 1);
    assert.equal(client.calls.filter(({ sql }) => sql === "COMMIT").length, 1);
    assert.equal(client.releaseCount, 1);
    assert.deepEqual(
      client.calls.find(({ sql }) => sql.includes("role_can_mutate_authority"))?.params,
      [AUTHORITY_SCHEMA, ["lex_authority_migrations", ...POSTGRES_AUTHORITY_TABLES]]
    );
  });

  test("rejects repository widening, revocation, expiry, and unsafe runtime roles", async () => {
    const repositoryClient = new AuthorityClient();
    const directory = new PostgresAuthorityDirectory(poolFor(repositoryClient), {
      schema: AUTHORITY_SCHEMA,
      now: () => NOW,
    });
    assert.equal(
      await directory.authorizeRepository({
        tenantId: TENANT,
        workspaceId: WORKSPACE,
        repositoryId: "40000000-0000-4000-8000-000000000099" as RepositoryId,
      }),
      false
    );
    const narrow = await directory.authorizeWorkspace({
      principalId: PRINCIPAL,
      workspace: { workspaceId: WORKSPACE },
      requestedCapabilities: [FRAME_READ],
    });
    assert.equal(narrow.authorized, true);
    if (narrow.authorized) assert.deepEqual(narrow.grant.capabilities, [FRAME_READ]);
    const empty = await directory.authorizeWorkspace({
      principalId: PRINCIPAL,
      workspace: { workspaceId: WORKSPACE },
      requestedCapabilities: [],
    });
    assert.equal(empty.authorized, true);
    if (empty.authorized) assert.deepEqual(empty.grant.capabilities, []);

    const revoked = new PostgresAuthorityDirectory(
      poolFor(new AuthorityClient({ grantRevoked: true })),
      { schema: AUTHORITY_SCHEMA, now: () => NOW }
    );
    const revokedDecision = await revoked.authorizeWorkspace({
      principalId: PRINCIPAL,
      workspace: { workspaceId: WORKSPACE },
      requestedCapabilities: [FRAME_READ],
    });
    assert.deepEqual(revokedDecision.authorized, false);
    if (!revokedDecision.authorized) assert.equal(revokedDecision.reason, "grant-revoked");

    const expired = new PostgresAuthorityDirectory(
      poolFor(new AuthorityClient({ grantExpired: true })),
      { schema: AUTHORITY_SCHEMA, now: () => NOW }
    );
    const expiredDecision = await expired.authorizeWorkspace({
      principalId: PRINCIPAL,
      workspace: { workspaceId: WORKSPACE },
      requestedCapabilities: [FRAME_READ],
    });
    assert.deepEqual(expiredDecision.authorized, false);
    if (!expiredDecision.authorized) assert.equal(expiredDecision.reason, "grant-expired");

    const unsafe = new PostgresAuthorityDirectory(
      poolFor(new AuthorityClient({ unsafeRole: true })),
      {
        schema: AUTHORITY_SCHEMA,
        now: () => NOW,
      }
    );
    await assert.rejects(() => unsafe.getTenant({ tenantId: TENANT }), /read-only non-owner/);

    const schemaCreator = new PostgresAuthorityDirectory(
      poolFor(new AuthorityClient({ schemaCreate: true })),
      {
        schema: AUTHORITY_SCHEMA,
        now: () => NOW,
      }
    );
    await assert.rejects(
      () => schemaCreator.getTenant({ tenantId: TENANT }),
      /effective schema CREATE/
    );
  });

  test("seeds the explicit dogfood topology with redacted idempotent administration inputs", async () => {
    const client = new AdministrationClient();
    const administration = new PostgresAuthorityAdministration(poolFor(client), {
      schema: AUTHORITY_SCHEMA,
      now: () => NOW,
    });
    const migration = await administration.migrate("lex_authority_runtime");
    assert.equal(migration.targetSchemaVersion, 1);
    const topology = createLex3DogfoodAuthorityTopology(AUTH_REF);
    const receipt = await administration.seedTopology(topology);
    assert.deepEqual(receipt.counts, {
      principals: 1,
      authenticationBindings: 1,
      tenants: 2,
      workspaces: 5,
      repositories: 5,
      workspaceRepositories: 5,
      memberships: 2,
      grants: 5,
    });
    assert.match(receipt.topologyDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(receipt).includes(AUTH_REF), false);
    assert.equal(
      client.calls.some(({ sql }) => sql.includes("GRANT SELECT ON TABLE")),
      true
    );
    assert.equal(
      client.calls.some(
        ({ sql }) =>
          sql === `GRANT USAGE ON SCHEMA "${AUTHORITY_SCHEMA}" TO "lex_authority_runtime"`
      ),
      true
    );
    assert.equal(
      client.calls.some(
        ({ sql }) =>
          sql === `REVOKE CREATE ON SCHEMA "${AUTHORITY_SCHEMA}" FROM "lex_authority_runtime"`
      ),
      true
    );
    assert.equal(
      client.calls.some(
        ({ sql }) =>
          sql ===
          `GRANT SELECT ON TABLE ${authorityRelation("lex_authority_migrations")} TO "lex_authority_runtime"`
      ),
      true
    );
    assert.ok(
      client.calls.findIndex(({ sql }) => sql.includes("has_schema_privilege")) <
        client.calls.findIndex(({ sql }) => sql.includes("CREATE TABLE IF NOT EXISTS"))
    );
    assert.equal(
      client.calls.flatMap(({ params }) => params).some((value) => value === AUTH_REF),
      false
    );
    assert.equal(client.releaseCount, 2);

    const inheritedCreateClient = new AdministrationClient(undefined, true);
    const inheritedCreateAdministration = new PostgresAuthorityAdministration(
      poolFor(inheritedCreateClient),
      {
        schema: AUTHORITY_SCHEMA,
        now: () => NOW,
      }
    );
    await assert.rejects(
      () => inheritedCreateAdministration.migrate("lex_authority_runtime"),
      /retains effective schema CREATE privilege/
    );
    assert.deepEqual(
      inheritedCreateClient.calls.find(({ sql }) => sql.includes("has_schema_privilege"))?.params,
      ["lex_authority_runtime", AUTHORITY_SCHEMA]
    );
    assert.equal(
      inheritedCreateClient.calls.some(({ sql }) => sql === "ROLLBACK"),
      true
    );

    const conflictClient = new AdministrationClient(
      `INSERT INTO ${authorityRelation("lex_authority_authentication_refs")}`
    );
    const conflictingAdministration = new PostgresAuthorityAdministration(poolFor(conflictClient), {
      schema: AUTHORITY_SCHEMA,
      now: () => NOW,
    });
    await assert.rejects(
      () => conflictingAdministration.seedTopology(topology),
      /conflicts with an existing immutable authority identity/
    );
    assert.equal(
      conflictClient.calls.some(({ sql }) => sql === "ROLLBACK"),
      true
    );
  });

  test("preserves canonical slug history and rejects reassignment to another identity", async () => {
    const topology = createLex3DogfoodAuthorityTopology(AUTH_REF);
    const renamedTopology = {
      ...topology,
      tenants: topology.tenants.map((tenant) =>
        tenant.tenantId === TENANT ? { ...tenant, tenantSlug: "platform-renamed" } : tenant
      ),
      workspaces: topology.workspaces.map((workspace) =>
        workspace.workspaceId === WORKSPACE
          ? { ...workspace, workspaceSlug: "lex-renamed" }
          : workspace
      ),
    };
    const renameClient = new SlugHistoryAdministrationClient({
      currentTenantSlug: "platform-original",
      currentWorkspaceSlug: "lex-original",
    });
    await new PostgresAuthorityAdministration(poolFor(renameClient), {
      schema: AUTHORITY_SCHEMA,
      now: () => NOW,
    }).seedTopology(renamedTopology);
    assert.equal(
      renameClient.calls.some(
        ({ sql, params }) =>
          sql.includes(`INSERT INTO ${authorityRelation("lex_authority_tenant_slug_aliases")}`) &&
          params[0] === "platform-original" &&
          params[1] === TENANT
      ),
      true
    );
    assert.equal(
      renameClient.calls.some(
        ({ sql, params }) =>
          sql.includes(
            `INSERT INTO ${authorityRelation("lex_authority_workspace_slug_aliases")}`
          ) &&
          params[1] === "lex-original" &&
          params[2] === WORKSPACE
      ),
      true
    );

    const otherTenant = LEX3_DOGFOOD_CANONICAL_IDS.tenants.stfc;
    const tenantReuseTopology = {
      ...topology,
      tenants: topology.tenants.map((tenant) =>
        tenant.tenantId === otherTenant ? { ...tenant, tenantSlug: "platform-original" } : tenant
      ),
    };
    const tenantReuseClient = new SlugHistoryAdministrationClient({
      conflictingTenantAlias: "platform-original",
    });
    await assert.rejects(
      () =>
        new PostgresAuthorityAdministration(poolFor(tenantReuseClient), {
          schema: AUTHORITY_SCHEMA,
          now: () => NOW,
        }).seedTopology(tenantReuseTopology),
      /Tenant slug conflicts with an existing immutable authority identity/
    );

    const otherWorkspace = LEX3_DOGFOOD_CANONICAL_IDS.workspaces.axf;
    const workspaceReuseTopology = {
      ...topology,
      workspaces: topology.workspaces.map((workspace) =>
        workspace.workspaceId === otherWorkspace
          ? { ...workspace, workspaceSlug: "lex-original" }
          : workspace
      ),
    };
    const workspaceReuseClient = new SlugHistoryAdministrationClient({
      conflictingWorkspaceAlias: "lex-original",
    });
    await assert.rejects(
      () =>
        new PostgresAuthorityAdministration(poolFor(workspaceReuseClient), {
          schema: AUTHORITY_SCHEMA,
          now: () => NOW,
        }).seedTopology(workspaceReuseTopology),
      /Workspace slug conflicts with an existing immutable authority identity/
    );
  });

  test("composes CLI and MCP primitives only from explicit trusted handles", async () => {
    const client = new AuthorityClient();
    const binder = new MemoryScopedFrameStoreBackend();
    const host = createPostgresTrustedRuntimeHost({
      authorityPool: poolFor(client),
      authoritySchema: AUTHORITY_SCHEMA,
      selection: {
        async select() {
          return {
            authenticationRef: AUTH_REF,
            requestedWorkspace: { workspaceId: WORKSPACE },
            authorityMode: "shared",
            authoritySource: "postgres-v1",
            authorityCacheExpiresAt: "2026-07-18T13:00:00.000Z",
          };
        },
      },
      frameStoreBinder: binder,
      process: {
        argv: ["node", "lex"],
        cwd: "/srv/lex",
        environment: {
          LEX_DATABASE_URL: "must-not-survive",
          LEX_POSTGRES_PASSWORD: "must-not-survive",
          HOME: "/home/guff",
        },
        platform: "linux",
        installationRef: "/usr/bin/node",
        capturedAt: NOW,
      },
      runtimeId: "70000000-0000-4000-8000-000000000001" as RuntimeId,
      traceId: "70000000-0000-4000-8000-000000000002" as TraceId,
      emitDiagnostics: () => {},
    });

    const cliOptions: CliRunOptionsV1 = host.cli;
    const mcpOptions: MCPServerOptions = host.mcp;
    assert.equal(cliOptions.runtimeScope?.frameStoreBinder, binder);
    assert.equal(mcpOptions.frameStoreBinder, binder);
    assert.equal(cliOptions.runtimeScope?.bootstrap, mcpOptions.runtimeScope?.bootstrap);
    assert.equal(host.cli.runtimeScope.request.bootstrap.allowedEnvironment.HOME, "/home/guff");
    assert.equal(
      "LEX_DATABASE_URL" in host.cli.runtimeScope.request.bootstrap.allowedEnvironment,
      false
    );
    assert.equal(
      "LEX_POSTGRES_PASSWORD" in host.cli.runtimeScope.request.bootstrap.allowedEnvironment,
      false
    );
    assert.equal(
      host.cli.workspaceAdmin.invocation.bootstrap,
      host.cli.runtimeScope.request.bootstrap
    );
    await binder.close();
  });
});
