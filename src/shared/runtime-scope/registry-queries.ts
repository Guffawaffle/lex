/** Curated, parameterized SQL for the surface-local runtime-scope registry. */

import type Database from "better-sqlite3-multiple-ciphers";

export interface RegistryIdentityRow {
  registry_instance_id: string;
  execution_surface_id: string;
  surface_evidence_digest: string;
  native_platform: string;
  surface_kind: string;
  wsl_distribution: string | null;
  created_at: string;
}

export interface BindingRow {
  binding_id: string;
  registry_instance_id: string;
  execution_surface_id: string;
  workspace_instance_id: string;
  repository_instance_id: string;
  tenant_id: string;
  workspace_id: string;
  repository_id: string;
  canonical_root: string;
  manifest_digest: string | null;
  git_common_directory_digest: string | null;
  filesystem_evidence_digest: string | null;
  provider: string | null;
  provider_repository_id: string | null;
  provider_remote_digest: string | null;
  authority_source: string;
  authority_version: string;
  authority_digest: string;
  authority_verified_at: string;
  authority_expires_at: string;
  authority_revoked_at: string | null;
  state: "active" | "revoked";
  created_at: string;
  last_verified_at: string | null;
  revoked_at: string | null;
  registered_by_principal_id: string;
}

export interface BindingEventRow {
  receipt_id: string;
  binding_id: string;
  action: "register" | "rebind" | "revoke";
  registry_instance_id: string;
  execution_surface_id: string;
  repository_instance_id: string;
  workspace_instance_id: string;
  evidence_digest: string;
  authority_digest: string;
  actor_principal_id: string;
  created_at: string;
  reason: string | null;
}

export interface BindingUpdateRow {
  binding_id: string;
  canonical_root: string;
  manifest_digest: string | null;
  git_common_directory_digest: string | null;
  filesystem_evidence_digest: string | null;
  provider: string | null;
  provider_repository_id: string | null;
  provider_remote_digest: string | null;
  authority_source: string;
  authority_version: string;
  authority_digest: string;
  authority_verified_at: string;
  authority_expires_at: string;
  authority_revoked_at: string | null;
  last_verified_at: string;
}

export function listLocalRegistryTableNames(db: Database.Database): readonly string[] {
  return (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>
  ).map(({ name }) => name);
}

export function readLocalRegistryMigrationVersion(db: Database.Database): number | null {
  if (!new Set(listLocalRegistryTableNames(db)).has("local_registry_migrations")) return null;
  const row = db.prepare("SELECT MAX(version) AS version FROM local_registry_migrations").get() as {
    version: number | null;
  };
  return row.version;
}

