/**
 * Module ID Resolution - Multi-Phase Resolution Strategy
 * 
 * Resolves module IDs using a priority-based fallback system:
 * 1. Exact match (confidence 1.0)
 * 2. Alias table (confidence 1.0) - Phase 1 (future)
 * 3. Fuzzy typo correction (confidence 0.8-0.9) - Phase 2 (future)
 * 4. Unique substring match (confidence 0.9) - Phase 3 (current)
 * 5. Reject with helpful error
 */

import type { Policy } from '../types/policy.js';
import {
  ResolutionResult,
  ResolverOptions,
  AmbiguousSubstringError,
  NoMatchFoundError
} from './types.js';

/**
 * Default resolver options
 */
const DEFAULT_OPTIONS: Required<ResolverOptions> = {
  noSubstring: false,
  noAlias: false,
  noFuzzy: false,
  minSubstringLength: 3,
  maxAmbiguousMatches: 5
};

/**
 * Find all module IDs that contain the input as a substring
 * 
 * @param input - The substring to search for
 * @param modules - Array of available module IDs
 * @returns Array of matching module IDs
 */
function findSubstringMatches(input: string, modules: string[]): string[] {
  return modules.filter(m => m.includes(input));
}

/**
 * Resolve a module ID using multiple strategies
 * 
 * @param input - The module ID to resolve (may be partial/shorthand)
 * @param policy - Policy object containing module definitions
 * @param options - Options to control resolver behavior
 * @returns Resolution result with canonical ID and confidence
 * @throws {AmbiguousSubstringError} When substring matches multiple modules
 * @throws {NoMatchFoundError} When no match is found
 * 
 * @example
 * ```typescript
 * // Exact match
 * const result = resolveModuleId('services/auth-core', policy);
 * // { canonical: 'services/auth-core', confidence: 1.0, original: 'services/auth-core', source: 'exact' }
 * 
 * // Unique substring match
 * const result = resolveModuleId('auth-core', policy);
 * // { canonical: 'services/auth-core', confidence: 0.9, original: 'auth-core', source: 'substring',
 * //   warning: "ℹ️  Expanded substring 'auth-core' → 'services/auth-core' (unique match)" }
 * // Caller should emit the warning if present
 * 
 * // Ambiguous substring
 * const result = resolveModuleId('auth', policy);
 * // Throws: AmbiguousSubstringError with list of matches
 * ```
 */
export function resolveModuleId(
  input: string,
  policy: Policy,
  options: ResolverOptions = {}
): ResolutionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const availableModules = Object.keys(policy.modules);
  
  // Phase 1: Check for exact match (highest priority)
  if (availableModules.includes(input)) {
    return {
      canonical: input,
      confidence: 1.0,
      original: input,
      source: 'exact'
    };
  }
  
  // Phase 2: Check alias table (confidence 1.0) - Phase 1
  // TODO: Implement when Phase 1 is added
  // if (!opts.noAlias) {
  //   const aliasMatch = checkAliasTable(input, policy);
  //   if (aliasMatch) {
  //     return aliasMatch;
  //   }
  // }
  
  // Phase 3: Check fuzzy typo correction (confidence 0.8-0.9) - Phase 2
  // TODO: Implement when Phase 2 is added
  // if (!opts.noFuzzy) {
  //   const fuzzyMatch = checkFuzzyMatch(input, availableModules);
  //   if (fuzzyMatch) {
  //     return fuzzyMatch;
  //   }
  // }
  
  // Phase 4: Check unique substring match (confidence 0.9) - Phase 3
  if (!opts.noSubstring) {
    // Check minimum length requirement
    if (input.length < opts.minSubstringLength) {
      // Skip substring matching for very short inputs
      throw new NoMatchFoundError(input);
    }
    
    const matches = findSubstringMatches(input, availableModules);
    
    if (matches.length === 1) {
      // Unique match found - return with warning
      const canonical = matches[0];
      
      return {
        canonical,
        confidence: 0.9,
        original: input,
        source: 'substring',
        warning: `ℹ️  Expanded substring '${input}' → '${canonical}' (unique match)`
      };
    } else if (matches.length > 1) {
      // Multiple matches - check if too ambiguous
      if (matches.length > opts.maxAmbiguousMatches) {
        throw new AmbiguousSubstringError(
          input,
          matches.slice(0, opts.maxAmbiguousMatches).concat([
            `... and ${matches.length - opts.maxAmbiguousMatches} more`
          ])
        );
      }
      
      // Ambiguous - throw error with all matches
      throw new AmbiguousSubstringError(input, matches);
    }
  }
  
  // Phase 5: No match found
  throw new NoMatchFoundError(input);
}
