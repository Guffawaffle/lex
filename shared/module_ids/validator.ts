/**
 * Module ID Validation - THE CRITICAL RULE Enforcement
 *
 * Ensures that module IDs used in Frames match the module IDs defined in lexmap.policy.json
 * This prevents vocabulary drift between memory and policy subsystems.
 * 
 * Now integrates with alias resolution to support shorthand and historical names.
 */

// @ts-ignore - importing from compiled dist directories
import type { Policy } from '../../types/dist/policy.js';
// @ts-ignore - importing from compiled dist directories
import type { ValidationResult, ModuleIdError } from '../../types/dist/validation.js';
// @ts-ignore - importing from compiled dist directories
import type { AliasTable } from '../../aliases/dist/types.js';
// @ts-ignore - importing from compiled dist directories
import { resolveModuleId } from '../../aliases/dist/resolver.js';

// Re-export for use by other packages
export { resolveModuleId };

/**
 * Maximum edit distance threshold for fuzzy matching suggestions
 * Only suggest module names if edit distance is within this threshold
 */
const MAX_EDIT_DISTANCE_THRESHOLD = 10;

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

  // Filter by threshold FIRST, then sort and take top N
  return suggestions
    .filter(s => s.distance <= MAX_EDIT_DISTANCE_THRESHOLD)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map(s => s.module);
}

/**
 * Validate that all module IDs in moduleScope exist in the policy
 * NOW WITH ALIAS RESOLUTION SUPPORT
 *
 * This function resolves aliases first, then validates canonical IDs against policy.
 * Returns canonical IDs for storage in Frame.module_scope.
 * 
 * @param moduleScope - Array of module IDs to validate (may include aliases)
 * @param policy - Policy object containing module definitions
 * @param aliasTable - Optional pre-loaded alias table
 * @returns ValidationResult with errors, suggestions, and canonical IDs for storage
 *
 * @example
 * ```typescript
 * const result = await validateModuleIds(
 *   ['auth-core', 'ui/user-panel'],  // 'auth-core' is an alias
 *   policy
 * );
 *
 * if (result.valid) {
 *   console.log(result.canonical);  // ['services/auth-core', 'ui/user-panel']
 *   // Store result.canonical in Frame.module_scope
 * } else {
 *   console.error(result.errors);
 * }
 * ```
 */
export async function validateModuleIds(
  moduleScope: string[],
  policy: Policy,
  aliasTable?: AliasTable
): Promise<ValidationResult> {
  // Empty module_scope is allowed
  if (!moduleScope || moduleScope.length === 0) {
    return { valid: true, canonical: [] };
  }

  // Step 1: Resolve all aliases
  const resolutions = await Promise.all(
    moduleScope.map(id => resolveModuleId(id, policy, aliasTable))
  );

  // Step 2: Validate all canonical IDs exist in policy
  const policyModuleIds = new Set(Object.keys(policy.modules));
  const errors: ModuleIdError[] = [];
  const canonicalIds: string[] = [];

  for (const resolution of resolutions) {
    // Check if canonical ID exists in policy
    if (!policyModuleIds.has(resolution.canonical)) {
      const suggestions = findSimilarModules(resolution.canonical, policyModuleIds);
      const suggestionText = suggestions.length > 0
        ? ` Did you mean '${suggestions[0]}'?`
        : '';

      errors.push({
        module: resolution.original,
        message: `Module '${resolution.original}' resolved to '${resolution.canonical}' which is not found in policy.${suggestionText}`,
        suggestions
      });
    } else {
      // Valid - add canonical ID to result
      canonicalIds.push(resolution.canonical);
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors
    };
  }

  return { valid: true, canonical: canonicalIds };
}

/**
 * DEPRECATED: Use async validateModuleIds instead
 * 
 * Synchronous validation without alias resolution (legacy support)
 * 
 * @deprecated This function does not support alias resolution. Use async validateModuleIds.
 */
export function validateModuleIdsSync(
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
