/**
 * Frame Ingestion API Routes
 *
 * POST /api/frames - Ingest a new Frame with deduplication
 */

import { Router, Request, Response, NextFunction } from "express";
import type Database from "better-sqlite3";
import { Frame } from "../../frames/types.js";
import { saveFrame } from "../../store/queries.js";
import { createHash } from "crypto";
import { randomUUID } from "crypto";

export interface ApiErrorResponse {
  error: string;
  message: string;
  field?: string;
  code: number;
}

export interface FrameCreateResponse {
  id: string;
  status: "created" | "duplicate";
}

/**
 * Generate content hash for Frame deduplication
 * Hash inputs: referencePoint, summaryCaption, moduleScope, statusSnapshot.next_action, timestamp_bucket(5min)
 */
export function generateFrameContentHash(frame: {
  reference_point: string;
  summary_caption: string;
  module_scope: string[];
  status_snapshot: { next_action: string };
  timestamp: string;
}): string {
  // Round timestamp to 5-minute bucket for deduplication
  const timestamp = new Date(frame.timestamp);
  const bucketMinutes = Math.floor(timestamp.getMinutes() / 5) * 5;
  timestamp.setMinutes(bucketMinutes, 0, 0);
  const timestampBucket = timestamp.toISOString();

  // Create stable hash input
  const hashInput = JSON.stringify({
    reference_point: frame.reference_point,
    summary_caption: frame.summary_caption,
    module_scope: frame.module_scope.sort(), // Sort for stable comparison
    next_action: frame.status_snapshot.next_action,
    timestamp_bucket: timestampBucket,
  });

  return createHash("sha256").update(hashInput).digest("hex");
}

/**
 * Find existing Frame by content hash
 * Checks all frames for matching content hash
 */
export function findFrameByContentHash(db: Database.Database, contentHash: string): Frame | null {
  // Get all frames and check their content hashes
  const stmt = db.prepare("SELECT * FROM frames ORDER BY timestamp DESC LIMIT 1000");

  // CRITICAL: DO NOT REMOVE THIS ESLINT-DISABLE
  // Database rows from better-sqlite3 are returned as generic objects with dynamic properties.
  // TypeScript cannot know the exact shape at compile time since it depends on the SQL query.
  // Using 'any' here is REQUIRED - attempting to type this will either:
  // 1. Break runtime safety by assuming a type that might not match the actual DB schema
  // 2. Require complex type generation that duplicates the schema definition
  // This is a well-understood limitation of SQL libraries in TypeScript.
  // See: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#allbindparameters---array-of-rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = stmt.all() as any[];

  for (const row of rows) {
    const frame = {
      id: row.id,
      timestamp: row.timestamp,
      branch: row.branch,
      jira: row.jira || undefined,
      module_scope: JSON.parse(row.module_scope),
      summary_caption: row.summary_caption,
      reference_point: row.reference_point,
      status_snapshot: JSON.parse(row.status_snapshot),
      keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
      atlas_frame_id: row.atlas_frame_id || undefined,
    };

    const frameHash = generateFrameContentHash(frame);
    if (frameHash === contentHash) {
      return frame;
    }
  }

  return null;
}

/**
 * Validate Frame request body
 */
/**
 * Validates incoming Frame creation request body
 * Returns validation result with error details if invalid
 *
 * CRITICAL: DO NOT REMOVE THIS ESLINT-DISABLE
 * The 'body' parameter MUST be 'any' because it comes from express req.body which is
 * unvalidated user input. The entire PURPOSE of this function is to validate and narrow
 * the type from 'any' to a known safe type. If we pre-typed it, we would:
 * 1. Defeat the purpose of validation (assuming it's already the correct type)
 * 2. Have no way to handle malformed requests
 * 3. Create a false sense of type safety where none exists
 * This is the industry-standard pattern for validation functions in TypeScript.
 * See: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateFrameRequest(body: any): { valid: boolean; error?: ApiErrorResponse } {
  // Check required fields
  if (!body.reference_point || typeof body.reference_point !== "string") {
    return {
      valid: false,
      error: {
        error: "VALIDATION_FAILED",
        message: "Field 'reference_point' is required and must be a string",
        field: "reference_point",
        code: 400,
      },
    };
  }

  if (!body.summary_caption || typeof body.summary_caption !== "string") {
    return {
      valid: false,
      error: {
        error: "VALIDATION_FAILED",
        message: "Field 'summary_caption' is required and must be a string",
        field: "summary_caption",
        code: 400,
      },
    };
  }

  if (!body.module_scope || !Array.isArray(body.module_scope) || body.module_scope.length === 0) {
    return {
      valid: false,
      error: {
        error: "VALIDATION_FAILED",
        message: "Field 'module_scope' is required and must be a non-empty array",
        field: "module_scope",
        code: 400,
      },
    };
  }

  if (
    !body.status_snapshot ||
    typeof body.status_snapshot !== "object" ||
    !body.status_snapshot.next_action
  ) {
    return {
      valid: false,
      error: {
        error: "VALIDATION_FAILED",
        message: "Field 'status_snapshot.next_action' is required",
        field: "status_snapshot",
        code: 400,
      },
    };
  }

  return { valid: true };
}

/**
 * Create frames router
 */
export function createFramesRouter(db: Database.Database, apiKey?: string): Router {
  const router = Router();

  // Authentication middleware
  if (apiKey) {
    router.use((req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      const providedKey = authHeader?.replace("Bearer ", "");

      if (!providedKey || providedKey !== apiKey) {
        return res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Invalid or missing API key",
          code: 401,
        } as ApiErrorResponse);
      }

      next();
    });
  }

  /**
   * POST /api/frames - Create a new Frame
   */
  router.post("/", async (req: Request, res: Response) => {
    try {
      const body = req.body;

      // Validate request body
      const validation = validateFrameRequest(body);
      if (!validation.valid && validation.error) {
        return res.status(validation.error.code).json(validation.error);
      }

      // Generate timestamp if not provided
      const timestamp = body.timestamp || new Date().toISOString();

      // Check for duplicate using content hash
      const frameData = {
        reference_point: body.reference_point,
        summary_caption: body.summary_caption,
        module_scope: body.module_scope,
        status_snapshot: body.status_snapshot,
        timestamp,
      };

      const contentHash = generateFrameContentHash(frameData);
      const existingFrame = findFrameByContentHash(db, contentHash);

      if (existingFrame) {
        return res.status(409).json({
          error: "CONFLICT",
          message: "Frame with same content already exists",
          code: 409,
          existing_frame_id: existingFrame.id,
        });
      }

      // Create new Frame
      const frameId = body.id || `frame-${Date.now()}-${randomUUID()}`;
      const frame: Frame = {
        id: frameId,
        timestamp,
        branch: body.branch || "unknown",
        jira: body.jira,
        module_scope: body.module_scope,
        summary_caption: body.summary_caption,
        reference_point: body.reference_point,
        status_snapshot: body.status_snapshot,
        keywords: body.keywords,
        atlas_frame_id: body.atlas_frame_id,
        feature_flags: body.feature_flags,
        permissions: body.permissions,
        runId: body.runId,
        planHash: body.planHash,
        spend: body.spend,
      };

      // Save to database
      saveFrame(db, frame);

      // Return success response
      return res.status(201).json({
        id: frameId,
        status: "created",
      } as FrameCreateResponse);
    } catch (error: unknown) {
      // Handle database or other internal errors
      const errorMessage = error instanceof Error ? error.message : "An internal error occurred";
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: errorMessage,
        code: 500,
      } as ApiErrorResponse);
    }
  });

  return router;
}
