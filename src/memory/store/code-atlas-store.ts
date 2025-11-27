/**
 * CodeAtlasStore — persistence contract for Code Atlas data
 *
 * @experimental
 * This interface is EXPERIMENTAL for 1.0.0. It may change in 1.0.x or 1.1
 * without semver breakage guarantees.
 */

import type { CodeUnit } from "../../atlas/schemas/code-unit.js";
import type { CodeAtlasRun } from "../../atlas/schemas/code-atlas-run.js";

/**
 * @experimental
 * CodeAtlasStore — persistence contract for Code Atlas data.
 *
 * This interface is EXPERIMENTAL for 1.0.0. It may change in 1.0.x or 1.1
 * without semver breakage guarantees.
 */
export interface CodeAtlasStore {
  // CodeUnit CRUD
  insertCodeUnit(unit: CodeUnit): Promise<void>;
  insertCodeUnitBatch(units: CodeUnit[]): Promise<{ inserted: number }>;
  getCodeUnitById(id: string): Promise<CodeUnit | null>;
  listCodeUnitsByRepo(
    repoId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ items: CodeUnit[]; total: number }>;
  deleteCodeUnitsByRepo(repoId: string): Promise<{ deleted: number }>;

  // CodeAtlasRun CRUD
  saveCodeAtlasRun(run: CodeAtlasRun): Promise<void>;
  getCodeAtlasRunById(id: string): Promise<CodeAtlasRun | null>;
  listCodeAtlasRuns(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ items: CodeAtlasRun[]; total: number }>;

  close(): Promise<void>;
}
