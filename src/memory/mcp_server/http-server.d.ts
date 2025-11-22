/**
 * Type declarations for HTTP server
 */

import { Express } from "express";
import type Database from "better-sqlite3";

export interface HttpServerOptions {
  port?: number;
  apiKey: string; // MANDATORY: API key for authentication
  rateLimitWindowMs?: number; // Rate limit window in milliseconds (default: 15min)
  rateLimitMaxRequests?: number; // Max requests per window (default: 100)
}

export declare function createHttpServer(
  db: Database.Database,
  options: HttpServerOptions
): Express;

export declare function startHttpServer(
  db: Database.Database,
  options: HttpServerOptions
): Promise<void>;
