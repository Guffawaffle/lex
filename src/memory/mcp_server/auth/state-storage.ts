/**
 * Database-backed OAuth State Storage
 *
 * Alternative to in-memory state store for production multi-instance deployments.
 * Provides persistent, shared state storage across server instances.
 */

import type Database from "better-sqlite3";

/**
 * Initialize OAuth state storage table
 */
export function initializeOAuthStateTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      redirect_url TEXT,
      expires_at INTEGER NOT NULL
    );
  `);

  // Create index for cleanup queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
    ON oauth_states(expires_at);
  `);
}

/**
 * Store OAuth state in database
 */
export function saveOAuthState(
  db: Database.Database,
  state: string,
  redirectUrl?: string,
  expirationMs: number = 10 * 60 * 1000 // 10 minutes default
): void {
  const now = Date.now();
  const expiresAt = now + expirationMs;

  db.prepare(`
    INSERT INTO oauth_states (state, created_at, redirect_url, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(state, now, redirectUrl || null, expiresAt);
}

/**
 * Validate and consume OAuth state (single-use)
 */
export function validateOAuthState(
  db: Database.Database,
  state: string
): { valid: boolean; redirectUrl?: string } {
  const now = Date.now();

  // Find and delete state in a transaction
  const result = db.transaction(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = db.prepare(`
      SELECT redirect_url FROM oauth_states
      WHERE state = ? AND expires_at > ?
    `).get(state, now) as any;

    if (!row) {
      return { valid: false };
    }

    // Delete state (single-use)
    db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);

    return {
      valid: true,
      redirectUrl: row.redirect_url || undefined,
    };
  })();

  return result;
}

/**
 * Clean up expired OAuth states
 * Call this periodically (e.g., every hour) to prevent table bloat
 */
export function cleanupExpiredOAuthStates(db: Database.Database): number {
  const now = Date.now();
  const result = db.prepare(`
    DELETE FROM oauth_states WHERE expires_at <= ?
  `).run(now);

  return result.changes;
}

/**
 * Example usage in OAuth routes:
 *
 * // On /auth/github:
 * const state = generateState();
 * saveOAuthState(db, state, req.query.redirect as string);
 * res.redirect(authUrl);
 *
 * // On /auth/callback:
 * const { valid, redirectUrl } = validateOAuthState(db, req.query.state as string);
 * if (!valid) {
 *   return res.status(400).json({ error: "INVALID_STATE" });
 * }
 * // ... proceed with OAuth flow
 *
 * // Cleanup job (run periodically):
 * setInterval(() => {
 *   const deleted = cleanupExpiredOAuthStates(db);
 *   logger.debug(`Cleaned up ${deleted} expired OAuth states`);
 * }, 60 * 60 * 1000); // Every hour
 */
