/**
 * OAuth2 Authentication Routes
 *
 * Handles OAuth2 code flow, token exchange, and user authentication
 */

import { Router, Request, Response } from "express";
import type Database from "better-sqlite3";
import { createHash, randomUUID } from "crypto";
import {
  getGitHubAuthorizationUrl,
  exchangeGitHubCode,
  getGitHubUser,
  GitHubOAuthConfig,
} from "../auth/github-provider.js";
import { generateState } from "../auth/jwt.js";
import { createTokenPair, verifyToken } from "../auth/jwt.js";
import { getLogger } from "@smartergpt/lex/logger";

const logger = getLogger("memory:mcp_server:oauth");
const auditLogger = getLogger("memory:mcp_server:audit");

export interface OAuthConfig {
  github?: GitHubOAuthConfig;
  jwtPrivateKey: string;
  jwtPublicKey: string;
}

interface StateStore {
  [state: string]: {
    createdAt: number;
    redirectUrl?: string;
  };
}

// In-memory state store for CSRF protection
// TODO: Move to database or Redis for production multi-instance deployments
const stateStore: StateStore = {};

// Clean up expired states (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  const expirationTime = 10 * 60 * 1000; // 10 minutes

  Object.keys(stateStore).forEach((state) => {
    if (now - stateStore[state].createdAt > expirationTime) {
      delete stateStore[state];
    }
  });
}, 60 * 1000); // Run every minute

/**
 * Create OAuth2 router
 */
