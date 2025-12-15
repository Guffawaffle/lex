/**
 * Lex - Policy-aware work continuity with receipts
 *
 * Main entry point for the unified Lex package.
 * This is the Lex 1.0.0 public contract surface.
 *
 * ## Subpath Exports (1.0.0 Contract)
 *
 * | Import Path | Purpose |
 * |-------------|---------|
 * | `@smartergpt/lex` | Core types + store API (this file) |
 * | `@smartergpt/lex/types` | All shared types (Frame, Policy, AtlasFrame, etc.) |
 * | `@smartergpt/lex/store` | Direct database operations |
 * | `@smartergpt/lex/memory` | Frame payload validation helpers |
 * | `@smartergpt/lex/policy` | Policy loading and validation |
 * | `@smartergpt/lex/atlas` | Atlas Frame generation |
 * | `@smartergpt/lex/module-ids` | Module ID validation |
 * | `@smartergpt/lex/aliases` | Module alias resolution |
 * | `@smartergpt/lex/cli-output` | CLI JSON output utilities |
 * | `@smartergpt/lex/schemas/*` | JSON schemas (versioned) |
 *
 * ## Experimental (not part of 1.0.0 contract)
 *
 * The following are internal or experimental and may change:
 * - `@smartergpt/lex/prompts` - Template system (API stabilizing)
 * - `@smartergpt/lex/logger` - NDJSON logging (internal)
 * - rules/LexSona - Not exported (experimental)
 */

// =============================================================================
// CORE TYPES (1.0.0 Contract)
// =============================================================================

// Frame types - the core episodic memory structure
export type { Frame, StatusSnapshot, SpendMetadata } from "./shared/types/frame.js";
export { FRAME_SCHEMA_VERSION, validateFrameMetadata } from "./shared/types/frame.js";

// Policy types - architectural boundary definitions
export type { Policy, PolicyModule, PolicyEdge } from "./shared/types/policy.js";
export { validatePolicyModule } from "./shared/types/policy.js";

// Atlas types - spatial neighborhood for context generation
export type { AtlasFrame, AtlasModuleData, AtlasEdge } from "./shared/atlas/types.js";

// Validation types - module ID validation results
export type {
  ValidationResult,
  ModuleIdError,
  ResolutionResult,
} from "./shared/types/validation.js";
export { ModuleNotFoundError } from "./shared/types/validation.js";

// =============================================================================
// STORE API (1.0.0 Contract)
// =============================================================================

export {
  getDb,
  closeDb,
  saveFrame,
  getFrameById,
  searchFrames,
  getFramesByBranch,
  getFramesByJira,
  getFramesByModuleScope,
  getAllFrames,
  deleteFrame,
  getFrameCount,
} from "./memory/store/index.js";

// =============================================================================
// FRAME VALIDATION (1.0.0 Contract)
// =============================================================================

// Frame payload validation for external callers
export { validateFramePayload } from "./memory/validation/index.js";
export type {
  FrameValidationResult,
  FrameValidationError,
  FrameValidationWarning,
} from "./memory/validation/index.js";

// =============================================================================
// BATCH FRAME INGESTION (1.0.0 Contract)
// =============================================================================

// Batch Frame ingestion for external orchestrators
export { insertFramesBatch } from "./memory/batch.js";
export type {
  FrameInput,
  BatchOptions,
  BatchValidationError,
  BatchIngestionResult,
} from "./memory/batch.js";

// =============================================================================
// POLICY & ATLAS HELPERS (1.0.0 Contract)
// =============================================================================

// Policy loading with precedence rules
export { loadPolicy, clearPolicyCache } from "./shared/policy/loader.js";

// Module ID validation with alias support
export { validateModuleIds } from "./shared/module_ids/validator.js";
export { resolveModuleId } from "./shared/aliases/resolver.js";

// Atlas Frame generation for token-efficient context
export { generateAtlasFrame } from "./shared/atlas/atlas-frame.js";
export { autoTuneRadius, estimateTokens } from "./shared/atlas/auto-tune.js";

// Atlas rebuild trigger API (LEX-108: Batch Operations)
export {
  triggerAtlasRebuild,
  onRebuildComplete,
  removeRebuildCallback,
  initAtlasRebuildManager,
  getAtlasRebuildManager,
  resetAtlasRebuildManager,
  AtlasRebuildManager,
} from "./shared/atlas/trigger.js";
export type { RebuildResult, RebuildCallback, AtlasRebuildManagerConfig } from "./shared/atlas/trigger.js";
