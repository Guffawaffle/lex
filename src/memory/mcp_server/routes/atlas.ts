/**
 * Atlas API Routes
 *
 * HTTP API endpoints for ingesting and querying code units and atlas runs.
 * Part of Code Atlas Epic (CA-006, CA-007) - Layer 2: API
 *
 * Endpoints:
 *   POST /api/atlas/ingest     - Batch ingest CodeAtlasRun with CodeUnits
 *   GET /api/atlas/units       - Query code units with filtering
 *   GET /api/atlas/units/:id   - Get a specific code unit
 *   GET /api/atlas/runs        - Query atlas runs
 *   GET /api/atlas/runs/:runId - Get a specific atlas run
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3-multiple-ciphers";
import { z } from "zod";
import {
  getCodeUnitById,
  queryCodeUnits,
  insertCodeUnitBatch,
  type CodeUnitQueryOptions,
} from "../../store/code-unit-queries.js";
import {
  getCodeAtlasRunById,
  getCodeAtlasRunsByRepo,
  getAllCodeAtlasRuns,
  getCodeAtlasRunCount,
  saveCodeAtlasRun,
} from "../../store/code-atlas-runs.js";
import {
  CodeUnitKindSchema,
  CodeUnitSchema,
  type CodeUnit,
} from "../../../atlas/schemas/code-unit.js";
import { CodeAtlasRunSchema, type CodeAtlasRun } from "../../../atlas/schemas/code-atlas-run.js";
import { getLogger } from "@smartergpt/lex/logger";

const logger = getLogger("memory:mcp_server:routes:atlas");

/**
 * API error response structure
 */
export interface AtlasApiErrorResponse {
  error: string;
  message: string;
  code: number;
  field?: string;
  details?: unknown;
}

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
 * Paginated response structure for units
 */
export interface UnitsListResponse {
  items: unknown[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Paginated response structure for runs
 */
export interface RunsListResponse {
  items: unknown[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Query parameters schema for units endpoint
 */
const UnitsQuerySchema = z.object({
  repo: z.string().optional(),
  kind: CodeUnitKindSchema.optional(),
  file: z.string().optional(),
  symbol: z.string().optional(),
  tags: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",").map((t) => t.trim()) : undefined)),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 100;
      const num = parseInt(val, 10);
      return isNaN(num) || num < 1 ? 100 : Math.min(num, 1000);
    }),
  offset: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 0;
      const num = parseInt(val, 10);
      return isNaN(num) || num < 0 ? 0 : num;
    }),
});

/**
 * Query parameters schema for runs endpoint
 */
const RunsQuerySchema = z.object({
  repo: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 100;
      const num = parseInt(val, 10);
      return isNaN(num) || num < 1 ? 100 : Math.min(num, 1000);
    }),
  offset: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 0;
      const num = parseInt(val, 10);
      return isNaN(num) || num < 0 ? 0 : num;
    }),
});

/**
 * Create atlas router
 * Note: Authentication is handled by middleware at the app level
 */
