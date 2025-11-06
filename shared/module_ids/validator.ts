/**
 * Module ID Validation - THE CRITICAL RULE Enforcement
 *
 * Ensures that module IDs used in Frames match the module IDs defined in lexmap.policy.json
 * This prevents vocabulary drift between memory and policy subsystems.
 *
 * Now integrates with alias resolution to support shorthand and historical names.
 */

// @ts-ignore - importing from compiled dist directories
import type { Policy } from "../types/dist/policy.js";
// @ts-ignore - importing from compiled dist directories
import type {
  ValidationResult,
  ModuleIdError,
  ResolutionResult,
} from "../types/dist/validation.js";
// @ts-ignore - importing from compiled dist directories
import type { AliasTable, ResolverOptions } from "../aliases/dist/types.js";
// @ts-ignore - importing from compiled dist directories
import {
  loadAliasTable,
  findSubstringMatches,
  AmbiguousSubstringError,
} from "../aliases/dist/resolver.js";

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
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
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
    const distance = levenshteinDistance(
      moduleId.toLowerCase(),
      available.toLowerCase()
    );
    suggestions.push({ module: available, distance });
  }

  // Filter by threshold FIRST, then sort and take top N
  return suggestions
    .filter((s) => s.distance <= MAX_EDIT_DISTANCE_THRESHOLD)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map((s) => s.module);
}

/**
 * Resolve a module ID with Phase 2 fuzzy matching and Phase 3 substring matching
 *
 * Resolution order:
 * 1. Exact match (confidence 1.0)
 * 2. Alias table (confidence 1.0) [Phase 1]
 * 3. Fuzzy typo correction (confidence 0.8-0.9) [Phase 2]
 * 4. Unique substring match (confidence 0.9) [Phase 3]
 * 5. Reject with error
 *
 * @param moduleId - The module ID to resolve (may be an alias, typo, or substring)
 * @param policy - The policy containing canonical module IDs
 * @param strict - If true, only accept exact matches (confidence 1.0)
 * @param aliasTable - Optional pre-loaded alias table (for testing)
 * @param options - Optional resolver options (for substring matching)
 * @returns ResolutionResult with resolved ID and metadata
 * @throws Error if module not found or ambiguous
 */