export function createOAuthRouter(db: Database.Database, config: OAuthConfig): Router {
  const router = Router();

  /**
   * GET /auth/github - Initiate GitHub OAuth2 flow
   */
  router.get("/github", (req: Request, res: Response) => {
    if (!config.github) {
      return res.status(501).json({
        error: "NOT_IMPLEMENTED",
        message: "GitHub OAuth is not configured",
        code: 501,
      });
    }

    const state = generateState();
    stateStore[state] = {
      createdAt: Date.now(),
      redirectUrl: (req.query.redirect as string) || "/",
    };

    const authUrl = getGitHubAuthorizationUrl(config.github, state);

    auditLogger.info({
      event: "oauth_authorization_started",
      provider: "github",
      state_hash: createHash("sha256").update(state).digest("hex").slice(0, 8),
    });

    res.redirect(authUrl);
  });

  /**
   * GET /auth/callback - Handle OAuth2 callback
   */
  router.get("/callback", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      // Validate state parameter (CSRF protection)
      if (!state || typeof state !== "string" || !stateStore[state]) {
        auditLogger.warn({
          event: "oauth_callback_invalid_state",
          state_provided: !!state,
        });

        return res.status(400).json({
          error: "INVALID_STATE",
          message: "Invalid or expired state parameter",
          code: 400,
        });
      }

      const stateData = stateStore[state];
      delete stateStore[state]; // Use state only once

      // Validate authorization code
      if (!code || typeof code !== "string") {
        return res.status(400).json({
          error: "INVALID_CODE",
          message: "Missing or invalid authorization code",
          code: 400,
        });
      }

      // Determine provider (currently only GitHub)
      if (!config.github) {
        return res.status(501).json({
          error: "NOT_IMPLEMENTED",
          message: "OAuth provider is not configured",
          code: 501,
        });
      }

      // Exchange code for access token
      const tokenResponse = await exchangeGitHubCode(config.github, code);

      // Fetch user profile
      const githubUser = await getGitHubUser(tokenResponse.access_token);

      // Create or update user in database
      const userId = `github-${githubUser.id}`;
      const userStmt = db.prepare(`
        INSERT INTO users (user_id, email, name, provider, provider_user_id, last_login)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          email = excluded.email,
          name = excluded.name,
          last_login = datetime('now')
      `);

      userStmt.run(userId, githubUser.email, githubUser.name, "github", githubUser.id.toString());

      // Generate JWT tokens
      const tokenPair = createTokenPair(
        {
          sub: userId,
          email: githubUser.email,
          name: githubUser.name,
          provider: "github",
        },
        config.jwtPrivateKey
      );

      // Store refresh token in database
      const tokenId = randomUUID();
      const tokenHash = createHash("sha256").update(tokenPair.refreshToken).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

      const tokenStmt = db.prepare(`
        INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at)
        VALUES (?, ?, ?, ?)
      `);

      tokenStmt.run(tokenId, userId, tokenHash, expiresAt);

      auditLogger.info({
        event: "oauth_login_success",
        provider: "github",
        user_id: userId,
        email: githubUser.email,
      });

      // Return tokens in response
      // In a real application, you might set these as HTTP-only cookies
      res.json({
        access_token: tokenPair.accessToken,
        refresh_token: tokenPair.refreshToken,
        expires_in: tokenPair.expiresIn,
        token_type: "Bearer",
        user: {
          id: userId,
          email: githubUser.email,
          name: githubUser.name,
        },
      });
    } catch (error) {
      logger.error({ error, event: "oauth_callback_error" }, "OAuth callback failed");

      auditLogger.error({
        event: "oauth_callback_error",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return res.status(500).json({
        error: "OAUTH_ERROR",
        message: "Failed to complete OAuth flow",
        code: 500,
      });
    }
  });

  /**
   * POST /auth/refresh - Refresh access token
   */
  router.post("/refresh", async (req: Request, res: Response) => {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          error: "MISSING_TOKEN",
          message: "Refresh token is required",
          code: 400,
        });
      }

      // Verify refresh token
      const decoded = verifyToken(refresh_token, config.jwtPublicKey);

      if (!decoded.sub) {
        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "Invalid refresh token",
          code: 401,
        });
      }

      // Check if token exists in database and is not revoked
      const tokenHash = createHash("sha256").update(refresh_token).digest("hex");
      const tokenStmt = db.prepare(`
        SELECT * FROM refresh_tokens
        WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime('now')
      `);

      // CRITICAL: DO NOT REMOVE THIS ESLINT-DISABLE
      // Database rows from better-sqlite3 are returned as generic objects with dynamic properties.
      // TypeScript cannot know the exact shape at compile time since it depends on the SQL query.
      // Using 'any' here is REQUIRED - attempting to type this will either:
      // 1. Break runtime safety by assuming a type that might not match the actual DB schema
      // 2. Require complex type generation that duplicates the schema definition
      // This is a well-understood limitation of SQL libraries in TypeScript.
      // See: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#getbindparameters---row
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tokenRow = tokenStmt.get(tokenHash) as any;

      if (!tokenRow) {
        auditLogger.warn({
          event: "refresh_token_invalid",
          user_id: decoded.sub,
        });

        return res.status(401).json({
          error: "INVALID_TOKEN",
          message: "Refresh token is invalid or revoked",
          code: 401,
        });
      }

      // Get user info
      const userStmt = db.prepare(`SELECT * FROM users WHERE user_id = ?`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userRow = userStmt.get(decoded.sub) as any;

      if (!userRow) {
        return res.status(404).json({
          error: "USER_NOT_FOUND",
          message: "User not found",
          code: 404,
        });
      }

      // Generate new access token
      const tokenPair = createTokenPair(
        {
          sub: userRow.user_id,
          email: userRow.email,
          name: userRow.name,
          provider: userRow.provider,
        },
        config.jwtPrivateKey
      );

      auditLogger.info({
        event: "token_refreshed",
        user_id: userRow.user_id,
      });

      res.json({
        access_token: tokenPair.accessToken,
        expires_in: tokenPair.expiresIn,
        token_type: "Bearer",
      });
    } catch (error) {
      logger.error({ error, event: "token_refresh_error" }, "Token refresh failed");

      return res.status(401).json({
        error: "INVALID_TOKEN",
        message: "Failed to refresh token",
        code: 401,
      });
    }
  });

  /**
   * POST /auth/revoke - Revoke refresh token (logout)
   */
  router.post("/revoke", async (req: Request, res: Response) => {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return res.status(400).json({
          error: "MISSING_TOKEN",
          message: "Refresh token is required",
          code: 400,
        });
      }

      // Revoke token in database
      const tokenHash = createHash("sha256").update(refresh_token).digest("hex");
      const stmt = db.prepare(`
        UPDATE refresh_tokens
        SET revoked_at = datetime('now')
        WHERE token_hash = ? AND revoked_at IS NULL
      `);

      const result = stmt.run(tokenHash);

      if (result.changes === 0) {
        return res.status(404).json({
          error: "TOKEN_NOT_FOUND",
          message: "Refresh token not found or already revoked",
          code: 404,
        });
      }

      auditLogger.info({
        event: "token_revoked",
        token_hash: tokenHash.slice(0, 8),
      });

      res.json({
        message: "Token revoked successfully",
      });
    } catch (error) {
      logger.error({ error, event: "token_revoke_error" }, "Token revocation failed");

      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Failed to revoke token",
        code: 500,
      });
    }
  });

  return router;
}
