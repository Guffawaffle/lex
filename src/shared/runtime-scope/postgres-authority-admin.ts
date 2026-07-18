import { createHash } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
  AuthenticationRef,
  AuthorityGrantId,
  AuthorityVersion,
  CapabilityId,
  ContentDigest,
  PrincipalId,
  RepositoryId,
  ScopeVersion,
  TenantId,
  WorkspaceId,
} from "./ids.js";
import { computeAuthenticationRefDigest } from "./postgres-authority.js";
import {
  POSTGRES_AUTHORITY_MIGRATION_SQL,
  POSTGRES_AUTHORITY_SCHEMA_VERSION,
  POSTGRES_AUTHORITY_TABLES,
} from "./postgres-authority-migrations.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_$-]*$/;

export const POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION = 1 as const;

export interface AuthorityPrincipalSeedV1 {
  readonly principalId: PrincipalId;
  readonly displayName?: string;
  readonly authorityVersion: AuthorityVersion;
}

export interface AuthorityAuthenticationSeedV1 {
  readonly authenticationRef: AuthenticationRef;
  readonly principalId: PrincipalId;
  readonly authorityVersion: AuthorityVersion;
}

export interface AuthorityTenantSeedV1 {
  readonly tenantId: TenantId;
  readonly tenantSlug: string;
  readonly displayName?: string;
  readonly aliases?: readonly string[];
  readonly authorityVersion: AuthorityVersion;
}

export interface AuthorityWorkspaceSeedV1 {
  readonly workspaceId: WorkspaceId;
  readonly tenantId: TenantId;
  readonly workspaceSlug: string;
  readonly displayName?: string;
  readonly aliases?: readonly string[];
  readonly authorityVersion: AuthorityVersion;
}

export interface AuthorityRepositorySeedV1 {
  readonly repositoryId: RepositoryId;
  readonly repositorySlug: string;
  readonly displayName?: string;
  readonly authorityVersion: AuthorityVersion;
}

export interface AuthorityWorkspaceRepositorySeedV1 {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryId;
  readonly authorityVersion: AuthorityVersion;
}

export interface AuthorityTenantMembershipSeedV1 {
  readonly tenantId: TenantId;
  readonly principalId: PrincipalId;
  readonly authorityVersion: AuthorityVersion;
}

export interface AuthorityWorkspaceGrantSeedV1 {
  readonly grantId: AuthorityGrantId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly principalId: PrincipalId;
  readonly capabilities: readonly CapabilityId[];
  readonly authorityVersion: AuthorityVersion;
  readonly grantVersion: string;
  readonly scopeVersion: ScopeVersion;
  readonly expiresAt?: string;
}

export interface PostgresAuthorityTopologyV1 {
  readonly schemaVersion: typeof POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION;
  readonly topologyId: string;
  readonly principals: readonly AuthorityPrincipalSeedV1[];
  readonly authentication: readonly AuthorityAuthenticationSeedV1[];
  readonly tenants: readonly AuthorityTenantSeedV1[];
  readonly workspaces: readonly AuthorityWorkspaceSeedV1[];
  readonly repositories: readonly AuthorityRepositorySeedV1[];
  readonly workspaceRepositories: readonly AuthorityWorkspaceRepositorySeedV1[];
  readonly memberships: readonly AuthorityTenantMembershipSeedV1[];
  readonly grants: readonly AuthorityWorkspaceGrantSeedV1[];
}

export interface PostgresAuthorityMigrationReceiptV1 {
  readonly schemaVersion: typeof POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION;
  readonly targetSchemaVersion: typeof POSTGRES_AUTHORITY_SCHEMA_VERSION;
  readonly runtimeRole: string;
  readonly appliedAt: string;
}

export interface PostgresAuthoritySeedReceiptV1 {
  readonly schemaVersion: typeof POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION;
  readonly topologyRef: ContentDigest;
  readonly topologyDigest: ContentDigest;
  readonly appliedAt: string;
  readonly counts: Readonly<{
    principals: number;
    authenticationBindings: number;
    tenants: number;
    workspaces: number;
    repositories: number;
    workspaceRepositories: number;
    memberships: number;
    grants: number;
  }>;
}

export interface PostgresAuthorityInspectionV1 {
  readonly schemaVersion: typeof POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION;
  readonly authoritySchemaVersion: number;
  readonly counts: Readonly<Record<string, number>>;
}