export function createLocalRegistrySchemaV1(db: Database.Database): void {
  db.exec(`
    CREATE TABLE local_registry_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE local_registry_identity (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      registry_instance_id TEXT NOT NULL UNIQUE,
      execution_surface_id TEXT NOT NULL UNIQUE,
      surface_evidence_digest TEXT NOT NULL,
      native_platform TEXT NOT NULL,
      surface_kind TEXT NOT NULL,
      wsl_distribution TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE repository_bindings (
      binding_id TEXT PRIMARY KEY,
      registry_instance_id TEXT NOT NULL,
      execution_surface_id TEXT NOT NULL,
      workspace_instance_id TEXT NOT NULL,
      repository_instance_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      repository_id TEXT NOT NULL,
      canonical_root TEXT NOT NULL,
      manifest_digest TEXT,
      git_common_directory_digest TEXT,
      filesystem_evidence_digest TEXT,
      provider TEXT,
      provider_repository_id TEXT,
      provider_remote_digest TEXT,
      authority_source TEXT NOT NULL,
      authority_version TEXT NOT NULL,
      authority_digest TEXT NOT NULL,
      authority_verified_at TEXT NOT NULL,
      authority_expires_at TEXT NOT NULL,
      authority_revoked_at TEXT,
      state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
      created_at TEXT NOT NULL,
      last_verified_at TEXT,
      revoked_at TEXT,
      registered_by_principal_id TEXT NOT NULL,
      FOREIGN KEY (registry_instance_id) REFERENCES local_registry_identity(registry_instance_id),
      FOREIGN KEY (execution_surface_id) REFERENCES local_registry_identity(execution_surface_id)
    );

    CREATE UNIQUE INDEX repository_bindings_active_instance_workspace_key
      ON repository_bindings(repository_instance_id, workspace_id)
      WHERE state = 'active';
    CREATE INDEX repository_bindings_active_root_idx
      ON repository_bindings(state, canonical_root);
    CREATE INDEX repository_bindings_scope_idx
      ON repository_bindings(tenant_id, workspace_id, repository_id, state);
    CREATE INDEX repository_bindings_provider_idx
      ON repository_bindings(provider, provider_repository_id, state);
    CREATE INDEX repository_bindings_git_common_idx
      ON repository_bindings(git_common_directory_digest, state);

    CREATE VIEW local_registry_binding_rows AS
      SELECT
        binding_id,
        registry_instance_id,
        execution_surface_id,
        workspace_instance_id,
        repository_instance_id,
        tenant_id,
        workspace_id,
        repository_id,
        canonical_root,
        manifest_digest,
        git_common_directory_digest,
        filesystem_evidence_digest,
        provider,
        provider_repository_id,
        provider_remote_digest,
        authority_source,
        authority_version,
        authority_digest,
        authority_verified_at,
        authority_expires_at,
        authority_revoked_at,
        state,
        created_at,
        last_verified_at,
        revoked_at,
        registered_by_principal_id
      FROM repository_bindings;

    CREATE TABLE binding_events (
      receipt_id TEXT PRIMARY KEY,
      binding_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('register', 'rebind', 'revoke')),
      registry_instance_id TEXT NOT NULL,
      execution_surface_id TEXT NOT NULL,
      repository_instance_id TEXT NOT NULL,
      workspace_instance_id TEXT NOT NULL,
      evidence_digest TEXT NOT NULL,
      authority_digest TEXT NOT NULL,
      actor_principal_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reason TEXT,
      FOREIGN KEY (binding_id) REFERENCES repository_bindings(binding_id)
    );

    CREATE INDEX binding_events_binding_created_idx
      ON binding_events(binding_id, created_at, receipt_id);
  `);
}

export function insertLocalRegistryIdentity(
  db: Database.Database,
  identity: RegistryIdentityRow
): void {
  db.prepare(
    `INSERT INTO local_registry_identity (
      singleton,
      registry_instance_id,
      execution_surface_id,
      surface_evidence_digest,
      native_platform,
      surface_kind,
      wsl_distribution,
      created_at
    ) VALUES (1, @registry_instance_id, @execution_surface_id, @surface_evidence_digest,
      @native_platform, @surface_kind, @wsl_distribution, @created_at)`
  ).run(identity);
}

export function insertLocalRegistryMigration(
  db: Database.Database,
  version: number,
  appliedAt: string
): void {
  db.prepare("INSERT INTO local_registry_migrations (version, applied_at) VALUES (?, ?)").run(
    version,
    appliedAt
  );
}

export function setLocalRegistrySchemaIdentity(
  db: Database.Database,
  applicationId: number,
  schemaVersion: number
): void {
  db.pragma(`application_id = ${applicationId}`);
  db.pragma(`user_version = ${schemaVersion}`);
}

export function readLocalRegistryIdentity(db: Database.Database): RegistryIdentityRow | undefined {
  return db
    .prepare(
      `SELECT
        registry_instance_id,
        execution_surface_id,
        surface_evidence_digest,
        native_platform,
        surface_kind,
        wsl_distribution,
        created_at
      FROM local_registry_identity
      WHERE singleton = 1`
    )
    .get() as RegistryIdentityRow | undefined;
}

export function readLocalRegistryApplicationId(db: Database.Database): number {
  return db.pragma("application_id", { simple: true }) as number;
}

export function readLocalRegistryBinding(
  db: Database.Database,
  bindingId: string
): BindingRow | undefined {
  return db
    .prepare("SELECT * FROM local_registry_binding_rows WHERE binding_id = ?")
    .get(bindingId) as BindingRow | undefined;
}

export function insertLocalRegistryEvent(db: Database.Database, event: BindingEventRow): void {
  db.prepare(
    `INSERT INTO binding_events (
      receipt_id,
      binding_id,
      action,
      registry_instance_id,
      execution_surface_id,
      repository_instance_id,
      workspace_instance_id,
      evidence_digest,
      authority_digest,
      actor_principal_id,
      created_at,
      reason
    ) VALUES (
      @receipt_id,
      @binding_id,
      @action,
      @registry_instance_id,
      @execution_surface_id,
      @repository_instance_id,
      @workspace_instance_id,
      @evidence_digest,
      @authority_digest,
      @actor_principal_id,
      @created_at,
      @reason
    )`
  ).run(event);
}

