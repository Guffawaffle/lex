import type { Logger } from "pino";
export type Log = Logger;
/**
 * Get a scoped logger instance.
 *
 * Pretty printing is best-effort: if LEX_LOG_PRETTY=1 or output is a TTY,
 * attempts to use pino-pretty. If pino-pretty is not installed, silently
 * falls back to JSON output. This allows library consumers to skip pino-pretty
 * as an optional dependency.
 *
 * @param scope - Optional scope name (included in every log entry)
 * @returns Logger instance
 */
export declare function getLogger(scope?: string): Log;
