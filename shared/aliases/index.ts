/**
 * Module ID Resolution - Exports
 * 
 * Provides flexible module ID resolution with multiple fallback strategies
 */

export { resolveModuleId } from './resolver.js';
export {
  ResolutionResult,
  ResolutionSource,
  ResolverOptions,
  AmbiguousSubstringError,
  NoMatchFoundError
} from './types.js';
