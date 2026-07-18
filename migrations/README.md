# Lex Database Migrations

This directory contains SQL migration files for schema evolution.

## Rules

1. **Schema changes only** — Migrations handle structure, not data.
   - ✅ `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX`, `DROP INDEX`
   - ❌ `INSERT`, `UPDATE`, `DELETE` (except for seed data in tests)

2. **Numbered files** — Use `NNN_description.sql` format:
   - `001_initial_schema.sql`
   - `002_add_user_id_column.sql`
   - `003_create_code_units_table.sql`

3. **Forward-only** — No down migrations. Plan carefully.

4. **Data migrations require approval** — If you must migrate data:
   - Create a separate issue with explicit review
   - Document the transformation logic
   - Include rollback strategy
   - Get human sign-off before merge

## Current Schema Versions

The schema version is tracked in `src/memory/store/db.ts` via the `schema_version` table.

- **14** is the final legacy, unowned SQLite schema.
- **15** is the Lex 3.0 scope-owned SQLite schema.

Version 15 is intentionally not part of automatic `initializeDatabase()`
migration. It assigns tenant/workspace ownership to existing data and therefore
requires the explicit `lex db scope inventory|manifest|migrate` flow, a reviewed
source-to-scope manifest, `--write`, a mandatory backup, and post-migration
verification. Ordinary startup cannot infer or adopt ownership.

## Migration Execution

Legacy migrations through v14 are applied automatically by
`initializeDatabase()` in `db.ts`. Scope migration to v15 is implemented in
`src/memory/store/sqlite/scoped-migration.ts` and is explicit, deterministic,
recoverable, and idempotent for an already-applied manifest.

## Adding a New Migration

1. Create `migrations/NNN_description.sql` with your schema change
2. Update `initializeDatabase()` in `src/memory/store/db.ts`:
   ```typescript
   if (currentVersion < N) {
     // Apply migration NNN
     db.exec(/* your SQL */);
     db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(N);
   }
   ```
3. Update the "Current Schema Version" above
4. Add tests for the new schema

## Reference: Initial Schema

See `000_reference_schema.sql` for the complete current schema.
This file is for documentation only — actual migrations are in `db.ts`.
