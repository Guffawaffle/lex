/**
 * CLI Output Wrapper (v1)
 *
 * Canonical CLI output implementation with dual sinks:
 * 1. User-facing stdout/stderr (plain text or JSONL)
 * 2. Optional diagnostic logger (pino-backed today, pluggable)
 *
 * This is the ONLY file in src/ allowed to call console.*
 * All CLI commands must use this wrapper.
 *
 * Environment Variables:
 * - LEX_CLI_OUTPUT_MODE: "plain" (default) or "jsonl"
 * - LEX_CLI_PRETTY: "1" to force color/formatting (auto-detected from TTY)
 *
 * See docs/CLI_OUTPUT.md for details and schemas/cli-output.v1.schema.json for schema.
 */

import type { CliEvent, CliLevel, OutputOptions, CliOutput } from "./output.types.js";
import { getLogger } from "../logger/index.js";

const isTTY = !!process.stdout.isTTY;
const envMode = (process.env.LEX_CLI_OUTPUT_MODE ?? "").toLowerCase();
const envPretty = process.env.LEX_CLI_PRETTY === "1" || isTTY;

// Tiny color helpers (no external deps)
const c = {
  dim: (s: string) => (envPretty ? `\x1b[2m${s}\x1b[0m` : s),
  green: (s: string) => (envPretty ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (envPretty ? `\x1b[33m${s}\x1b[0m` : s),
  red: (s: string) => (envPretty ? `\x1b[31m${s}\x1b[0m` : s),
};

/**
 * Create a CLI output writer with specified options
 *
 * @param opts - Configuration options (scope, mode, logger, etc.)
 * @returns CLI output writer with info/success/warn/error/debug/json methods
 */
export function createOutput(opts: OutputOptions = {}): CliOutput {
  const mode = opts.mode ?? (envMode === "jsonl" ? "jsonl" : "plain");
  const scope = opts.scope;
  const diag = opts.logger ?? getLogger("cli:output");

  function nowIso(): string {
    return new Date().toISOString();
  }

  function emit(
    level: CliLevel,
    message?: string,
    data?: unknown,
    code?: string,
    hint?: string
  ): void {
    const evt: CliEvent = {
      v: 1,
      ts: nowIso(),
      level,
      ...(scope && { scope }),
      ...(code && { code }),
      ...(message && { message }),
      ...(data !== undefined && { data }),
      ...(hint && { hint }),
    };

    // Diagnostic sink: always gets structured object (non-blocking)
    try {
      const diagMsg = message ?? code ?? `cli ${level}`;
      if (level === "error") {
        diag.error({ evt }, diagMsg);
      } else if (level === "warn") {
        diag.warn({ evt }, diagMsg);
      } else if (level === "debug") {
        diag.debug({ evt }, diagMsg);
      } else {
        diag.info({ evt }, diagMsg);
      }
    } catch {
      // Avoid breaking CLI on logger errors
    }

    // User-facing sink: stdout/stderr
    if (mode === "jsonl") {
      const line = JSON.stringify(evt);
      if (level === "error") {
        console.error(line);
      } else {
        console.log(line);
      }
      return;
    }

    // Plain mode: human-readable with symbols
    const tag =
      level === "success"
        ? c.green("✔")
        : level === "warn"
          ? c.yellow("⚠")
          : level === "error"
            ? c.red("✖")
            : level === "debug"
              ? c.dim("∙")
              : "•";

    const sc = scope ? c.dim(`[${scope}] `) : "";
    const msg = message ?? code ?? "";
    const line = `${tag} ${sc}${msg}`;

    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }

    // Print hint to stderr in plain mode (if provided and not an error)
    if (hint && level !== "error") {
      console.error(c.dim(`  ${hint}`));
    }
  }

  return {
    info(message: string, data?: unknown, code?: string): void {
      emit("info", message, data, code);
    },
    success(message: string, data?: unknown, code?: string): void {
      emit("success", message, data, code);
    },
    warn(message: string, data?: unknown, code?: string, hint?: string): void {
      emit("warn", message, data, code, hint);
    },
    error(message: string, data?: unknown, code?: string, hint?: string): void {
      emit("error", message, data, code, hint);
    },
    debug(message: string, data?: unknown, code?: string): void {
      emit("debug", message, data, code);
    },
    json<T = unknown>(event: Omit<CliEvent<T>, "v" | "ts">): void {
      const { level, ...rest } = event as CliEvent<T>;
      emit(
        level ?? "info",
        rest.message,
        rest.data,
        rest.code,
        rest.hint
      );
    },
  };
}

/**
 * Default output instance used by most CLI commands
 * Scope set to "cli" for general commands
 */
export const output = createOutput({ scope: "cli" });

// Backward-compatible exports for existing CLI commands
// These delegate to the default output instance
export const info = output.info.bind(output);
export const success = output.success.bind(output);
export const warn = output.warn.bind(output);
export const error = output.error.bind(output);
export const debug = output.debug.bind(output);
export const json = output.json.bind(output);
