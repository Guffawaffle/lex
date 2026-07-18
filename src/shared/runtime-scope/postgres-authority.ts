import { createHash } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  AUTHORITY_DIRECTORY_CONTRACT_VERSION,
  type AuthorityDirectory,
  type AuthorizedWorkspaceGrantV1,
  type ConsistentAuthorityDirectory,
  type PrincipalIdentityV1,
  type PrincipalResolutionRequestV1,
  type RepositoryAuthorizationRequestV1,
  type RepositoryRecordV1,
  type RepositoryScopedAuthorityDirectory,
  type RepositorySelectorV1,
  type TenantRecordV1,
  type TenantSelectorV1,
  type WorkspaceAuthorizationDecisionV1,
  type WorkspaceAuthorizationRequestV1,
  type WorkspaceRecordV1,
  type WorkspaceSelectorV1,
} from "./authority.js";
import type {
  AuthenticationRef,
  AuthorityGrantId,
  AuthorityVersion,
  CapabilityId,
  ContentDigest,
  PrincipalId,
  RepositoryId,
  RepositorySlug,
  ScopeVersion,
  TenantId,
  TenantSlug,
  WorkspaceId,
  WorkspaceSlug,
} from "./ids.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

interface PrincipalRow extends QueryResultRow {
  principal_id: string;
  display_name: string | null;
  state: string;
  authority_version: string;
}

interface TenantRow extends QueryResultRow {
  tenant_id: string;
  tenant_slug: string;
  display_name: string | null;
  state: string;
  authority_version: string;
}

interface WorkspaceRow extends QueryResultRow {
  workspace_id: string;
  tenant_id: string;
  workspace_slug: string;
  display_name: string | null;
  state: string;
  authority_version: string;
}

interface RepositoryRow extends QueryResultRow {
  repository_id: string;
  repository_slug: string;
  display_name: string | null;
  state: string;
  authority_version: string;
}

interface MembershipRow extends QueryResultRow {
  state: string;
  revoked_at: string | Date | null;
  authority_version: string;
}

interface GrantRow extends QueryResultRow {
  grant_id: string;
  tenant_id: string;
  workspace_id: string;
  principal_id: string;
  capabilities: string[];
  authority_version: string;
  grant_version: string;
  scope_version: string;
  authority_digest: string;
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
}

interface RuntimeRoleBoundaryRow extends QueryResultRow {
  schema_version: number | null;
  role_is_superuser: boolean;
  role_bypasses_rls: boolean;
  role_owns_authority: boolean;
  role_can_mutate_authority: boolean;
}

export interface PostgresAuthorityDirectoryOptionsV1 {
  /** Tests may disable only the role probe; production defaults fail closed. */
  readonly enforceRuntimeRole?: boolean;
  readonly now?: () => string;
}

function authenticationRefDigest(authenticationRef: AuthenticationRef): string {
  if (authenticationRef.trim().length === 0) {
    throw new TypeError("authenticationRef cannot be empty.");
  }
  return `sha256:${createHash("sha256").update(authenticationRef).digest("hex")}`;
}

function canonicalState(state: string): "active" | "revoked" {
  if (state !== "active" && state !== "revoked") {
    throw new TypeError("Canonical authority returned an unsupported record state.");
  }
  return state;
}

function nonEmpty(value: string, name: string): string {
  if (value.trim().length === 0) throw new TypeError(`${name} cannot be empty.`);
  return value;
}

function timestamp(value: string | Date, name: string): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new TypeError(`${name} must be an ISO-compatible timestamp.`);
  }
  return normalized;
}

function oneUnambiguous<Row extends QueryResultRow>(
  rows: readonly Row[],
  name: string
): Row | null {
  if (rows.length > 1) throw new TypeError(`Canonical authority returned an ambiguous ${name}.`);
  return rows[0] ?? null;
}

function principalRecord(row: PrincipalRow): PrincipalIdentityV1 {
  return Object.freeze({
    schemaVersion: AUTHORITY_DIRECTORY_CONTRACT_VERSION,
    principalId: nonEmpty(row.principal_id, "principal ID") as PrincipalId,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    state: canonicalState(row.state),
    authorityVersion: nonEmpty(row.authority_version, "authority version") as AuthorityVersion,
  });
}

