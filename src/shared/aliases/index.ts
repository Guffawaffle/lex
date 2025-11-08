/**
 * Module ID Alias Resolution
 *
 * Exports alias resolution functionality for fuzzy matching and historical name resolution.
 */

export type { AliasEntry, AliasTable, AliasResolution, ResolverOptions } from "./types.js";
export {
  resolveModuleId,
  loadAliasTable,
  clearAliasTableCache,
  findSubstringMatches,
  AmbiguousSubstringError,
  NoMatchFoundError,
} from "./resolver.js";