export function createAtlasRouter(db: Database.Database): Router {
  const router = Router();

  /**
   * POST /api/atlas/ingest - Batch ingest CodeAtlasRun with CodeUnits
   *
   * Request Body:
   *   - run: CodeAtlasRun  - The atlas run metadata
   *   - units: CodeUnit[]  - Array of code units to ingest
   *
   * Response:
   *   - runId: string       - ID of the ingested run
   *   - unitsIngested: number - Count of successfully ingested units
   *   - unitsSkipped: number  - Count of skipped units (wrong repo)
   *   - durationMs: number    - Time taken for ingestion
   */
  router.post("/ingest", (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      // Validate request body
      const parseResult = AtlasIngestRequestSchema.safeParse(req.body);

      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        const errorResponse: AtlasApiErrorResponse = {
          error: "validation_error",
          message: firstIssue.message,
          code: 400,
          field: firstIssue.path.join("."),
          details: parseResult.error.issues,
        };
        res.status(400).json(errorResponse);
        return;
      }

      const { run, units } = parseResult.data;

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
      const durationMs = Date.now() - startTime;

      logger.info(
        {
          runId: run.runId,
          repoId: run.repoId,
          unitsIngested: result.unitsIngested,
          unitsSkipped: result.unitsSkipped,
          durationMs,
        },
        "Atlas data ingested"
      );

      const response: AtlasIngestResponse = {
        runId: run.runId,
        unitsIngested: result.unitsIngested,
        unitsSkipped: result.unitsSkipped,
        durationMs,
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, "Atlas ingest failed");

      const errorResponse: AtlasApiErrorResponse = {
        error: "internal_error",
        message: "Failed to ingest atlas data",
        code: 500,
        details: errorMessage,
      };
      res.status(500).json(errorResponse);
    }
  });

  /**
   * GET /api/atlas/units - Query code units with filtering
   *
   * Query Parameters:
   *   - repo: string    - Filter by repository ID
   *   - kind: string    - Filter by unit kind (module, class, function, method)
   *   - file: string    - Filter by file path (prefix match)
   *   - symbol: string  - Search by symbol path
   *   - tags: string    - Comma-separated list of tags (AND logic)
   *   - limit: number   - Max results (default 100, max 1000)
   *   - offset: number  - Pagination offset
   */
  router.get("/units", (req: Request, res: Response) => {
    try {
      // Parse and validate query parameters
      const parseResult = UnitsQuerySchema.safeParse(req.query);

      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        return res.status(400).json({
          error: "VALIDATION_FAILED",
          message: `Invalid query parameter: ${firstIssue.path.join(".")} - ${firstIssue.message}`,
          field: firstIssue.path.join("."),
          code: 400,
        } as AtlasApiErrorResponse);
      }

      const { repo, kind, file, symbol, tags, limit, offset } = parseResult.data;

      // Build query options
      const queryOptions: CodeUnitQueryOptions = {
        repoId: repo,
        kind,
        filePath: file,
        symbol,
        tags,
        limit,
        offset,
      };

      // Execute query
      const result = queryCodeUnits(db, queryOptions);

      return res.json({
        items: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      } as UnitsListResponse);
    } catch (error: unknown) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "An internal error occurred",
        code: 500,
      } as AtlasApiErrorResponse);
    }
  });

  /**
   * GET /api/atlas/units/:id - Get a specific code unit by ID
   */
  router.get("/units/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          error: "VALIDATION_FAILED",
          message: "Missing required parameter: id",
          field: "id",
          code: 400,
        } as AtlasApiErrorResponse);
      }

      const unit = getCodeUnitById(db, id);

      if (!unit) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: `Code unit with id '${id}' not found`,
          code: 404,
        } as AtlasApiErrorResponse);
      }

      return res.json(unit);
    } catch (error: unknown) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "An internal error occurred",
        code: 500,
      } as AtlasApiErrorResponse);
    }
  });

  /**
   * GET /api/atlas/runs - Query atlas runs with filtering
   *
   * Query Parameters:
   *   - repo: string   - Filter by repository ID
   *   - limit: number  - Max results (default 100, max 1000)
   *   - offset: number - Pagination offset (not yet implemented in store)
   */
  router.get("/runs", (req: Request, res: Response) => {
    try {
      // Parse and validate query parameters
      const parseResult = RunsQuerySchema.safeParse(req.query);

      if (!parseResult.success) {
        const firstIssue = parseResult.error.issues[0];
        return res.status(400).json({
          error: "VALIDATION_FAILED",
          message: `Invalid query parameter: ${firstIssue.path.join(".")} - ${firstIssue.message}`,
          field: firstIssue.path.join("."),
          code: 400,
        } as AtlasApiErrorResponse);
      }

      const { repo, limit, offset } = parseResult.data;

      let runs;
      let total;

      // TODO: Improve performance by adding LIMIT/OFFSET support to store layer
      // Currently we fetch all runs and slice in memory, which is inefficient
      // for large datasets. See: https://github.com/Guffawaffle/lex/issues/302
      if (repo) {
        // Filter by repository
        const allRepoRuns = getCodeAtlasRunsByRepo(db, repo);
        total = allRepoRuns.length;
        // Apply pagination manually since store doesn't support it for repo filter
        runs = allRepoRuns.slice(offset, offset + limit);
      } else {
        // Get all runs with limit
        total = getCodeAtlasRunCount(db);
        // Note: getAllCodeAtlasRuns doesn't support offset, so we fetch all and slice
        const allRuns = getAllCodeAtlasRuns(db);
        runs = allRuns.slice(offset, offset + limit);
      }

      return res.json({
        items: runs,
        total,
        limit,
        offset,
      } as RunsListResponse);
    } catch (error: unknown) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "An internal error occurred",
        code: 500,
      } as AtlasApiErrorResponse);
    }
  });

  /**
   * GET /api/atlas/runs/:runId - Get a specific atlas run by ID
   */
  router.get("/runs/:runId", (req: Request, res: Response) => {
    try {
      const { runId } = req.params;

      if (!runId) {
        return res.status(400).json({
          error: "VALIDATION_FAILED",
          message: "Missing required parameter: runId",
          field: "runId",
          code: 400,
        } as AtlasApiErrorResponse);
      }

      const run = getCodeAtlasRunById(db, runId);

      if (!run) {
        return res.status(404).json({
          error: "NOT_FOUND",
          message: `Atlas run with id '${runId}' not found`,
          code: 404,
        } as AtlasApiErrorResponse);
      }

      return res.json(run);
    } catch (error: unknown) {
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "An internal error occurred",
        code: 500,
      } as AtlasApiErrorResponse);
    }
  });

  return router;
}
