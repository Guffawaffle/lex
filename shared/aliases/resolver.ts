/**
 * Module ID Alias Resolver
 * 
 * Provides alias resolution for module IDs with explicit alias table support.
 * This allows humans to use shorthand names during /remember while maintaining
 * vocabulary alignment with lexmap.policy.json.
 */

// @ts-ignore - importing from compiled dist directories
import type { Policy } from '../types/dist/policy.js';
import type { AliasTable, AliasResolution } from './types.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Cache for loaded alias table
let aliasTableCache: AliasTable | null = null;

/**
 * Load alias table from aliases.json with caching
 * 
 * @param aliasTablePath - Optional path to alias table JSON file
 * @returns Loaded and cached alias table
 */
export function loadAliasTable(aliasTablePath?: string): AliasTable {
  // Return cached table if available
  if (aliasTableCache) {
    return aliasTableCache;
  }

  try {
    // Default to aliases.json in the same directory as this module
    const defaultPath = aliasTablePath || join(
      dirname(fileURLToPath(import.meta.url)),
      'aliases.json'
    );

    const content = readFileSync(defaultPath, 'utf-8');
    aliasTableCache = JSON.parse(content) as AliasTable;
    
    return aliasTableCache;
  } catch (error: any) {
    // If alias table doesn't exist or can't be loaded, return empty table
    // This is expected for new installations
    if (process.env.LEX_DEBUG) {
      console.error(`[LEX] Could not load alias table: ${error.message}`);
      console.error(`[LEX] Using empty alias table`);
    }
    
    aliasTableCache = { aliases: {} };
    return aliasTableCache;
  }
}

/**
 * Clear the alias table cache (useful for testing)
 */
export function clearAliasTableCache(): void {
  aliasTableCache = null;
}

/**
 * Resolve a module ID through the alias system
 * 
 * Resolution order:
 * 1. Check if input exactly matches a module in the policy (fast path)
 * 2. Check if input is in the alias table
 * 3. Return original with confidence 0 (unknown)
 * 
 * @param input - The module ID string to resolve (may be an alias)
 * @param policy - The policy containing canonical module IDs
 * @param aliasTable - Optional pre-loaded alias table (will load default if not provided)
 * @returns AliasResolution with canonical ID, confidence, and source
 * 
 * @example
 * ```typescript
 * // Exact match (fast path)
 * const result1 = await resolveModuleId('services/auth-core', policy);
 * // { canonical: 'services/auth-core', confidence: 1.0, original: 'services/auth-core', source: 'exact' }
 * 
 * // Alias lookup
 * const result2 = await resolveModuleId('auth-core', policy);
 * // { canonical: 'services/auth-core', confidence: 1.0, original: 'auth-core', source: 'alias' }
 * 
 * // Unknown
 * const result3 = await resolveModuleId('unknown-module', policy);
 * // { canonical: 'unknown-module', confidence: 0, original: 'unknown-module', source: 'fuzzy' }
 * ```
 */
export async function resolveModuleId(
  input: string,
  policy: Policy,
  aliasTable?: AliasTable
): Promise<AliasResolution> {
  const policyModuleIds = new Set(Object.keys(policy.modules));

  // Fast path: exact match in policy (no alias lookup needed)
  if (policyModuleIds.has(input)) {
    return {
      canonical: input,
      confidence: 1.0,
      original: input,
      source: 'exact'
    };
  }

  // Load alias table if not provided
  const table = aliasTable || loadAliasTable();

  // Check if input is in alias table
  if (table.aliases[input]) {
    const aliasEntry = table.aliases[input];
    return {
      canonical: aliasEntry.canonical,
      confidence: aliasEntry.confidence,
      original: input,
      source: 'alias'
    };
  }

  // No match found - return original with confidence 0
  // Future phases will add fuzzy matching here
  return {
    canonical: input,
    confidence: 0,
    original: input,
    source: 'fuzzy'
  };
}
