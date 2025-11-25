/**
 * Type declarations for Frame routes
 */

import { Router } from "express";
import type Database from "better-sqlite3-multiple-ciphers";

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

export declare function generateFrameContentHash(frame: {
  reference_point: string;
  summary_caption: string;
  module_scope: string[];
  status_snapshot: { next_action: string };
  timestamp: string;
}): string;

export declare function findFrameByContentHash(
  db: Database.Database,
  contentHash: string
): import("../../frames/types.js").Frame | null;

export declare function createFramesRouter(db: Database.Database, apiKey?: string): Router;
