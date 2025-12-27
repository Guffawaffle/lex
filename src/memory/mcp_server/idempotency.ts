/**
 * Idempotency Cache for MCP Mutation Tools
 *
 * Prevents duplicate frames from being created when AI agents retry tool calls
 * due to network flakiness or tooling issues. Based on request_id.
 *
 * Design:
 * - In-memory cache with configurable TTL (default: 24 hours)
 * - Stores complete MCPResponse for each request_id
 * - Automatic cleanup of expired entries on get/set operations
 * - Thread-safe for single-process MCP servers
 *
 * Inspired by LexSona's MCP idempotency pattern.
 */

import { getLogger } from "@smartergpt/lex/logger";

const logger = getLogger("memory:mcp_server:idempotency");

/**
 * MCP Response structure (for idempotency caching)
 * Must match the MCPResponse interface from server.ts
 */
export interface MCPResponse {
  protocolVersion?: string;
  capabilities?: unknown;
  serverInfo?: {
    name: string;
    version: string;
  };
  tools?: unknown[];
  content?: unknown[];
  error?: {
    message: string;
    code: string;
    context?: Record<string, unknown>;
    nextActions?: string[];
  };
  data?: Record<string, unknown>;
}

/**
 * Cached entry with response and timestamp
 */
interface CachedEntry {
  response: MCPResponse;
  timestamp: number; // Unix timestamp in milliseconds
}

/**
 * Idempotency cache for MCP mutation tools
 */
export class IdempotencyCache {
  private cache: Map<string, CachedEntry> = new Map();
  private readonly ttlMs: number;

  /**
   * Create a new idempotency cache
   * @param ttlMs Time-to-live in milliseconds (default: 24 hours)
   */
  constructor(ttlMs: number = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached response for a request_id
   * @param requestId The request ID to look up
   * @returns Cached response if found and not expired, undefined otherwise
   */
  getCached(requestId: string): MCPResponse | undefined {
    this.clearExpired();

    const entry = this.cache.get(requestId);
    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(requestId);
      logger.debug(`[idempotency] Expired entry removed: ${requestId}`);
      return undefined;
    }

    logger.info(`[idempotency] Cache hit for request_id: ${requestId}`);
    return entry.response;
  }

  /**
   * Store a response in the cache
   * @param requestId The request ID to cache
   * @param response The MCP response to cache
   */
  setCached(requestId: string, response: MCPResponse): void {
    this.clearExpired();

    const entry: CachedEntry = {
      response,
      timestamp: Date.now(),
    };

    this.cache.set(requestId, entry);
    logger.debug(`[idempotency] Cached response for request_id: ${requestId}`);
  }

  /**
   * Remove all expired entries from the cache
   * Called automatically on get/set operations
   */
  private clearExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      for (const key of expiredKeys) {
        this.cache.delete(key);
      }
      logger.debug(`[idempotency] Cleared ${expiredKeys.length} expired entries`);
    }
  }

  /**
   * Get current cache size (for debugging/testing)
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cached entries (for testing)
   */
  clear(): void {
    this.cache.clear();
    logger.debug("[idempotency] Cache cleared");
  }
}
