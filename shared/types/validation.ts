/**
 * TypeScript types for validation results and errors
 * 
 * Used by module ID validation to report errors and suggestions
 */

export interface ModuleIdError {
  module: string;
  message: string;
  suggestions: string[];
}

export class ModuleNotFoundError extends Error {
  public readonly module: string;
  public readonly suggestions: string[];

  constructor(module: string, suggestions: string[] = []) {
    const suggestionText = suggestions.length > 0 
      ? ` Did you mean '${suggestions[0]}'?`
      : '';
    super(`Module '${module}' not found in policy.${suggestionText}`);
    this.name = 'ModuleNotFoundError';
    this.module = module;
    this.suggestions = suggestions;
  }
}

export interface ValidationResult {
  valid: boolean;
  errors?: ModuleIdError[];
  /** Canonical module IDs to store (after alias resolution). Only present when valid=true. */
  canonical?: string[];
}

/**
 * Result of module ID resolution (validation + auto-correction)
 */
export interface ResolutionResult {
  /** The resolved (potentially auto-corrected) module ID */
  resolved: string;
  /** The original input module ID */
  original: string;
  /** Confidence score (0-1) where 1.0 is exact match */
  confidence: number;
  /** Whether auto-correction was applied */
  corrected: boolean;
  /** Edit distance from original to resolved (0 for exact match) */
  editDistance: number;
  /** Source of the resolution */
  source?: 'exact' | 'alias' | 'fuzzy' | 'substring';
}
