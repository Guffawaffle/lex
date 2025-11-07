/**
 * Atlas Frame Caching
 * 
 * Caches computed Atlas Frames by (module_scope, radius) key to avoid
 * redundant graph traversals. Tracks cache hits/misses for performance monitoring.
 */

import type { AtlasFrame } from './types.js';

/**
 * Cache key for an Atlas Frame computation
 */
interface CacheKey {
  moduleScope: string[]; // Sorted module IDs
  radius: number;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

/**
 * In-memory cache for Atlas Frames
 * 
 * Uses LRU eviction when cache size exceeds maxSize.
 * Cache keys are based on sorted module_scope + radius for consistency.
 */
export class AtlasFrameCache {
  private cache: Map<string, { frame: AtlasFrame; timestamp: number }> = new Map();
  private accessOrder: string[] = []; // LRU tracking
  private maxSize: number;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  };

  /**
   * Create a new Atlas Frame cache
   * 
   * @param maxSize - Maximum number of entries to cache (default: 100)
   */
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Generate cache key from module scope and radius
   * 
   * Normalizes module_scope by sorting to ensure consistent keys
   * regardless of input order.
   */
  private getCacheKey(moduleScope: string[], radius: number): string {
    const sortedModules = Array.from(moduleScope).sort();
    return `${sortedModules.join(',')}:${radius}`;
  }

  /**
   * Get cached Atlas Frame if available
   * 
   * @param moduleScope - Module IDs to look up
   * @param radius - Fold radius
   * @returns Cached AtlasFrame or undefined if not found
   */
  get(moduleScope: string[], radius: number): AtlasFrame | undefined {
    const key = this.getCacheKey(moduleScope, radius);
    const entry = this.cache.get(key);

    if (entry) {
      // Cache hit - update access order
      this.stats.hits++;
      this.updateAccessOrder(key);
      return entry.frame;
    }

    // Cache miss
    this.stats.misses++;
    return undefined;
  }

  /**
   * Store Atlas Frame in cache
   * 
   * @param moduleScope - Module IDs
   * @param radius - Fold radius
   * @param frame - Computed Atlas Frame
   */
  set(moduleScope: string[], radius: number, frame: AtlasFrame): void {
    const key = this.getCacheKey(moduleScope, radius);

    // Check if we need to evict entries
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Store frame with timestamp
    this.cache.set(key, {
      frame,
      timestamp: Date.now(),
    });

    // Update access order
    this.updateAccessOrder(key);
    this.stats.size = this.cache.size;
  }

  /**
   * Update LRU access order
   */
  private updateAccessOrder(key: string): void {
    // Remove key from current position
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }

    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return;
    }

    const lruKey = this.accessOrder.shift()!;
    this.cache.delete(lruKey);
    this.stats.evictions++;
    this.stats.size = this.cache.size;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.size = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Reset statistics (but keep cached entries)
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: this.cache.size,
    };
  }
}

/**
 * Global cache instance
 * 
 * Shared across all Atlas Frame generation calls.
 * Can be disabled by setting enableCache = false.
 */
let globalCache: AtlasFrameCache | null = new AtlasFrameCache();
let enableCache = true;

/**
 * Get the global cache instance
 */
export function getCache(): AtlasFrameCache | null {
  return enableCache ? globalCache : null;
}

/**
 * Enable or disable caching globally
 */
export function setEnableCache(enabled: boolean): void {
  enableCache = enabled;
  if (!enabled && globalCache) {
    globalCache.clear();
  }
}

/**
 * Reset the global cache
 */
export function resetCache(): void {
  if (globalCache) {
    globalCache.clear();
    globalCache.resetStats();
  }
}

/**
 * Get global cache statistics
 */
export function getCacheStats(): CacheStats {
  return globalCache ? globalCache.getStats() : {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  };
}