function tenantRecord(row: TenantRow): TenantRecordV1 {
  return Object.freeze({
    schemaVersion: AUTHORITY_DIRECTORY_CONTRACT_VERSION,
    tenantId: nonEmpty(row.tenant_id, "tenant ID") as TenantId,
    tenantSlug: nonEmpty(row.tenant_slug, "tenant slug") as TenantSlug,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    state: canonicalState(row.state),
    authorityVersion: nonEmpty(row.authority_version, "authority version") as AuthorityVersion,
  });
}

function workspaceRecord(row: WorkspaceRow): WorkspaceRecordV1 {
  return Object.freeze({
    schemaVersion: AUTHORITY_DIRECTORY_CONTRACT_VERSION,
    workspaceId: nonEmpty(row.workspace_id, "workspace ID") as WorkspaceId,
    tenantId: nonEmpty(row.tenant_id, "tenant ID") as TenantId,
    workspaceSlug: nonEmpty(row.workspace_slug, "workspace slug") as WorkspaceSlug,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    state: canonicalState(row.state),
    authorityVersion: nonEmpty(row.authority_version, "authority version") as AuthorityVersion,
  });
}

function repositoryRecord(row: RepositoryRow): RepositoryRecordV1 {
  return Object.freeze({
    schemaVersion: AUTHORITY_DIRECTORY_CONTRACT_VERSION,
    repositoryId: nonEmpty(row.repository_id, "repository ID") as RepositoryId,
    repositorySlug: nonEmpty(row.repository_slug, "repository slug") as RepositorySlug,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    state: canonicalState(row.state),
    authorityVersion: nonEmpty(row.authority_version, "authority version") as AuthorityVersion,
  });
}

function grantRecord(
  row: GrantRow,
  verifiedAt: string,
  requestedCapabilities: readonly CapabilityId[]
): AuthorizedWorkspaceGrantV1 {
  if (!Array.isArray(row.capabilities) || !row.capabilities.every((value) => value.length > 0)) {
    throw new TypeError("Canonical authority returned invalid grant capabilities.");
  }
  if (!SHA256_PATTERN.test(row.authority_digest)) {
    throw new TypeError("Canonical authority returned an invalid authority digest.");
  }
  nonEmpty(row.grant_version, "grant version");
  return Object.freeze({
    schemaVersion: AUTHORITY_DIRECTORY_CONTRACT_VERSION,
    grantId: nonEmpty(row.grant_id, "grant ID") as AuthorityGrantId,
    tenantId: nonEmpty(row.tenant_id, "tenant ID") as TenantId,
    workspaceId: nonEmpty(row.workspace_id, "workspace ID") as WorkspaceId,
    principalId: nonEmpty(row.principal_id, "principal ID") as PrincipalId,
    capabilities: Object.freeze([...new Set(requestedCapabilities)].sort()),
    authorityVersion: nonEmpty(row.authority_version, "authority version") as AuthorityVersion,
    scopeVersion: nonEmpty(row.scope_version, "scope version") as ScopeVersion,
    authorityDigest: row.authority_digest as ContentDigest,
    verifiedAt,
    ...(row.expires_at ? { expiresAt: timestamp(row.expires_at, "grant expiry") } : {}),
  });
}

