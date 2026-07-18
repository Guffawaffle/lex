import type { PostgresSchemaTargetV1 } from "./postgres-schema.js";

export const POSTGRES_AUTHORITY_SCHEMA_VERSION = 1 as const;

export const POSTGRES_AUTHORITY_TABLES = Object.freeze([
  "lex_authority_principals",
  "lex_authority_authentication_refs",
  "lex_authority_tenants",
  "lex_authority_tenant_slug_aliases",
  "lex_authority_workspaces",
  "lex_authority_workspace_slug_aliases",
  "lex_authority_repositories",
  "lex_authority_workspace_repositories",
  "lex_authority_tenant_memberships",
  "lex_authority_workspace_grants",
] as const);

export function postgresAuthorityMigrationSql(target: PostgresSchemaTargetV1): string {
  const migrations = target.relation("lex_authority_migrations");
  const principals = target.relation("lex_authority_principals");
  const authenticationRefs = target.relation("lex_authority_authentication_refs");
  const tenants = target.relation("lex_authority_tenants");
  const tenantSlugAliases = target.relation("lex_authority_tenant_slug_aliases");
  const workspaces = target.relation("lex_authority_workspaces");
  const workspaceSlugAliases = target.relation("lex_authority_workspace_slug_aliases");
  const repositories = target.relation("lex_authority_repositories");
  const workspaceRepositories = target.relation("lex_authority_workspace_repositories");
  const tenantMemberships = target.relation("lex_authority_tenant_memberships");
  const workspaceGrants = target.relation("lex_authority_workspace_grants");
  return `
  CREATE TABLE IF NOT EXISTS ${migrations} (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
  );

  CREATE TABLE IF NOT EXISTS ${principals} (
    principal_id UUID PRIMARY KEY,
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
  );

  CREATE TABLE IF NOT EXISTS ${authenticationRefs} (
    authentication_ref_digest TEXT PRIMARY KEY
      CHECK (authentication_ref_digest ~ '^sha256:[0-9a-f]{64}$'),
    principal_id UUID NOT NULL
      REFERENCES ${principals}(principal_id),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
  );

  CREATE TABLE IF NOT EXISTS ${tenants} (
    tenant_id UUID PRIMARY KEY,
    tenant_slug TEXT NOT NULL UNIQUE CHECK (pg_catalog.length(tenant_slug) > 0),
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
  );

  CREATE TABLE IF NOT EXISTS ${tenantSlugAliases} (
    tenant_slug TEXT PRIMARY KEY CHECK (pg_catalog.length(tenant_slug) > 0),
    tenant_id UUID NOT NULL REFERENCES ${tenants}(tenant_id),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
  );

  CREATE TABLE IF NOT EXISTS ${workspaces} (
    workspace_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES ${tenants}(tenant_id),
    workspace_slug TEXT NOT NULL CHECK (pg_catalog.length(workspace_slug) > 0),
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT lex_authority_workspaces_tenant_slug_key
      UNIQUE (tenant_id, workspace_slug),
    CONSTRAINT lex_authority_workspaces_tenant_workspace_key
      UNIQUE (tenant_id, workspace_id)
  );

  CREATE TABLE IF NOT EXISTS ${workspaceSlugAliases} (
    tenant_id UUID NOT NULL REFERENCES ${tenants}(tenant_id),
    workspace_slug TEXT NOT NULL CHECK (pg_catalog.length(workspace_slug) > 0),
    workspace_id UUID NOT NULL,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT lex_authority_workspace_slug_aliases_pkey
      PRIMARY KEY (tenant_id, workspace_slug),
    CONSTRAINT lex_authority_workspace_slug_aliases_workspace_fkey
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES ${workspaces}(tenant_id, workspace_id)
  );

  CREATE TABLE IF NOT EXISTS ${repositories} (
    repository_id UUID PRIMARY KEY,
    repository_slug TEXT NOT NULL CHECK (pg_catalog.length(repository_slug) > 0),
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
  );

  CREATE TABLE IF NOT EXISTS ${workspaceRepositories} (
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    repository_id UUID NOT NULL REFERENCES ${repositories}(repository_id),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT lex_authority_workspace_repositories_pkey
      PRIMARY KEY (tenant_id, workspace_id, repository_id),
    CONSTRAINT lex_authority_workspace_repositories_workspace_fkey
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES ${workspaces}(tenant_id, workspace_id)
  );

  CREATE TABLE IF NOT EXISTS ${tenantMemberships} (
    tenant_id UUID NOT NULL REFERENCES ${tenants}(tenant_id),
    principal_id UUID NOT NULL REFERENCES ${principals}(principal_id),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT lex_authority_tenant_memberships_pkey
      PRIMARY KEY (tenant_id, principal_id)
  );

  CREATE TABLE IF NOT EXISTS ${workspaceGrants} (
    grant_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    principal_id UUID NOT NULL REFERENCES ${principals}(principal_id),
    capabilities TEXT[] NOT NULL,
    authority_version TEXT NOT NULL CHECK (pg_catalog.length(authority_version) > 0),
    grant_version TEXT NOT NULL CHECK (pg_catalog.length(grant_version) > 0),
    scope_version TEXT NOT NULL CHECK (pg_catalog.length(scope_version) > 0),
    authority_digest TEXT NOT NULL
      CHECK (authority_digest ~ '^sha256:[0-9a-f]{64}$'),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    CONSTRAINT lex_authority_workspace_grants_workspace_fkey
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES ${workspaces}(tenant_id, workspace_id),
    CONSTRAINT lex_authority_workspace_grants_membership_fkey
      FOREIGN KEY (tenant_id, principal_id)
      REFERENCES ${tenantMemberships}(tenant_id, principal_id),
    CONSTRAINT lex_authority_workspace_grants_capabilities_nonempty
      CHECK (pg_catalog.array_position(capabilities, '') IS NULL)
  );

  CREATE INDEX IF NOT EXISTS "lex_authority_workspace_grants_resolution_idx"
    ON ${workspaceGrants}
      (principal_id, tenant_id, workspace_id, grant_id);
  CREATE INDEX IF NOT EXISTS "lex_authority_workspace_repositories_repository_idx"
    ON ${workspaceRepositories} (repository_id, tenant_id, workspace_id);

  REVOKE ALL ON TABLE ${migrations} FROM PUBLIC;
  REVOKE ALL ON TABLE ${principals} FROM PUBLIC;
  REVOKE ALL ON TABLE ${authenticationRefs} FROM PUBLIC;
  REVOKE ALL ON TABLE ${tenants} FROM PUBLIC;
  REVOKE ALL ON TABLE ${tenantSlugAliases} FROM PUBLIC;
  REVOKE ALL ON TABLE ${workspaces} FROM PUBLIC;
  REVOKE ALL ON TABLE ${workspaceSlugAliases} FROM PUBLIC;
  REVOKE ALL ON TABLE ${repositories} FROM PUBLIC;
  REVOKE ALL ON TABLE ${workspaceRepositories} FROM PUBLIC;
  REVOKE ALL ON TABLE ${tenantMemberships} FROM PUBLIC;
  REVOKE ALL ON TABLE ${workspaceGrants} FROM PUBLIC;
`;
}