export function resolveModuleId(
  moduleId: string,
  policy: Policy,
  strict: boolean = false,
  aliasTable?: AliasTable,
  options?: ResolverOptions
): ResolutionResult {
  const policyModuleIds = new Set(Object.keys(policy.modules));

  // Default options
  const opts: Required<ResolverOptions> = {
    noSubstring: options?.noSubstring ?? false,
    minSubstringLength: options?.minSubstringLength ?? 3,
    maxAmbiguousMatches: options?.maxAmbiguousMatches ?? 5,
  };

  // Phase 1: Exact match (case-sensitive)
  if (policyModuleIds.has(moduleId)) {
    return {
      resolved: moduleId,
      original: moduleId,
      confidence: 1.0,
      corrected: false,
      editDistance: 0,
      source: "exact",
    };
  }

  // Load alias table if not provided
  const table = aliasTable || loadAliasTable();

  // Phase 2: Alias table lookup
  if (table.aliases[moduleId]) {
    const aliasEntry = table.aliases[moduleId];
    return {
      resolved: aliasEntry.canonical,
      original: moduleId,
      confidence: aliasEntry.confidence,
      corrected: true,
      editDistance: 0,
      source: "alias",
    };
  }

  // If strict mode, reject now (no fuzzy or substring matching)
  if (strict) {
    const suggestions = findSimilarModules(moduleId, policyModuleIds);
    const suggestionText =
      suggestions.length > 0 ? ` Did you mean '${suggestions[0]}'?` : "";
    throw new Error(
      `Module '${moduleId}' not found in policy.${suggestionText}`
    );
  }

  // Phase 3: Fuzzy matching (edit distance ≤ 2)
  const candidates: Array<{ module: string; distance: number }> = [];

  for (const available of policyModuleIds) {
    const distance = levenshteinDistance(
      moduleId.toLowerCase(),
      available.toLowerCase()
    );
    if (distance <= 2 && distance > 0) {
      candidates.push({ module: available, distance });
    }
  }

  // Sort by distance
  candidates.sort((a, b) => a.distance - b.distance);

  // Check if we have exactly one candidate (unambiguous)
  if (candidates.length === 1) {
    const candidate = candidates[0];
    const confidence = candidate.distance === 1 ? 0.9 : 0.8;

    return {
      resolved: candidate.module,
      original: moduleId,
      confidence,
      corrected: true,
      editDistance: candidate.distance,
      source: "fuzzy",
    };
  }

  // Ambiguous fuzzy matches
  if (candidates.length > 1) {
    const matches = candidates.map((c) => c.module).join(", ");
    throw new Error(
      `Module '${moduleId}' is ambiguous. Multiple close matches found: ${matches}`
    );
  }

  // Phase 4: Substring matching (if enabled)
  if (!opts.noSubstring) {
    const substringMatches = findSubstringMatches(
      moduleId,
      policyModuleIds,
      opts.minSubstringLength
    );

    if (substringMatches.length === 1) {
      // Unique substring match - confidence 0.9
      return {
        resolved: substringMatches[0],
        original: moduleId,
        confidence: 0.9,
        corrected: true,
        editDistance: 0,
        source: "substring",
      };
    } else if (substringMatches.length > 1) {
      // Ambiguous substring
      throw new AmbiguousSubstringError(
        moduleId,
        substringMatches,
        opts.maxAmbiguousMatches
      );
    }
  }

  // No fuzzy or substring match found
  const suggestions = findSimilarModules(moduleId, policyModuleIds);
  const suggestionText =
    suggestions.length > 0 ? ` Did you mean '${suggestions[0]}'?` : "";
  throw new Error(`Module '${moduleId}' not found in policy.${suggestionText}`);
}

/**
 * Validate that all module IDs in moduleScope exist in the policy
 * NOW WITH ALIAS RESOLUTION AND AUTO-CORRECTION SUPPORT
 *
 * This function uses resolveModuleId which handles:
 * - Exact match checking
 * - Alias table lookup
 * - Fuzzy matching for typo correction
 *
 * Returns canonical IDs for storage in Frame.module_scope.
 *
 * @param moduleScope - Array of module IDs to validate (may include aliases or typos)
 * @param policy - Policy object containing module definitions
 * @param aliasTable - Optional pre-loaded alias table (passed to resolveModuleId)
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

  const policyModuleIds = new Set(Object.keys(policy.modules));
  const canonicalIds: string[] = [];
  const errors: ModuleIdError[] = [];

  for (const moduleId of moduleScope) {
    try {
      const resolution = resolveModuleId(moduleId, policy, false, aliasTable);

      // Validate that the resolved canonical ID exists in policy
      if (!policyModuleIds.has(resolution.resolved)) {
        const suggestions = findSimilarModules(
          resolution.resolved,
          policyModuleIds
        );
        const suggestionText =
          suggestions.length > 0 ? ` Did you mean '${suggestions[0]}'?` : "";

        errors.push({
          module: moduleId,
          message: `Module '${moduleId}' resolved to '${resolution.resolved}' which is not found in policy.${suggestionText}`,
          suggestions,
        });
      } else {
        canonicalIds.push(resolution.resolved);
      }
    } catch (error: any) {
      // resolveModuleId throws on errors, collect them
      const suggestions = findSimilarModules(moduleId, policyModuleIds);
      errors.push({
        module: moduleId,
        message: error.message,
        suggestions,
      });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
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
      const suggestionText =
        suggestions.length > 0 ? ` Did you mean '${suggestions[0]}'?` : "";

      errors.push({
        module: moduleId,
        message: `Module '${moduleId}' not found in policy.${suggestionText}`,
        suggestions,
      });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return { valid: true };
}
