/**
 * Lex - Policy-aware work continuity with receipts
 *
 * Main entry point for the unified Lex package.
 *
 * For specific functionality, import from subpaths:
 * - `lex/memory/store` - Frame storage
 * - `lex/shared/types` - TypeScript types
 * - `lex/shared/policy` - Policy loading
 * - `lex/shared/atlas` - Atlas frame generation
 * - `lex/shared/aliases` - Module ID alias resolution
 * - `lex/shared/module_ids` - Module ID validation
 */

// Export core types
export type { Policy } from "./shared/types/policy.js";
export type { Frame } from "./shared/types/frame.js";

// Export main functionality
export { getDb, closeDb, saveFrame, getFrameById, searchFrames } from "./memory/store/index.js";
