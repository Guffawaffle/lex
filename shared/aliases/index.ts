/**
 * Module ID Alias Resolution
 * 
 * Exports alias resolution functionality for fuzzy matching and historical name resolution.
 */

export type { AliasEntry, AliasTable, AliasResolution } from './types.js';
export { resolveModuleId, loadAliasTable, clearAliasTableCache } from './resolver.js';
