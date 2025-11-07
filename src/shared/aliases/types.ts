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
  source: 'exact' | 'alias' | 'fuzzy' | 'substring';
}

/**
 * Options for module ID resolution
 */
export interface ResolverOptions {
  /** Disable substring matching (default: false) */
  noSubstring?: boolean;
  
  /** Minimum substring length for matching (default: 3) */
  minSubstringLength?: number;
  
  /** Maximum number of ambiguous matches to show in error (default: 5) */
  maxAmbiguousMatches?: number;
}

/**
 * Error thrown when a substring matches multiple modules
 */
export class AmbiguousSubstringError extends Error {
  public readonly substring: string;
  public readonly matches: string[];

  constructor(substring: string, matches: string[], maxShow: number = 5) {
    const showMatches = matches.slice(0, maxShow);
    const moreCount = matches.length - maxShow;
    const matchList = showMatches.map(m => `  - ${m}`).join('\n');
    const moreText = moreCount > 0 ? `  ... and ${moreCount} more` : '';
    
    super(
      `Ambiguous substring '${substring}' matches:\n${matchList}${moreText ? '\n' + moreText : ''}\nPlease use full module ID or add to alias table.`
    );
    this.name = 'AmbiguousSubstringError';
    this.substring = substring;
    this.matches = matches;
  }
}

/**
 * Error thrown when no match is found for a module ID
 */
export class NoMatchFoundError extends Error {
  public readonly moduleId: string;
  public readonly suggestions: string[];

  constructor(moduleId: string, suggestions: string[] = []) {
    const suggestionText = suggestions.length > 0 
      ? ` Did you mean '${suggestions[0]}'?`
      : '';
    super(`Module '${moduleId}' not found in policy.${suggestionText}`);
    this.name = 'NoMatchFoundError';
    this.moduleId = moduleId;
    this.suggestions = suggestions;
  }
}
