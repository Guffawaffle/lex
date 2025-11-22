/**
 * HTTP Server for Frame Ingestion API
 *
 * Provides REST API endpoints for Frame ingestion from external tools
 *
 * SECURITY NOTICE:
 * - HTTP mode requires mandatory API key authentication
 * - For local development, prefer MCP stdio mode (safer, no network exposure)
 * - Production deployments MUST use reverse proxy with TLS (nginx, Caddy)
 * - See SECURITY.md for deployment best practices
 */

import express, { Express, Request, Response, NextFunction } from "express";
import type Database from "better-sqlite3";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createHash } from "crypto";
import { createFramesRouter } from "./routes/frames.js";
import { getLogger } from "lex/logger";

const logger = getLogger("memory:mcp_server:http-server");
const auditLogger = getLogger("memory:mcp_server:audit");

export interface HttpServerOptions {
  port?: number;
  apiKey: string; // MANDATORY: API key for authentication (changed from optional)
  rateLimitWindowMs?: number; // Rate limit window in milliseconds (default: 15min)
  rateLimitMaxRequests?: number; // Max requests per window (default: 100)
}

/**
 * Create and configure the HTTP server with security hardening
 */
export function createHttpServer(db: Database.Database, options: HttpServerOptions): Express {
  const app = express();

  // Security headers (helmet middleware)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'none'"], // No scripts needed for API-only server
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          connectSrc: ["'self'"],
          fontSrc: ["'none'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // Rate limiting for API endpoints
  const apiRateLimiter = rateLimit({
    windowMs: options.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes default
    max: options.rateLimitMaxRequests || 100, // 100 requests per window default
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests from this IP, please try again later",
      code: 429,
    },
  });

  // Stricter rate limit for authentication failures
  const authFailureLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Only 5 failed auth attempts per window
    skipSuccessfulRequests: true, // Only count failed auth
    message: {
      error: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many failed authentication attempts, please try again later",
      code: 429,
    },
  });

  // Apply rate limiting to API routes
  app.use("/api/", apiRateLimiter);

  // Request size limits and body parsing with timeout protection
  app.use(express.json({ limit: "1mb", strict: true }));

  // Audit logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - start;
      const apiKeyHash = req.headers.authorization
        ? createHash("sha256").update(req.headers.authorization).digest("hex").slice(0, 8)
        : null;

      auditLogger.info({
        event: "http_request",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
        ip: req.ip,
        user_agent: req.get("user-agent"),
        api_key_hash: apiKeyHash, // Hash only, never log the actual key
      });
    });

    next();
  });

  // Health check endpoint (no auth required for monitoring)
  app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Mount frames router with auth failure rate limiting
  const framesRouter = createFramesRouter(db, options.apiKey, authFailureLimiter);
  app.use("/api/frames", framesRouter);

  return app;
}

/**
 * Start the HTTP server with mandatory authentication
 *
 * @throws Error if apiKey is not provided or is empty
 */
export async function startHttpServer(
  db: Database.Database,
  options: HttpServerOptions
): Promise<void> {
  // SECURITY: Enforce mandatory API key
  if (!options.apiKey || options.apiKey.trim() === "") {
    throw new Error(
      "HTTP server requires API key for security. " +
        "Set LEX_HTTP_API_KEY environment variable or pass apiKey in options. " +
        "For local development, use MCP stdio mode instead (safer, no network exposure). " +
        "See SECURITY.md for more information."
    );
  }

  const port = options.port || 3000;
  const app = createHttpServer(db, options);

  return new Promise((resolve) => {
    app.listen(port, () => {
      logger.info(`Frame ingestion API listening on port ${port}`);
      logger.warn(
        "HTTP server is running. Ensure you are behind a TLS-terminating reverse proxy for production use."
      );
      auditLogger.info({
        event: "http_server_started",
        port,
        timestamp: new Date().toISOString(),
      });
      resolve();
    });
  });
}
