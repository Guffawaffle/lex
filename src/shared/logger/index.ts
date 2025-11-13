import pino from "pino";
import type { LoggerOptions, Logger } from "pino";
import { mkdirSync, existsSync, statSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";

const baseOpts: LoggerOptions = {
  level: process.env.LEX_LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: undefined,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  messageKey: "message",
  formatters: {
    level(label: string) {
      return { level: label };
    },
  },
  serializers: {
    err: (e: unknown) =>
      e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e,
    error: (e: unknown) =>
      e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : e,
  },
};

export type Log = Logger;

/**
 * Get default log file path: .smartergpt.local/lex/logs/lex.log.ndjson (relative to repo root)
 * Falls back to ~/.lex/logs/lex.log.ndjson if not in a lex repository
 * Can be overridden with LEX_LOG_FILE environment variable
 */
export function getLogFilePath(): string | null {
  // Disable file logging in test environment unless explicitly enabled
  if (process.env.NODE_ENV === "test" && !process.env.LEX_LOG_FILE) {
    return null;
  }

  // Check for environment variable override
  if (process.env.LEX_LOG_FILE) {
    return process.env.LEX_LOG_FILE;
  }

  // Try to find repo root
  try {
    const repoRoot = findRepoRoot(process.cwd());
    const logDir = join(repoRoot, ".smartergpt.local", "lex", "logs");
    
    // Ensure directory exists
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    return join(logDir, "lex.log.ndjson");
  } catch {
    // Fallback to home directory if not in repo
    const logDir = join(homedir(), ".lex", "logs");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    return join(logDir, "lex.log.ndjson");
  }
}

/**
 * Find repository root by looking for package.json with name "lex"
 */
function findRepoRoot(startPath: string): string {
  let currentPath = startPath;

  while (currentPath !== dirname(currentPath)) {
    const packageJsonPath = join(currentPath, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        if (packageJson.name === "lex") {
          return currentPath;
        }
      } catch {
        // Invalid package.json, continue searching
      }
    }
    currentPath = dirname(currentPath);
  }

  throw new Error("Repository root not found");
}

/**
 * Rotate log file if it exceeds max size (100MB)
 */
function rotateLogFileIfNeeded(logFile: string): void {
  const maxSize = 100 * 1024 * 1024; // 100MB

  try {
    if (existsSync(logFile)) {
      const stats = statSync(logFile);
      if (stats.size > maxSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const rotatedFile = logFile.replace(".ndjson", `.${timestamp}.ndjson`);
        
        // Rename current log file
        const fs = require("fs");
        fs.renameSync(logFile, rotatedFile);
        
        // Clean up old rotated logs (keep last 5)
        cleanupRotatedLogs(dirname(logFile));
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

/**
 * Clean up old rotated log files, keeping only the most recent N files
 */
function cleanupRotatedLogs(logDir: string, keepCount: number = 5): void {
  try {
    const files = readdirSync(logDir)
      .filter(f => f.startsWith("lex.log.") && f.endsWith(".ndjson") && f !== "lex.log.ndjson")
      .map(f => ({
        name: f,
        path: join(logDir, f),
        mtime: statSync(join(logDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);

    // Remove old files beyond keepCount
    files.slice(keepCount).forEach(file => {
      unlinkSync(file.path);
    });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get a scoped logger instance.
 *
 * Pretty printing is best-effort: if LEX_LOG_PRETTY=1 or output is a TTY,
 * attempts to use pino-pretty. If pino-pretty is not installed, silently
 * falls back to JSON output. This allows library consumers to skip pino-pretty
 * as an optional dependency.
 *
 * Structured NDJSON logs are written to .smartergpt.local/lex/logs/lex.log.ndjson
 * with fields: timestamp, level, module, operation, duration_ms, message, metadata, error
 *
 * @param scope - Optional scope name (maps to 'module' field in logs)
 * @returns Logger instance
 */
export function getLogger(scope?: string): Log {
  const shouldUsePretty = process.env.LEX_LOG_PRETTY === "1" || process.stdout.isTTY;
  const logFile = getLogFilePath();

  // Rotate log file if needed before creating logger
  if (logFile) {
    rotateLogFileIfNeeded(logFile);
  }

  // Build transport configuration
  let transport: LoggerOptions["transport"];
  
  if (logFile) {
    // For file logging, we want structured NDJSON with string levels
    // Since we can't use formatters with multi-transport, we'll use a single file transport
    // and log to console separately if needed
    transport = {
      target: "pino/file",
      options: { destination: logFile }
    };
  } else if (shouldUsePretty) {
    // Console only with pretty printing
    try {
      require.resolve("pino-pretty");
      transport = { target: "pino-pretty", options: { singleLine: true, colorize: true } };
    } catch {
      transport = undefined;
    }
  }

  const root = pino({ ...baseOpts, transport });

  if (scope !== undefined && scope !== "") {
    return root.child({ module: scope });
  }
  return root;
}
