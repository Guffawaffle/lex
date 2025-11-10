/**
 * HTTP Server for Frame Ingestion API
 *
 * Provides REST API endpoints for Frame ingestion from external tools
 */

import express, { Express, Request, Response } from "express";
import type Database from "better-sqlite3";
import { createFramesRouter } from "./routes/frames.js";
import { getLogger } from "lex/logger";

const logger = getLogger("memory:mcp_server:http-server");

export interface HttpServerOptions {
  port?: number;
  apiKey?: string;
}

/**
 * Create and configure the HTTP server
 */
export function createHttpServer(db: Database.Database, options: HttpServerOptions = {}): Express {
  const app = express();

  // Parse JSON request bodies
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Mount frames router
  const framesRouter = createFramesRouter(db, options.apiKey);
  app.use("/api/frames", framesRouter);

  return app;
}

/**
 * Start the HTTP server
 */
export async function startHttpServer(
  db: Database.Database,
  options: HttpServerOptions = {}
): Promise<void> {
  const port = options.port || 3000;
  const app = createHttpServer(db, options);

  return new Promise((resolve) => {
    app.listen(port, () => {
      logger.info(`Frame ingestion API listening on port ${port}`);
      resolve();
    });
  });
}