async function assertReadOnlyRuntimeRole(client: PoolClient): Promise<void> {
  const result = await client.query<RuntimeRoleBoundaryRow>(`
    SELECT
      (SELECT MAX(version) FROM lex_authority_migrations) AS schema_version,
      role.rolsuper AS role_is_superuser,
      role.rolbypassrls AS role_bypasses_rls,
      EXISTS (
        SELECT 1
        FROM pg_class relation
        WHERE relation.relname LIKE 'lex_authority_%'
          AND relation.relowner = role.oid
      ) AS role_owns_authority,
      EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
          'lex_authority_principals',
          'lex_authority_authentication_refs',
          'lex_authority_tenants',
          'lex_authority_tenant_slug_aliases',
          'lex_authority_workspaces',
          'lex_authority_workspace_slug_aliases',
          'lex_authority_repositories',
          'lex_authority_workspace_repositories',
          'lex_authority_tenant_memberships',
          'lex_authority_workspace_grants'
        ]) AS authority_table(table_name)
        WHERE to_regclass(authority_table.table_name) IS NOT NULL
          AND has_table_privilege(
            current_user,
            authority_table.table_name,
            'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
          )
      ) AS role_can_mutate_authority
    FROM pg_roles role
    WHERE role.rolname = current_user
  `);
  const boundary = result.rows[0];
  if (
    !boundary ||
    boundary.schema_version !== 1 ||
    boundary.role_is_superuser ||
    boundary.role_bypasses_rls ||
    boundary.role_owns_authority ||
    boundary.role_can_mutate_authority
  ) {
    throw new Error("PostgreSQL canonical authority requires a read-only non-owner runtime role.");
  }
}

class PostgresAuthoritySnapshot implements AuthorityDirectory, RepositoryScopedAuthorityDirectory {
  constructor(
    private readonly client: PoolClient,
    private readonly verifiedAt: string
  ) {}

  async resolvePrincipal(
    request: PrincipalResolutionRequestV1
  ): Promise<PrincipalIdentityV1 | null> {
    const result = await this.client.query<PrincipalRow>(
      `
        SELECT
          principal.principal_id::text,
          principal.display_name,
          principal.state,
          principal.authority_version
        FROM lex_authority_authentication_refs authentication
        JOIN lex_authority_principals principal
          ON principal.principal_id = authentication.principal_id
        WHERE authentication.authentication_ref_digest = $1
          AND authentication.state = 'active'
        ORDER BY principal.principal_id
        LIMIT 2
      `,
      [authenticationRefDigest(request.authenticationRef)]
    );
    const row = oneUnambiguous(result.rows, "authentication binding");
    return row ? principalRecord(row) : null;
  }

  async getTenant(selector: TenantSelectorV1): Promise<TenantRecordV1 | null> {
    const result =
      "tenantId" in selector
        ? await this.client.query<TenantRow>(
            `
              SELECT tenant_id::text, tenant_slug, display_name, state, authority_version
              FROM lex_authority_tenants
              WHERE tenant_id = $1::uuid
              LIMIT 2
            `,
            [selector.tenantId]
          )
        : await this.client.query<TenantRow>(
            `
              SELECT DISTINCT
                tenant.tenant_id::text,
                tenant.tenant_slug,
                tenant.display_name,
                tenant.state,
                tenant.authority_version
              FROM lex_authority_tenants tenant
              LEFT JOIN lex_authority_tenant_slug_aliases alias
                ON alias.tenant_id = tenant.tenant_id
              WHERE tenant.tenant_slug = $1 OR alias.tenant_slug = $1
              ORDER BY tenant.tenant_id
              LIMIT 2
            `,
            [selector.tenantSlug]
          );
    const row = oneUnambiguous(result.rows, "tenant selector");
    return row ? tenantRecord(row) : null;
  }

  async getWorkspace(selector: WorkspaceSelectorV1): Promise<WorkspaceRecordV1 | null> {
    if ("workspaceId" in selector) {
      const result = await this.client.query<WorkspaceRow>(
        `
          SELECT workspace_id::text, tenant_id::text, workspace_slug,
            display_name, state, authority_version
          FROM lex_authority_workspaces
          WHERE workspace_id = $1::uuid
          LIMIT 2
        `,
        [selector.workspaceId]
      );
      const row = oneUnambiguous(result.rows, "workspace selector");
      return row ? workspaceRecord(row) : null;
    }
    const tenant = await this.getTenant(selector.tenant);
    if (!tenant) return null;
    const result = await this.client.query<WorkspaceRow>(
      `
        SELECT DISTINCT
          workspace.workspace_id::text,
          workspace.tenant_id::text,
          workspace.workspace_slug,
          workspace.display_name,
          workspace.state,
          workspace.authority_version
        FROM lex_authority_workspaces workspace
        LEFT JOIN lex_authority_workspace_slug_aliases alias
          ON alias.tenant_id = workspace.tenant_id
          AND alias.workspace_id = workspace.workspace_id
        WHERE workspace.tenant_id = $1::uuid
          AND (workspace.workspace_slug = $2 OR alias.workspace_slug = $2)
        ORDER BY workspace.workspace_id
        LIMIT 2
      `,
      [tenant.tenantId, selector.workspaceSlug]
    );
    const row = oneUnambiguous(result.rows, "workspace selector");
    return row ? workspaceRecord(row) : null;
  }

