/**
 * Module ID Validation - THE CRITICAL RULE Enforcement
 * 
 * Ensures that module IDs used in Frames match the module IDs defined in lexmap.policy.json
 * This prevents vocabulary drift between memory and policy subsystems.
 */

import type { Policy } from '../types/policy.js';
import type { ValidationResult, ModuleIdError } from '../types/validation.js';

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching to suggest similar module names
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Calculate distances
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Find similar module IDs based on edit distance
 * Returns up to 3 suggestions, sorted by similarity
 */
function findSimilarModules(
  moduleId: string,
  availableModules: Set<string>,
  maxSuggestions: number = 3
): string[] {
  const suggestions: Array<{ module: string; distance: number }> = [];

  for (const available of availableModules) {
    const distance = levenshteinDistance(moduleId.toLowerCase(), available.toLowerCase());
    suggestions.push({ module: available, distance });
  }

  // Sort by distance (most similar first) and take top N
  return suggestions
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .filter(s => s.distance <= Math.max(moduleId.length, 5)) // Only suggest if reasonably close
    .map(s => s.module);
}

/**
 * Validate that all module IDs in moduleScope exist in the policy
 * 
 * @param moduleScope - Array of module IDs to validate
 * @param policy - Policy object containing module definitions
 * @returns ValidationResult with errors and suggestions for invalid modules
 * 
 * @example
 * ```typescript
 * const result = validateModuleIds(
 *   ['auth-core', 'ui/user-panel'],
 *   policy
 * );
 * 
 * if (!result.valid) {
 *   console.error(result.errors);
 *   // [{
 *   //   module: 'auth-core',
 *   //   message: "Module 'auth-core' not found in policy. Did you mean 'services/auth-core'?",
 *   //   suggestions: ['services/auth-core']
 *   // }]
 * }
 * ```
 */
export function validateModuleIds(
  moduleScope: string[],
  policy: Policy
): ValidationResult {
  // Empty module_scope is allowed
  if (!moduleScope || moduleScope.length === 0) {
    return { valid: true };
  }

  const policyModuleIds = new Set(Object.keys(policy.modules));
  const errors: ModuleIdError[] = [];

  for (const moduleId of moduleScope) {
    // Case-sensitive exact match required
    if (!policyModuleIds.has(moduleId)) {
      const suggestions = findSimilarModules(moduleId, policyModuleIds);
      const suggestionText = suggestions.length > 0
        ? ` Did you mean '${suggestions[0]}'?`
        : '';
      
      errors.push({
        module: moduleId,
        message: `Module '${moduleId}' not found in policy.${suggestionText}`,
        suggestions
      });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  return { valid: true };
}
