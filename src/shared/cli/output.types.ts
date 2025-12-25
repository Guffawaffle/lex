/**
 * Canonical CLI Output Event Types (v1)
 *
 * Defines the structure and semantics for all CLI events emitted by Lex.
 * See schemas/cli-output.v1.schema.json for the authoritative JSON Schema.
 */

/**
 * Severity level for CLI output
 */
export type CliLevel = "info" | "warn" | "error" | "success" | "debug";

/**
 * Canonical CLI event (JSONL line or structured log entry)
 *
 * @param v - Schema version (always 1 for v1 events)
 * @param ts - Timestamp in ISO 8601 format
 * @param level - Severity level
 * @param scope - Optional source scope (e.g., "cli:remember")
 * @param code - Optional machine-readable code (e.g., "MEM_WRITE_OK", "FRAME_NOT_FOUND")
 * @param message - Optional short human-readable text (1-100 chars)
 * @param data - Optional arbitrary payload (object or primitive)
 * @param hint - Optional human-readable hint (printed to stderr in plain mode)
 */
export interface CliEvent<T = unknown> {
  v: 1;
  ts: string;
  level: CliLevel;
  scope?: string;
  code?: string;
  message?: string;
  data?: T;
  hint?: string;
}

/**
 * Options for creating an output writer
 *
 * @param scope - Event source scope (optional, included in all events)
 * @param mode - Output mode: "plain" for human, "jsonl" for machines. Defaults to env or plain.
 * @param pretty - Whether to use colors/formatting. Defaults to env or TTY detection.
 * @param logger - Optional logger adapter (pino-compatible shape) for diagnostic sink.
 * @param verbose - Whether to enable diagnostic logging. Defaults to false.
 */
export interface OutputOptions {
  scope?: string;
  mode?: "plain" | "jsonl";
  pretty?: boolean;
  logger?: {
    trace(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
  };
  verbose?: boolean;
}

/**
 * CLI output writer interface
 *
 * All methods support optional code, data, and (for error/warn) hints.
 */
export interface CliOutput {
  info(message: string, data?: unknown, code?: string): void;
  success(message: string, data?: unknown, code?: string): void;
  warn(message: string, data?: unknown, code?: string, hint?: string): void;
  error(message: string, data?: unknown, code?: string, hint?: string): void;
  debug(message: string, data?: unknown, code?: string): void;
  json<T = unknown>(event: Omit<CliEvent<T>, "v" | "ts">): void;
}
