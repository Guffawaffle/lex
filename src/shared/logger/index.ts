import pino from "pino";
import type { LoggerOptions, Logger } from "pino";

const baseOpts: LoggerOptions = {
  level: process.env.LEX_LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: undefined,
  serializers: {
    err: (e: unknown) =>
      e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e,
  },
};

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
export function getLogger(scope?: string): Log {
  const shouldUsePretty = process.env.LEX_LOG_PRETTY === "1" || process.stdout.isTTY;

  // Best-effort pretty transport: only use if pino-pretty is available
  let transport: LoggerOptions["transport"];
  if (shouldUsePretty) {
    try {
      // Attempt to require pino-pretty; if it fails, fall back to JSON silently
      require.resolve("pino-pretty");
      transport = { target: "pino-pretty", options: { singleLine: true, colorize: true } };
    } catch {
      // pino-pretty not available, fall back to JSON silently
      transport = undefined;
    }
  }

  const root = pino({ ...baseOpts, transport });

  if (scope !== undefined && scope !== "") {
    return root.child({ scope });
  }
  return root;
}
