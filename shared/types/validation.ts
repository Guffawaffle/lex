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
}
