/**
 * Atlas Ingestion API Routes
 *
 * POST /api/atlas/ingest - Batch ingest CodeAtlasRun with CodeUnits
 *
 * Part of Code Atlas Epic (CA-006) - Layer 2: API
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3-multiple-ciphers";
import { z } from "zod";
import { CodeAtlasRunSchema, type CodeAtlasRun } from "../../../atlas/schemas/code-atlas-run.js";
import { CodeUnitSchema, type CodeUnit } from "../../../atlas/schemas/code-unit.js";
import { saveCodeAtlasRun } from "../../store/code-atlas-runs.js";
import { insertCodeUnitBatch } from "../../store/code-unit-queries.js";
import { getLogger } from "@smartergpt/lex/logger";

const logger = getLogger("memory:mcp_server:routes:atlas");

/**
 * Request schema for batch ingestion
 */
export const AtlasIngestRequestSchema = z.object({
  run: CodeAtlasRunSchema,
  units: z.array(CodeUnitSchema),
});

export type AtlasIngestRequest = z.infer<typeof AtlasIngestRequestSchema>;

/**
 * Response type for successful ingestion
 */
export interface AtlasIngestResponse {
  runId: string;
  unitsIngested: number;
  unitsSkipped: number;
  durationMs: number;
}

/**
 * Error response type
 */
export interface AtlasApiErrorResponse {
  error: string;
  message: string;
  code: number;
  details?: unknown;
}

/**
 * Transactionally save a CodeAtlasRun and its CodeUnits
 */
function ingestAtlasData(
  db: Database.Database,
  run: CodeAtlasRun,
  units: CodeUnit[]
): { unitsIngested: number; unitsSkipped: number } {
  const startTime = Date.now();

  // Use a transaction to ensure atomicity
  const ingestTransaction = db.transaction((runData: CodeAtlasRun, unitData: CodeUnit[]) => {
    // Save the run first
    saveCodeAtlasRun(db, runData);

    // Filter out units that don't belong to this run's repo
    const validUnits = unitData.filter((unit) => unit.repoId === runData.repoId);
    const skippedCount = unitData.length - validUnits.length;

    // Save the units in batch
    const batchResult =
      validUnits.length > 0 ? insertCodeUnitBatch(db, validUnits) : { inserted: 0 };

    return { unitsIngested: batchResult.inserted, unitsSkipped: skippedCount };
  });

  const result = ingestTransaction(run, units);

  const duration = Date.now() - startTime;
  logger.info(
    {
      runId: run.runId,
      repoId: run.repoId,
      unitsIngested: result.unitsIngested,
      unitsSkipped: result.unitsSkipped,
      durationMs: duration,
    },
    "Atlas data ingested"
  );

  return result;
}

/**
 * Create atlas router
 * Note: Authentication is handled by middleware at the app level
 */
export function createAtlasRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * POST /api/atlas/ingest - Batch ingest CodeAtlasRun with CodeUnits
   *
   * Request body:
   * {
   *   "run": CodeAtlasRun,
   *   "units": CodeUnit[]
   * }
   *
   * Response:
   * {
   *   "runId": "...",
   *   "unitsIngested": 42,
   *   "unitsSkipped": 0,
   *   "durationMs": 150
   * }
   */
  router.post("/ingest", async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      // Validate request body using Zod
      const validationResult = AtlasIngestRequestSchema.safeParse(req.body);

      if (!validationResult.success) {
        const errorDetails = validationResult.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));

        logger.warn({ errors: errorDetails }, "Atlas ingest validation failed");

        return res.status(400).json({
          error: "VALIDATION_FAILED",
          message: "Request body validation failed",
          code: 400,
          details: errorDetails,
        } as AtlasApiErrorResponse);
      }

      const { run, units } = validationResult.data;

      // Perform transactional ingestion
      const { unitsIngested, unitsSkipped } = ingestAtlasData(db, run, units);

      const durationMs = Date.now() - startTime;

      return res.status(201).json({
        runId: run.runId,
        unitsIngested,
        unitsSkipped,
        durationMs,
      } as AtlasIngestResponse);
    } catch (error: unknown) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "An internal error occurred";

      logger.error({ error: errorMessage, durationMs }, "Atlas ingest failed");

      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: errorMessage,
        code: 500,
      } as AtlasApiErrorResponse);
    }
  });

  return router;
}
