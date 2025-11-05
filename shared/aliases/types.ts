/**
 * Type definitions for Module ID Alias Resolution
 * 
 * Provides interfaces for alias table structure and resolution results.
 */

/**
 * Single alias entry mapping an alias to its canonical module ID
 */
export interface AliasEntry {
  /** The canonical module ID in lexmap.policy.json */
  canonical: string;
  
  /** Confidence score (1.0 for explicit aliases) */
  confidence: number;
  
  /** Human-readable reason for the alias (e.g., "shorthand", "refactored 2025-10-15") */
  reason?: string;
}

/**
 * Alias table structure loaded from aliases.json
 */
export interface AliasTable {
  /** Map of alias string to canonical module ID */
  aliases: Record<string, AliasEntry>;
}

/**
 * Result of resolving a module ID through the alias system
 */
export interface AliasResolution {
  /** The canonical module ID to use (may be same as original if no alias found) */
  canonical: string;
  
  /** Confidence score (1.0 for exact match or explicit alias, 0.0 for unknown) */
  confidence: number;
  
  /** The original input string */
  original: string;
  
  /** Source of the resolution */
  source: 'exact' | 'alias' | 'fuzzy';
}
