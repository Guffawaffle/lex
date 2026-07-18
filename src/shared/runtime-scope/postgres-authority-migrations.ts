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

export const POSTGRES_AUTHORITY_MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS lex_authority_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lex_authority_principals (
    principal_id UUID PRIMARY KEY,
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lex_authority_authentication_refs (
    authentication_ref_digest TEXT PRIMARY KEY
      CHECK (authentication_ref_digest ~ '^sha256:[0-9a-f]{64}$'),
    principal_id UUID NOT NULL
      REFERENCES lex_authority_principals(principal_id),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lex_authority_tenants (
    tenant_id UUID PRIMARY KEY,
    tenant_slug TEXT NOT NULL UNIQUE CHECK (length(tenant_slug) > 0),
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lex_authority_tenant_slug_aliases (
    tenant_slug TEXT PRIMARY KEY CHECK (length(tenant_slug) > 0),
    tenant_id UUID NOT NULL REFERENCES lex_authority_tenants(tenant_id),
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lex_authority_workspaces (
    workspace_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES lex_authority_tenants(tenant_id),
    workspace_slug TEXT NOT NULL CHECK (length(workspace_slug) > 0),
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lex_authority_workspaces_tenant_slug_key
      UNIQUE (tenant_id, workspace_slug),
    CONSTRAINT lex_authority_workspaces_tenant_workspace_key
      UNIQUE (tenant_id, workspace_id)
  );

  CREATE TABLE IF NOT EXISTS lex_authority_workspace_slug_aliases (
    tenant_id UUID NOT NULL REFERENCES lex_authority_tenants(tenant_id),
    workspace_slug TEXT NOT NULL CHECK (length(workspace_slug) > 0),
    workspace_id UUID NOT NULL,
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lex_authority_workspace_slug_aliases_pkey
      PRIMARY KEY (tenant_id, workspace_slug),
    CONSTRAINT lex_authority_workspace_slug_aliases_workspace_fkey
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES lex_authority_workspaces(tenant_id, workspace_id)
  );

  CREATE TABLE IF NOT EXISTS lex_authority_repositories (
    repository_id UUID PRIMARY KEY,
    repository_slug TEXT NOT NULL CHECK (length(repository_slug) > 0),
    display_name TEXT,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lex_authority_workspace_repositories (
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    repository_id UUID NOT NULL REFERENCES lex_authority_repositories(repository_id),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lex_authority_workspace_repositories_pkey
      PRIMARY KEY (tenant_id, workspace_id, repository_id),
    CONSTRAINT lex_authority_workspace_repositories_workspace_fkey
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES lex_authority_workspaces(tenant_id, workspace_id)
  );

  CREATE TABLE IF NOT EXISTS lex_authority_tenant_memberships (
    tenant_id UUID NOT NULL REFERENCES lex_authority_tenants(tenant_id),
    principal_id UUID NOT NULL REFERENCES lex_authority_principals(principal_id),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lex_authority_tenant_memberships_pkey
      PRIMARY KEY (tenant_id, principal_id)
  );

  CREATE TABLE IF NOT EXISTS lex_authority_workspace_grants (
    grant_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    principal_id UUID NOT NULL REFERENCES lex_authority_principals(principal_id),
    capabilities TEXT[] NOT NULL,
    authority_version TEXT NOT NULL CHECK (length(authority_version) > 0),
    grant_version TEXT NOT NULL CHECK (length(grant_version) > 0),
    scope_version TEXT NOT NULL CHECK (length(scope_version) > 0),
    authority_digest TEXT NOT NULL
      CHECK (authority_digest ~ '^sha256:[0-9a-f]{64}$'),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT lex_authority_workspace_grants_workspace_fkey
      FOREIGN KEY (tenant_id, workspace_id)
      REFERENCES lex_authority_workspaces(tenant_id, workspace_id),
    CONSTRAINT lex_authority_workspace_grants_membership_fkey
      FOREIGN KEY (tenant_id, principal_id)
      REFERENCES lex_authority_tenant_memberships(tenant_id, principal_id),
    CONSTRAINT lex_authority_workspace_grants_capabilities_nonempty
      CHECK (array_position(capabilities, '') IS NULL)
  );

  CREATE INDEX IF NOT EXISTS lex_authority_workspace_grants_resolution_idx
    ON lex_authority_workspace_grants
      (principal_id, tenant_id, workspace_id, grant_id);
  CREATE INDEX IF NOT EXISTS lex_authority_workspace_repositories_repository_idx
    ON lex_authority_workspace_repositories (repository_id, tenant_id, workspace_id);

  REVOKE ALL ON TABLE lex_authority_migrations FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_principals FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_authentication_refs FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_tenants FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_tenant_slug_aliases FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_workspaces FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_workspace_slug_aliases FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_repositories FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_workspace_repositories FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_tenant_memberships FROM PUBLIC;
  REVOKE ALL ON TABLE lex_authority_workspace_grants FROM PUBLIC;
`;
