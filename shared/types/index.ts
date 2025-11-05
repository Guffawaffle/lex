/**
 * Shared Type Definitions
 *
 * Central export point for all shared TypeScript types used across
 * memory/ and policy/ workspaces.
 */

// Frame types
export type {
  Frame,
  StatusSnapshot,
  AtlasFrame
} from './frame.js';

export {
  validateFrameMetadata
} from './frame.js';

// Policy types
export type {
  PolicyModule,
  PolicyEdge,
  Policy
} from './policy.js';

export {
  validatePolicyModule
} from './policy.js';

// Validation types
export type {
  ModuleIdError,
  ValidationResult,
  ResolutionResult
} from './validation.js';

export {
  ModuleNotFoundError
} from './validation.js';
