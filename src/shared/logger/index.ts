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

export function getLogger(scope?: string): Log {
  const pretty = process.env.LEX_LOG_PRETTY === "1" || process.stdout.isTTY;
  const transport = pretty
    ? { target: "pino-pretty", options: { singleLine: true, colorize: true } }
    : undefined;
  const root = pino({ ...baseOpts, transport });
  if (scope !== undefined && scope !== "") {
    return root.child({ scope });
  }
  return root;
}