export function listLocalRegistryBindings(
  db: Database.Database,
  bindingId: string | null,
  state: "active" | "revoked" | null
): readonly BindingRow[] {
  return db
    .prepare(
      `SELECT *
       FROM local_registry_binding_rows
       WHERE (? IS NULL OR binding_id = ?)
         AND (? IS NULL OR state = ?)
       ORDER BY binding_id`
    )
    .all(bindingId, bindingId, state, state) as BindingRow[];
}

export function listLocalRegistryEvents(
  db: Database.Database,
  bindingId: string | null
): readonly BindingEventRow[] {
  return db
    .prepare(
      `SELECT
        receipt_id,
        binding_id,
        action,
        registry_instance_id,
        execution_surface_id,
        repository_instance_id,
        workspace_instance_id,
        evidence_digest,
        authority_digest,
        actor_principal_id,
        created_at,
        reason
      FROM binding_events
      WHERE (? IS NULL OR binding_id = ?)
      ORDER BY created_at, receipt_id`
    )
    .all(bindingId, bindingId) as BindingEventRow[];
}

export function listActiveLocalRegistryBindings(db: Database.Database): readonly BindingRow[] {
  return db
    .prepare(
      `SELECT *
       FROM local_registry_binding_rows
       WHERE state = 'active'
       ORDER BY binding_id`
    )
    .all() as BindingRow[];
}

export function insertLocalRegistryBinding(db: Database.Database, binding: BindingRow): void {
  db.prepare(
    `INSERT INTO repository_bindings (
      binding_id,
      registry_instance_id,
      execution_surface_id,
      workspace_instance_id,
      repository_instance_id,
      tenant_id,
      workspace_id,
      repository_id,
      canonical_root,
      manifest_digest,
      git_common_directory_digest,
      filesystem_evidence_digest,
      provider,
      provider_repository_id,
      provider_remote_digest,
      authority_source,
      authority_version,
      authority_digest,
      authority_verified_at,
      authority_expires_at,
      authority_revoked_at,
      state,
      created_at,
      last_verified_at,
      revoked_at,
      registered_by_principal_id
    ) VALUES (
      @binding_id,
      @registry_instance_id,
      @execution_surface_id,
      @workspace_instance_id,
      @repository_instance_id,
      @tenant_id,
      @workspace_id,
      @repository_id,
      @canonical_root,
      @manifest_digest,
      @git_common_directory_digest,
      @filesystem_evidence_digest,
      @provider,
      @provider_repository_id,
      @provider_remote_digest,
      @authority_source,
      @authority_version,
      @authority_digest,
      @authority_verified_at,
      @authority_expires_at,
      @authority_revoked_at,
      @state,
      @created_at,
      @last_verified_at,
      @revoked_at,
      @registered_by_principal_id
    )`
  ).run(binding);
}

export function updateLocalRegistryBinding(db: Database.Database, binding: BindingUpdateRow): void {
  db.prepare(
    `UPDATE repository_bindings SET
      canonical_root = @canonical_root,
      manifest_digest = @manifest_digest,
      git_common_directory_digest = @git_common_directory_digest,
      filesystem_evidence_digest = @filesystem_evidence_digest,
      provider = @provider,
      provider_repository_id = @provider_repository_id,
      provider_remote_digest = @provider_remote_digest,
      authority_source = @authority_source,
      authority_version = @authority_version,
      authority_digest = @authority_digest,
      authority_verified_at = @authority_verified_at,
      authority_expires_at = @authority_expires_at,
      authority_revoked_at = @authority_revoked_at,
      last_verified_at = @last_verified_at
    WHERE binding_id = @binding_id AND state = 'active'`
  ).run(binding);
}

export function revokeLocalRegistryBinding(
  db: Database.Database,
  bindingId: string,
  revokedAt: string
): void {
  db.prepare(
    `UPDATE repository_bindings
     SET state = 'revoked', revoked_at = ?
     WHERE binding_id = ? AND state = 'active'`
  ).run(revokedAt, bindingId);
}