export interface PostgresAuthorityAdministrationV1 {
  migrate(runtimeRole: string): Promise<PostgresAuthorityMigrationReceiptV1>;
  seedTopology(topology: PostgresAuthorityTopologyV1): Promise<PostgresAuthoritySeedReceiptV1>;
  inspect(): Promise<PostgresAuthorityInspectionV1>;
  revokeGrant(request: {
    readonly grantId: AuthorityGrantId;
    readonly revokedAt: string;
    readonly authorityVersion: AuthorityVersion;
  }): Promise<void>;
}

interface CountRow extends QueryResultRow {
  count: string;
}

interface CurrentTenantSlugRow extends QueryResultRow {
  tenant_slug: string;
}

interface CurrentWorkspaceSlugRow extends QueryResultRow {
  tenant_id: string;
  workspace_slug: string;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): ContentDigest {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}` as ContentDigest;
}

function requireNonEmpty(value: string, name: string): string {
  if (value.trim().length === 0) throw new TypeError(`${name} cannot be empty.`);
  return value;
}

function requireUuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value)) throw new TypeError(`${name} must be a canonical UUID.`);
  return value;
}

function requireTimestamp(value: string, name: string): string {
  if (!Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${name} must be an ISO-compatible timestamp.`);
  }
  return value;
}

function quoteRole(role: string): string {
  if (!ROLE_PATTERN.test(role))
    throw new TypeError("runtimeRole is not a safe PostgreSQL role name.");
  return `"${role.replaceAll('"', '""')}"`;
}

function immutableSorted(values: readonly string[], name: string): readonly string[] {
  const normalized = [...new Set(values.map((value) => requireNonEmpty(value, name)))].sort();
  return Object.freeze(normalized);
}

function assertUnique(values: readonly string[], name: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new TypeError(`Duplicate ${name}: ${value}.`);
    seen.add(value);
  }
}

function assertIdentityApplied(result: { readonly rowCount: number | null }, name: string): void {
  if (result.rowCount !== 1) {
    throw new Error(`${name} conflicts with an existing immutable authority identity.`);
  }
}

function assertNoIdentityConflict(
  result: { readonly rowCount: number | null },
  name: string
): void {
  if ((result.rowCount ?? 0) > 0) {
    throw new Error(`${name} conflicts with an existing immutable authority identity.`);
  }
}

function validateTopology(topology: PostgresAuthorityTopologyV1): void {
  if (topology.schemaVersion !== POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION) {
    throw new TypeError("Unsupported PostgreSQL authority topology contract.");
  }
  requireNonEmpty(topology.topologyId, "topologyId");
  const ids = [
    ...topology.principals.map(({ principalId }) => [principalId, "principalId"] as const),
    ...topology.tenants.map(({ tenantId }) => [tenantId, "tenantId"] as const),
    ...topology.workspaces.flatMap(({ workspaceId, tenantId }) => [
      [workspaceId, "workspaceId"] as const,
      [tenantId, "workspace tenantId"] as const,
    ]),
    ...topology.repositories.map(({ repositoryId }) => [repositoryId, "repositoryId"] as const),
    ...topology.workspaceRepositories.flatMap(({ tenantId, workspaceId, repositoryId }) => [
      [tenantId, "association tenantId"] as const,
      [workspaceId, "association workspaceId"] as const,
      [repositoryId, "association repositoryId"] as const,
    ]),
    ...topology.memberships.flatMap(({ tenantId, principalId }) => [
      [tenantId, "membership tenantId"] as const,
      [principalId, "membership principalId"] as const,
    ]),
    ...topology.grants.flatMap(({ grantId, tenantId, workspaceId, principalId }) => [
      [grantId, "grantId"] as const,
      [tenantId, "grant tenantId"] as const,
      [workspaceId, "grant workspaceId"] as const,
      [principalId, "grant principalId"] as const,
    ]),
  ];
  for (const [value, name] of ids) requireUuid(value, name);
  assertUnique(
    topology.principals.map(({ principalId }) => principalId),
    "principal ID"
  );
  assertUnique(
    topology.tenants.map(({ tenantId }) => tenantId),
    "tenant ID"
  );
  assertUnique(
    topology.workspaces.map(({ workspaceId }) => workspaceId),
    "workspace ID"
  );
  assertUnique(
    topology.repositories.map(({ repositoryId }) => repositoryId),
    "repository ID"
  );
  assertUnique(
    topology.grants.map(({ grantId }) => grantId),
    "grant ID"
  );
  assertUnique(
    topology.authentication.map(({ authenticationRef }) =>
      computeAuthenticationRefDigest(authenticationRef)
    ),
    "authentication binding"
  );
  assertUnique(
    topology.tenants.flatMap(({ tenantSlug, aliases = [] }) => [tenantSlug, ...aliases]),
    "tenant slug or alias"
  );
  assertUnique(
    topology.workspaces.flatMap(({ tenantId, workspaceSlug, aliases = [] }) =>
      [workspaceSlug, ...aliases].map((slug) => `${tenantId}/${slug}`)
    ),
    "tenant-scoped workspace slug or alias"
  );
  for (const entry of topology.authentication) {
    requireNonEmpty(entry.authenticationRef, "authenticationRef");
    requireUuid(entry.principalId, "authentication principalId");
  }
  for (const entry of [...topology.tenants, ...topology.workspaces]) {
    const slug = "tenantSlug" in entry ? entry.tenantSlug : entry.workspaceSlug;
    requireNonEmpty(slug, "slug");
    immutableSorted(entry.aliases ?? [], "slug alias");
  }
  for (const grant of topology.grants) {
    immutableSorted(grant.capabilities, "grant capability");
    requireNonEmpty(grant.grantVersion, "grant version");
    if (grant.expiresAt) requireTimestamp(grant.expiresAt, "grant expiry");
  }
}

