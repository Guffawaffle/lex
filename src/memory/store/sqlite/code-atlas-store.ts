/**
 * SqliteCodeAtlasStore — SQLite implementation of CodeAtlasStore
 *
 * @experimental
 * This implementation is EXPERIMENTAL for 1.0.0. It may change in 1.0.x or 1.1
 * without semver breakage guarantees.
 */

import type Database from "better-sqlite3-multiple-ciphers";
import type { CodeAtlasStore } from "../code-atlas-store.js";
import type { CodeUnit } from "../../../atlas/schemas/code-unit.js";
import type { CodeAtlasRun } from "../../../atlas/schemas/code-atlas-run.js";
import {
  saveCodeUnit,
  insertCodeUnitBatch,
  getCodeUnitById,
  listCodeUnitsByRepo,
  deleteCodeUnitsByRepo,
} from "../code-unit-queries.js";
import {
  saveCodeAtlasRun,
  getCodeAtlasRunById,
  getAllCodeAtlasRuns,
  getCodeAtlasRunCount,
} from "../code-atlas-runs.js";

/**
 * @experimental
 * SQLite implementation of CodeAtlasStore for persistence of CodeUnit and CodeAtlasRun entities.
 */
export class SqliteCodeAtlasStore implements CodeAtlasStore {
  constructor(private db: Database.Database) {}

  // CodeUnit CRUD operations

  async insertCodeUnit(unit: CodeUnit): Promise<void> {
    saveCodeUnit(this.db, unit);
  }

  async insertCodeUnitBatch(units: CodeUnit[]): Promise<{ inserted: number }> {
    return insertCodeUnitBatch(this.db, units);
  }

  async getCodeUnitById(id: string): Promise<CodeUnit | null> {
    return getCodeUnitById(this.db, id);
  }

  async listCodeUnitsByRepo(
    repoId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ items: CodeUnit[]; total: number }> {
    return listCodeUnitsByRepo(this.db, repoId, options);
  }

  async deleteCodeUnitsByRepo(repoId: string): Promise<{ deleted: number }> {
    return deleteCodeUnitsByRepo(this.db, repoId);
  }

  // CodeAtlasRun CRUD operations

  async saveCodeAtlasRun(run: CodeAtlasRun): Promise<void> {
    saveCodeAtlasRun(this.db, run);
  }

  async getCodeAtlasRunById(id: string): Promise<CodeAtlasRun | null> {
    return getCodeAtlasRunById(this.db, id);
  }

  async listCodeAtlasRuns(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ items: CodeAtlasRun[]; total: number }> {
    const total = getCodeAtlasRunCount(this.db);
    const allRuns = getAllCodeAtlasRuns(this.db, options?.limit);

    // Apply offset if provided
    const offset = options?.offset ?? 0;
    const items = offset > 0 ? allRuns.slice(offset) : allRuns;

    // Apply limit if provided and offset was applied
    const limit = options?.limit;
    const finalItems = limit && offset > 0 ? items.slice(0, limit) : items;

    return { items: finalItems, total };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
