/**
 * SQLite store implementations
 *
 * @experimental
 * These implementations are EXPERIMENTAL for 1.0.0. They may change in 1.0.x or 1.1
 * without semver breakage guarantees.
 */

export { SqliteFrameStore } from "./frame-store.js";
export type { SqliteFrameStoreAccessMode, SqliteFrameStoreOptions } from "./frame-store.js";
export { SqliteCodeAtlasStore } from "./code-atlas-store.js";
export { SqliteScopedFrameStoreBackend } from "./scoped-frame-store.js";
export type { SqliteScopedFrameStoreOptions } from "./scoped-frame-store.js";
export {
  SCOPED_SQLITE_SCHEMA_VERSION,
  LEGACY_SQLITE_SCHEMA_VERSION,
  SCOPED_SQLITE_ERROR_CODES,
  ScopedSqliteError,
  inspectScopedSqliteSchema,
  requireHealthyScopedSqliteSchema,
} from "./scoped-schema.js";
export type {
  ScopedSqliteErrorCode,
  ScopedSqliteSchemaState,
  ScopedSqliteSchemaInspection,
  SqliteStoreScopeBindingV1,
} from "./scoped-schema.js";
export {
  SQLITE_SCOPE_MIGRATION_MANIFEST_VERSION,
  SQLITE_SCOPE_MIGRATION_RECEIPT_VERSION,
  inventorySqliteScope,
  createSqliteScopeMigrationManifest,
  validateSqliteScopeMigrationManifest,
  migrateSqliteStoreToScopedV15,
  recoverSqliteScopeMigration,
} from "./scoped-migration.js";
export type {
  SqliteScopeTargetV1,
  SqliteScopeInventoryV1,
  SqliteScopeMigrationManifestV1,
  SqliteScopeMigrationReceiptV1,
  SqliteScopeMigrationResult,
  SqliteScopeRecoveryReceiptV1,
} from "./scoped-migration.js";