  async getRepository(selector: RepositorySelectorV1): Promise<RepositoryRecordV1 | null> {
    const result = await this.client.query<RepositoryRow>(
      `
        SELECT repository_id::text, repository_slug, display_name, state, authority_version
        FROM lex_authority_repositories
        WHERE repository_id = $1::uuid
        LIMIT 2
      `,
      [selector.repositoryId]
    );
    const row = oneUnambiguous(result.rows, "repository selector");
    return row ? repositoryRecord(row) : null;
  }

  async authorizeRepository(request: RepositoryAuthorizationRequestV1): Promise<boolean> {
    const result = await this.client.query<{ authorized: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM lex_authority_workspace_repositories association
          JOIN lex_authority_workspaces workspace
            ON workspace.tenant_id = association.tenant_id
            AND workspace.workspace_id = association.workspace_id
          JOIN lex_authority_repositories repository
            ON repository.repository_id = association.repository_id
          WHERE association.tenant_id = $1::uuid
            AND association.workspace_id = $2::uuid
            AND association.repository_id = $3::uuid
            AND association.state = 'active'
            AND workspace.state = 'active'
            AND repository.state = 'active'
        ) AS authorized
      `,
      [request.tenantId, request.workspaceId, request.repositoryId]
    );
    return result.rows[0]?.authorized === true;
  }

  async authorizeWorkspace(
    request: WorkspaceAuthorizationRequestV1
  ): Promise<WorkspaceAuthorizationDecisionV1> {
    const principal = await this.client.query<PrincipalRow>(
      `
        SELECT principal_id::text, display_name, state, authority_version
        FROM lex_authority_principals
        WHERE principal_id = $1::uuid
        LIMIT 2
      `,
      [request.principalId]
    );
    const principalRow = oneUnambiguous(principal.rows, "principal");
    if (!principalRow || principalRow.state !== "active") {
      return Object.freeze({ authorized: false, reason: "principal-unknown" });
    }

    let tenant: TenantRecordV1 | null = null;
    if (!("workspaceId" in request.workspace)) {
      tenant = await this.getTenant(request.workspace.tenant);
      if (!tenant || tenant.state !== "active") {
        return Object.freeze({ authorized: false, reason: "tenant-unknown" });
      }
    }
    const workspace = await this.getWorkspace(request.workspace);
    if (!workspace || workspace.state !== "active") {
      return Object.freeze({ authorized: false, reason: "workspace-unknown" });
    }
    tenant ??= await this.getTenant({ tenantId: workspace.tenantId });
    if (!tenant || tenant.state !== "active" || tenant.tenantId !== workspace.tenantId) {
      return Object.freeze({ authorized: false, reason: "tenant-unknown" });
    }

    const memberships = await this.client.query<MembershipRow>(
      `
        SELECT state, revoked_at, authority_version
        FROM lex_authority_tenant_memberships
        WHERE tenant_id = $1::uuid AND principal_id = $2::uuid
        LIMIT 2
      `,
      [tenant.tenantId, request.principalId]
    );
    const membership = oneUnambiguous(memberships.rows, "tenant membership");
    if (!membership) {
      return Object.freeze({ authorized: false, reason: "membership-missing" });
    }
    if (membership.state !== "active" || membership.revoked_at) {
      return Object.freeze({
        authorized: false,
        reason: "grant-revoked",
        authorityVersion: membership.authority_version as AuthorityVersion,
      });
    }

    const grants = await this.client.query<GrantRow>(
      `
        SELECT
          grant_id::text,
          tenant_id::text,
          workspace_id::text,
          principal_id::text,
          capabilities,
          authority_version,
          grant_version,
          scope_version,
          authority_digest,
          expires_at,
          revoked_at
        FROM lex_authority_workspace_grants
        WHERE tenant_id = $1::uuid
          AND workspace_id = $2::uuid
          AND principal_id = $3::uuid
        ORDER BY grant_id
      `,
      [tenant.tenantId, workspace.workspaceId, request.principalId]
    );
    if (grants.rows.length === 0) {
      return Object.freeze({ authorized: false, reason: "membership-missing" });
    }
    const active = grants.rows.filter((grant) => grant.revoked_at === null);
    if (active.length === 0) {
      return Object.freeze({
        authorized: false,
        reason: "grant-revoked",
        authorityVersion: grants.rows[0]!.authority_version as AuthorityVersion,
      });
    }
    const currentTime = Date.parse(this.verifiedAt);
    const current = active.filter(
      (grant) =>
        grant.expires_at === null ||
        Date.parse(timestamp(grant.expires_at, "grant expiry")) > currentTime
    );
    if (current.length === 0) {
      return Object.freeze({
        authorized: false,
        reason: "grant-expired",
        authorityVersion: active[0]!.authority_version as AuthorityVersion,
      });
    }
    const capable = current.find((grant) =>
      request.requestedCapabilities.every((capability) => grant.capabilities.includes(capability))
    );
    if (!capable) {
      return Object.freeze({
        authorized: false,
        reason: "capability-missing",
        authorityVersion: current[0]!.authority_version as AuthorityVersion,
      });
    }
    return Object.freeze({
      authorized: true,
      grant: grantRecord(capable, this.verifiedAt, request.requestedCapabilities),
    });
  }
}

/** PostgreSQL canonical authority. Every public operation uses one read-only snapshot. */
export class PostgresAuthorityDirectory
  implements ConsistentAuthorityDirectory, RepositoryScopedAuthorityDirectory
{
  private readonly enforceRuntimeRole: boolean;
  private readonly now: () => string;

  constructor(
    private readonly pool: Pool,
    options: PostgresAuthorityDirectoryOptionsV1 = {}
  ) {
    this.enforceRuntimeRole = options.enforceRuntimeRole ?? true;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async withConsistentSnapshot<Result>(
    operation: (directory: AuthorityDirectory) => Promise<Result>
  ): Promise<Result> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      if (this.enforceRuntimeRole) await assertReadOnlyRuntimeRole(client);
      const verifiedAt = timestamp(this.now(), "authority verification time");
      const snapshot = new PostgresAuthoritySnapshot(client, verifiedAt);
      const result = await operation(snapshot);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the authority failure; a poisoned connection is released below.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  resolvePrincipal(request: PrincipalResolutionRequestV1): Promise<PrincipalIdentityV1 | null> {
    return this.withConsistentSnapshot((directory) => directory.resolvePrincipal(request));
  }

  getTenant(selector: TenantSelectorV1): Promise<TenantRecordV1 | null> {
    return this.withConsistentSnapshot((directory) => directory.getTenant(selector));
  }

  getWorkspace(selector: WorkspaceSelectorV1): Promise<WorkspaceRecordV1 | null> {
    return this.withConsistentSnapshot((directory) => directory.getWorkspace(selector));
  }

  getRepository(selector: RepositorySelectorV1): Promise<RepositoryRecordV1 | null> {
    return this.withConsistentSnapshot((directory) => directory.getRepository(selector));
  }

  authorizeWorkspace(
    request: WorkspaceAuthorizationRequestV1
  ): Promise<WorkspaceAuthorizationDecisionV1> {
    return this.withConsistentSnapshot((directory) => directory.authorizeWorkspace(request));
  }

  authorizeRepository(request: RepositoryAuthorizationRequestV1): Promise<boolean> {
    return this.withConsistentSnapshot((directory) => {
      if (!(directory instanceof PostgresAuthoritySnapshot)) return Promise.resolve(false);
      return directory.authorizeRepository(request);
    });
  }
}

export { authenticationRefDigest as computeAuthenticationRefDigest };
