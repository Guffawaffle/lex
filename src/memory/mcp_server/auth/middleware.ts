/**
 * Authentication Middleware
 *
 * Provides JWT and API key authentication for HTTP endpoints
 */

import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../auth/jwt.js";
import { getLogger } from "@smartergpt/lex/logger";

const logger = getLogger("memory:mcp_server:auth-middleware");
const auditLogger = getLogger("memory:mcp_server:audit");

// Extend Express Request to include user info
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      authMethod?: "jwt" | "api_key";
    }
  }
}

export interface AuthMiddlewareOptions {
  apiKey?: string; // Legacy API key support
  jwtPublicKey: string;
  requireAuth?: boolean; // Default: true
}

/**
 * Create authentication middleware that supports both JWT and API key
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (options.requireAuth !== false) {
        auditLogger.warn({
          event: "auth_missing",
          path: req.path,
          method: req.method,
        });

        res.status(401).json({
          error: "UNAUTHORIZED",
          message: "Missing Authorization header",
          code: 401,
        });
        return;
      }
      next();
      return;
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.replace("Bearer ", "");

    // Try JWT authentication first
    try {
      const decoded = verifyToken(token, options.jwtPublicKey);
      req.user = decoded;
      req.authMethod = "jwt";

      auditLogger.debug({
        event: "auth_success",
        method: "jwt",
        user_id: decoded.sub,
        path: req.path,
      });

      next();
      return;
    } catch (jwtError) {
      // JWT verification failed, try API key if configured
      if (options.apiKey && token === options.apiKey) {
        // API key authentication (legacy)
        req.authMethod = "api_key";

        // Log deprecation warning
        logger.warn(
          {
            event: "api_key_auth_deprecated",
            path: req.path,
          },
          "API key authentication is deprecated. Please migrate to OAuth2/JWT."
        );

        auditLogger.warn({
          event: "auth_success_deprecated",
          method: "api_key",
          path: req.path,
          message: "API key authentication is deprecated",
        });

        next();
        return;
      }

      // Both JWT and API key failed
      auditLogger.warn({
        event: "auth_failed",
        path: req.path,
        method: req.method,
        jwt_error: jwtError instanceof Error ? jwtError.message : "Unknown error",
      });

      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Invalid or expired token",
        code: 401,
      });
      return;
    }
  };
}

/**
 * Middleware to require JWT authentication (no API key fallback)
 */
export function requireJWT(jwtPublicKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Missing Authorization header",
        code: 401,
      });
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    try {
      const decoded = verifyToken(token, jwtPublicKey);
      req.user = decoded;
      req.authMethod = "jwt";
      next();
    } catch (error) {
      auditLogger.warn({
        event: "jwt_auth_failed",
        path: req.path,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Invalid or expired JWT token",
        code: 401,
      });
    }
  };
}

/**
 * Optional authentication middleware (allows unauthenticated requests)
 */
export function optionalAuth(options: AuthMiddlewareOptions) {
  return createAuthMiddleware({
    ...options,
    requireAuth: false,
  });
}