async function inTransaction<Result>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<Result>
): Promise<Result> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the administration failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

function grantDigest(grant: AuthorityWorkspaceGrantSeedV1): ContentDigest {
  return digest({
    grantId: grant.grantId,
    tenantId: grant.tenantId,
    workspaceId: grant.workspaceId,
    principalId: grant.principalId,
    capabilities: immutableSorted(grant.capabilities, "grant capability"),
    authorityVersion: grant.authorityVersion,
    grantVersion: grant.grantVersion,
    scopeVersion: grant.scopeVersion,
    expiresAt: grant.expiresAt ?? null,
  });
}

/** Explicit privileged boundary. Never pass this object to normal CLI/MCP dispatch. */
export class PostgresAuthorityAdministration implements PostgresAuthorityAdministrationV1 {
  private readonly now: () => string;

  constructor(
    private readonly pool: Pool,
    options: { readonly now?: () => string } = {}
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async migrate(runtimeRole: string): Promise<PostgresAuthorityMigrationReceiptV1> {
    const quotedRole = quoteRole(runtimeRole);
    const appliedAt = requireTimestamp(this.now(), "migration time");
    await inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('lex-authority-migrations'))");
      await client.query(POSTGRES_AUTHORITY_MIGRATION_SQL);
      const future = await client.query<{ version: number }>(
        "SELECT version FROM lex_authority_migrations WHERE version > $1 ORDER BY version LIMIT 1",
        [POSTGRES_AUTHORITY_SCHEMA_VERSION]
      );
      if (future.rows.length > 0) {
        throw new Error(
          `PostgreSQL authority schema is newer than supported version ${POSTGRES_AUTHORITY_SCHEMA_VERSION}.`
        );
      }
      await client.query(
        "INSERT INTO lex_authority_migrations (version, applied_at) VALUES ($1, $2::timestamptz) ON CONFLICT (version) DO NOTHING",
        [POSTGRES_AUTHORITY_SCHEMA_VERSION, appliedAt]
      );
      for (const table of POSTGRES_AUTHORITY_TABLES) {
        await client.query(`REVOKE ALL ON TABLE ${table} FROM ${quotedRole}`);
        await client.query(`GRANT SELECT ON TABLE ${table} TO ${quotedRole}`);
      }
      await client.query(`REVOKE ALL ON TABLE lex_authority_migrations FROM ${quotedRole}`);
      await client.query(`GRANT SELECT ON TABLE lex_authority_migrations TO ${quotedRole}`);
    });
    return Object.freeze({
      schemaVersion: POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION,
      targetSchemaVersion: POSTGRES_AUTHORITY_SCHEMA_VERSION,
      runtimeRole,
      appliedAt,
    });
  }

  async seedTopology(
    topology: PostgresAuthorityTopologyV1
  ): Promise<PostgresAuthoritySeedReceiptV1> {
    validateTopology(topology);
    const appliedAt = requireTimestamp(this.now(), "seed time");
    await inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('lex-authority-topology'))");
      for (const principal of topology.principals) {
        await client.query(
          `INSERT INTO lex_authority_principals
            (principal_id, display_name, state, authority_version)
           VALUES ($1::uuid, $2, 'active', $3)
           ON CONFLICT (principal_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             state = lex_authority_principals.state,
             authority_version = EXCLUDED.authority_version`,
          [principal.principalId, principal.displayName ?? null, principal.authorityVersion]
        );
      }
      for (const authentication of topology.authentication) {
        const applied = await client.query(
          `INSERT INTO lex_authority_authentication_refs
            (authentication_ref_digest, principal_id, state, authority_version)
           VALUES ($1, $2::uuid, 'active', $3)
           ON CONFLICT (authentication_ref_digest) DO UPDATE SET
             principal_id = lex_authority_authentication_refs.principal_id,
             state = lex_authority_authentication_refs.state,
             authority_version = EXCLUDED.authority_version
           WHERE lex_authority_authentication_refs.principal_id = EXCLUDED.principal_id`,
          [
            computeAuthenticationRefDigest(authentication.authenticationRef),
            authentication.principalId,
            authentication.authorityVersion,
          ]
        );
        assertIdentityApplied(applied, "Authentication binding");
      }
      for (const tenant of topology.tenants) {
        const currentTenant = await client.query<CurrentTenantSlugRow>(
          `SELECT tenant_slug
           FROM lex_authority_tenants
           WHERE tenant_id = $1::uuid
           FOR UPDATE`,
          [tenant.tenantId]
        );
        const canonicalSlugConflict = await client.query(
          `SELECT tenant_id
           FROM lex_authority_tenants
           WHERE tenant_slug = $1 AND tenant_id <> $2::uuid
           LIMIT 1`,
          [tenant.tenantSlug, tenant.tenantId]
        );
        assertNoIdentityConflict(canonicalSlugConflict, "Tenant slug");
        const currentSlugConflict = await client.query(
          `SELECT tenant_id
           FROM lex_authority_tenant_slug_aliases
           WHERE tenant_slug = $1 AND tenant_id <> $2::uuid
           LIMIT 1`,
          [tenant.tenantSlug, tenant.tenantId]
        );
        assertNoIdentityConflict(currentSlugConflict, "Tenant slug");
        await client.query(
          `INSERT INTO lex_authority_tenants
            (tenant_id, tenant_slug, display_name, state, authority_version)
           VALUES ($1::uuid, $2, $3, 'active', $4)
           ON CONFLICT (tenant_id) DO UPDATE SET
             tenant_slug = EXCLUDED.tenant_slug,
             display_name = EXCLUDED.display_name,
             state = lex_authority_tenants.state,
             authority_version = EXCLUDED.authority_version`,
          [tenant.tenantId, tenant.tenantSlug, tenant.displayName ?? null, tenant.authorityVersion]
        );
        const previousTenantSlug = currentTenant.rows[0]?.tenant_slug;
        const tenantAliases = immutableSorted(
          [
            ...(tenant.aliases ?? []),
            ...(previousTenantSlug && previousTenantSlug !== tenant.tenantSlug
              ? [previousTenantSlug]
              : []),
          ],
          "tenant alias"
        );
        for (const alias of tenantAliases) {
          const aliasConflict = await client.query(
            `SELECT tenant_id
             FROM lex_authority_tenants
             WHERE tenant_slug = $1 AND tenant_id <> $2::uuid
             LIMIT 1`,
            [alias, tenant.tenantId]
          );
          assertNoIdentityConflict(aliasConflict, "Tenant alias");
          const applied = await client.query(
            `INSERT INTO lex_authority_tenant_slug_aliases (tenant_slug, tenant_id)
             VALUES ($1, $2::uuid)
             ON CONFLICT (tenant_slug) DO UPDATE SET
               tenant_id = lex_authority_tenant_slug_aliases.tenant_id
             WHERE lex_authority_tenant_slug_aliases.tenant_id = EXCLUDED.tenant_id`,
            [alias, tenant.tenantId]
          );
          assertIdentityApplied(applied, "Tenant alias");
        }
      }
      for (const workspace of topology.workspaces) {
        const currentWorkspace = await client.query<CurrentWorkspaceSlugRow>(
          `SELECT tenant_id::text, workspace_slug
           FROM lex_authority_workspaces
           WHERE workspace_id = $1::uuid
           FOR UPDATE`,
          [workspace.workspaceId]
        );
        if (currentWorkspace.rows[0] && currentWorkspace.rows[0].tenant_id !== workspace.tenantId) {
          throw new Error("Workspace conflicts with an existing immutable authority identity.");
        }
        const canonicalSlugConflict = await client.query(
          `SELECT workspace_id
           FROM lex_authority_workspaces
           WHERE tenant_id = $1::uuid
             AND workspace_slug = $2
             AND workspace_id <> $3::uuid
           LIMIT 1`,
          [workspace.tenantId, workspace.workspaceSlug, workspace.workspaceId]
        );
        assertNoIdentityConflict(canonicalSlugConflict, "Workspace slug");
        const currentSlugConflict = await client.query(
          `SELECT workspace_id
           FROM lex_authority_workspace_slug_aliases
           WHERE tenant_id = $1::uuid
             AND workspace_slug = $2
             AND workspace_id <> $3::uuid
           LIMIT 1`,
          [workspace.tenantId, workspace.workspaceSlug, workspace.workspaceId]
        );
        assertNoIdentityConflict(currentSlugConflict, "Workspace slug");
        const applied = await client.query(
          `INSERT INTO lex_authority_workspaces
            (workspace_id, tenant_id, workspace_slug, display_name, state, authority_version)
           VALUES ($1::uuid, $2::uuid, $3, $4, 'active', $5)
           ON CONFLICT (workspace_id) DO UPDATE SET
             tenant_id = lex_authority_workspaces.tenant_id,
             workspace_slug = EXCLUDED.workspace_slug,
             display_name = EXCLUDED.display_name,
             state = lex_authority_workspaces.state,
             authority_version = EXCLUDED.authority_version
           WHERE lex_authority_workspaces.tenant_id = EXCLUDED.tenant_id`,
          [
            workspace.workspaceId,
            workspace.tenantId,
            workspace.workspaceSlug,
            workspace.displayName ?? null,
            workspace.authorityVersion,
          ]
        );
        assertIdentityApplied(applied, "Workspace");
        const previousWorkspaceSlug = currentWorkspace.rows[0]?.workspace_slug;
        const workspaceAliases = immutableSorted(
          [
            ...(workspace.aliases ?? []),
            ...(previousWorkspaceSlug && previousWorkspaceSlug !== workspace.workspaceSlug
              ? [previousWorkspaceSlug]
              : []),
          ],
          "workspace alias"
        );
        for (const alias of workspaceAliases) {
          const aliasConflict = await client.query(
            `SELECT workspace_id
             FROM lex_authority_workspaces
             WHERE tenant_id = $1::uuid
               AND workspace_slug = $2
               AND workspace_id <> $3::uuid
             LIMIT 1`,
            [workspace.tenantId, alias, workspace.workspaceId]
          );
          assertNoIdentityConflict(aliasConflict, "Workspace alias");
          const aliasApplied = await client.query(
            `INSERT INTO lex_authority_workspace_slug_aliases
              (tenant_id, workspace_slug, workspace_id)
             VALUES ($1::uuid, $2, $3::uuid)
             ON CONFLICT (tenant_id, workspace_slug) DO UPDATE SET
               workspace_id = lex_authority_workspace_slug_aliases.workspace_id
             WHERE lex_authority_workspace_slug_aliases.workspace_id = EXCLUDED.workspace_id`,
            [workspace.tenantId, alias, workspace.workspaceId]
          );
          assertIdentityApplied(aliasApplied, "Workspace alias");
        }
      }
      for (const repository of topology.repositories) {
        await client.query(
          `INSERT INTO lex_authority_repositories
            (repository_id, repository_slug, display_name, state, authority_version)
           VALUES ($1::uuid, $2, $3, 'active', $4)
           ON CONFLICT (repository_id) DO UPDATE SET
             repository_slug = EXCLUDED.repository_slug,
             display_name = EXCLUDED.display_name,
             state = lex_authority_repositories.state,
             authority_version = EXCLUDED.authority_version`,
          [
            repository.repositoryId,
            repository.repositorySlug,
            repository.displayName ?? null,
            repository.authorityVersion,
          ]
        );
      }
      for (const association of topology.workspaceRepositories) {
        await client.query(
          `INSERT INTO lex_authority_workspace_repositories
            (tenant_id, workspace_id, repository_id, state, authority_version)
           VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', $4)
           ON CONFLICT (tenant_id, workspace_id, repository_id) DO UPDATE SET
             state = lex_authority_workspace_repositories.state,
             authority_version = EXCLUDED.authority_version`,
          [
            association.tenantId,
            association.workspaceId,
            association.repositoryId,
            association.authorityVersion,
          ]
        );
      }
      for (const membership of topology.memberships) {
        await client.query(
          `INSERT INTO lex_authority_tenant_memberships
            (tenant_id, principal_id, state, authority_version, revoked_at)
           VALUES ($1::uuid, $2::uuid, 'active', $3, NULL)
           ON CONFLICT (tenant_id, principal_id) DO UPDATE SET
             state = lex_authority_tenant_memberships.state,
             authority_version = EXCLUDED.authority_version,
             revoked_at = lex_authority_tenant_memberships.revoked_at`,
          [membership.tenantId, membership.principalId, membership.authorityVersion]
        );
      }
      for (const grant of topology.grants) {
        const applied = await client.query(
          `INSERT INTO lex_authority_workspace_grants
            (grant_id, tenant_id, workspace_id, principal_id, capabilities,
             authority_version, grant_version, scope_version, authority_digest, expires_at,
             revoked_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::text[], $6, $7, $8, $9,
             $10::timestamptz, NULL)
           ON CONFLICT (grant_id) DO UPDATE SET
             tenant_id = lex_authority_workspace_grants.tenant_id,
             workspace_id = lex_authority_workspace_grants.workspace_id,
             principal_id = lex_authority_workspace_grants.principal_id,
             capabilities = EXCLUDED.capabilities,
             authority_version = EXCLUDED.authority_version,
             grant_version = EXCLUDED.grant_version,
             scope_version = EXCLUDED.scope_version,
             authority_digest = EXCLUDED.authority_digest,
             expires_at = EXCLUDED.expires_at,
             revoked_at = lex_authority_workspace_grants.revoked_at
           WHERE lex_authority_workspace_grants.tenant_id = EXCLUDED.tenant_id
             AND lex_authority_workspace_grants.workspace_id = EXCLUDED.workspace_id
             AND lex_authority_workspace_grants.principal_id = EXCLUDED.principal_id`,
          [
            grant.grantId,
            grant.tenantId,
            grant.workspaceId,
            grant.principalId,
            immutableSorted(grant.capabilities, "grant capability"),
            grant.authorityVersion,
            grant.grantVersion,
            grant.scopeVersion,
            grantDigest(grant),
            grant.expiresAt ?? null,
          ]
        );
        assertIdentityApplied(applied, "Workspace grant");
      }
    });

    return Object.freeze({
      schemaVersion: POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION,
      topologyRef: digest(topology.topologyId),
      topologyDigest: digest({
        ...topology,
        authentication: topology.authentication.map(
          ({ authenticationRef, principalId, authorityVersion }) => ({
            principalId,
            authorityVersion,
            authenticationRefDigest: computeAuthenticationRefDigest(authenticationRef),
          })
        ),
      }),
      appliedAt,
      counts: Object.freeze({
        principals: topology.principals.length,
        authenticationBindings: topology.authentication.length,
        tenants: topology.tenants.length,
        workspaces: topology.workspaces.length,
        repositories: topology.repositories.length,
        workspaceRepositories: topology.workspaceRepositories.length,
        memberships: topology.memberships.length,
        grants: topology.grants.length,
      }),
    });
  }

  async inspect(): Promise<PostgresAuthorityInspectionV1> {
    return inTransaction(this.pool, async (client) => {
      const version = await client.query<{ version: number | null }>(
        "SELECT MAX(version) AS version FROM lex_authority_migrations"
      );
      const counts: Record<string, number> = {};
      for (const table of POSTGRES_AUTHORITY_TABLES) {
        const result = await client.query<CountRow>(`SELECT COUNT(*)::text AS count FROM ${table}`);
        counts[table] = Number(result.rows[0]?.count ?? 0);
      }
      return Object.freeze({
        schemaVersion: POSTGRES_AUTHORITY_ADMIN_CONTRACT_VERSION,
        authoritySchemaVersion: version.rows[0]?.version ?? 0,
        counts: Object.freeze(counts),
      });
    });
  }

  async revokeGrant(request: {
    readonly grantId: AuthorityGrantId;
    readonly revokedAt: string;
    readonly authorityVersion: AuthorityVersion;
  }): Promise<void> {
    requireUuid(request.grantId, "grantId");
    requireTimestamp(request.revokedAt, "revocation time");
    requireNonEmpty(request.authorityVersion, "authorityVersion");
    await inTransaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE lex_authority_workspace_grants
         SET revoked_at = $2::timestamptz, authority_version = $3
         WHERE grant_id = $1::uuid AND revoked_at IS NULL`,
        [request.grantId, request.revokedAt, request.authorityVersion]
      );
      if (result.rowCount !== 1) {
        throw new Error("The authority grant was not active at revocation time.");
      }
    });
  }
}
