/**
 * Type definitions for module ID resolution
 * 
 * Supports multiple resolution strategies with confidence scoring
 */

/**
 * Source of the module ID resolution
 */
export type ResolutionSource = 
  | 'exact'      // Exact match (confidence 1.0)
  | 'alias'      // Alias table match (confidence 1.0) - Phase 1
  | 'fuzzy'      // Fuzzy typo correction (confidence 0.8-0.9) - Phase 2
  | 'substring'; // Unique substring match (confidence 0.9) - Phase 3

/**
 * Result of module ID resolution
 */
export interface ResolutionResult {
  /** The canonical module ID from policy */
  canonical: string;
  
  /** Confidence score (0-1) indicating match quality */
  confidence: number;
  
  /** The original input that was resolved */
  original: string;
  
  /** How the match was found */
  source: ResolutionSource;
  
  /** Optional warning message to emit to user */
  warning?: string;
}

/**
 * Options for controlling resolver behavior
 */
export interface ResolverOptions {
  /** Disable substring matching (default: false) */
  noSubstring?: boolean;
  
  /** Disable alias table lookup (default: false) - Phase 1 */
  noAlias?: boolean;
  
  /** Disable fuzzy typo correction (default: false) - Phase 2 */
  noFuzzy?: boolean;
  
  /** Minimum substring length to consider (default: 3) */
  minSubstringLength?: number;
  
  /** Maximum number of matches before rejecting as too ambiguous (default: 5) */
  maxAmbiguousMatches?: number;
}

/**
 * Error thrown when substring matches multiple modules
 */
export class AmbiguousSubstringError extends Error {
  public readonly substring: string;
  public readonly matches: string[];
  
  constructor(substring: string, matches: string[]) {
    super(
      `Ambiguous substring '${substring}' matches:\n` +
      matches.map(m => `   - ${m}`).join('\n') + '\n' +
      '   Please use full module ID or add to alias table.'
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
  
  constructor(moduleId: string) {
    super(`No match found for module ID: '${moduleId}'`);
    this.name = 'NoMatchFoundError';
    this.moduleId = moduleId;
  }
}
