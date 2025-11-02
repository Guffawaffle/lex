/**
 * Shared Type Definitions
 * 
 * Central export point for all shared TypeScript types used across
 * the Lex repository (memory/, policy/, and shared/ workspaces).
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
  Policy,
  PolicyModule,
  PolicyEdge
} from './policy.js';

export {
  validatePolicyModule
} from './policy.js';
