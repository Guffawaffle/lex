/**
 * Shared Type Definitions
 *
 * Central export point for all shared TypeScript types used across
 * memory/ and policy/ workspaces.
 */

// Frame types
export type { Frame, StatusSnapshot } from "./frame.js";
// AtlasFrame is defined in the shared atlas package (spatial neighborhood types).
// We re-export it here so consumers can import all shared types from
// `shared/types` while keeping atlas-specific implementation separate.
export type { AtlasFrame } from "../atlas/types.js";

export { validateFrameMetadata } from "./frame.js";

// Policy types
export type { PolicyModule, PolicyEdge, Policy } from "./policy.js";

export { validatePolicyModule } from "./policy.js";

// Validation types
export type { ModuleIdError, ValidationResult, ResolutionResult } from "./validation.js";

export { ModuleNotFoundError } from "./validation.js";
