/**
 * CLI module - Re-exports from shared/cli
 *
 * This provides a cleaner import path: lex/cli instead of lex/shared/cli
 */

export { createProgram, run } from "../shared/cli/index.js";
export type { RememberOptions } from "../shared/cli/remember.js";
export type { RecallOptions } from "../shared/cli/recall.js";
export type { CheckOptions } from "../shared/cli/check.js";
export type { TimelineCommandOptions } from "../shared/cli/timeline.js";
