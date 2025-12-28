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

// Tiny color helpers (no external deps)
const c = {
  dim: (s: string) =>
    process.env.LEX_CLI_PRETTY === "1" || process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s,
  green: (s: string) =>
    process.env.LEX_CLI_PRETTY === "1" || process.stdout.isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: (s: string) =>
    process.env.LEX_CLI_PRETTY === "1" || process.stdout.isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  red: (s: string) =>
    process.env.LEX_CLI_PRETTY === "1" || process.stdout.isTTY ? `\x1b[31m${s}\x1b[0m` : s,
};

/**
 * Create a CLI output writer with specified options
 *
 * @param opts - Configuration options (scope, mode, logger, etc.)
 * @returns CLI output writer with info/success/warn/error/debug/json methods
 */
export function createOutput(opts: OutputOptions = {}): CliOutput {
  const envMode = (process.env.LEX_CLI_OUTPUT_MODE ?? "").toLowerCase();
  const mode = opts.mode ?? (envMode === "jsonl" ? "jsonl" : "plain");
  const scope = opts.scope;
  const verbose =
    opts.verbose ?? (process.env.LEX_DEBUG === "1" || process.env.LEX_VERBOSE === "1");
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

    // Diagnostic sink: only log if verbose mode is enabled
    if (verbose) {
      try {
        const diagMsg = `CLI Output: ${message ?? code ?? level}`;
        if (level === "error") {
          diag.error(diagMsg);
        } else if (level === "warn") {
          diag.warn(diagMsg);
        } else if (level === "debug") {
          diag.debug(diagMsg);
        } else {
          diag.info(diagMsg);
        }
      } catch {
        // Avoid breaking CLI on logger errors
      }
    }

    // User-facing sink: stdout/stderr
    if (mode === "jsonl") {
      const line = JSON.stringify(evt);
      if (level === "error" || level === "warn") {
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

    if (level === "error" || level === "warn") {
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
      emit(level ?? "info", rest.message, rest.data, rest.code, rest.hint);
    },
  };
}

/**
 * Default output instance used by most CLI commands
 * Scope set to "cli" for general commands
 */
export const output = createOutput({ scope: "cli" });

// Convenience exports for existing CLI commands
// These delegate to the default output instance
export const info = output.info.bind(output);
export const success = output.success.bind(output);
export const warn = output.warn.bind(output);
export const error = output.error.bind(output);
export const debug = output.debug.bind(output);

// JSON export: outputs raw JSON (bypasses wrapper)
// Used for --json flags in CLI commands to output arbitrary data
export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// Raw export: outputs unformatted text (bypasses wrapper)
// Used for timeline and other formatted output that shouldn't have symbols
export function raw(message: string): void {
  console.log(message);
}
