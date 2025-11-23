/**
 * NDJSON File Logger
 *
 * Writes structured logs to .smartergpt.local/lex/logs/lex.log.ndjson
 * with stable field names for parsing and analysis.
 *
 * Log format:
 * {
 *   "timestamp": "2025-11-09T12:34:56.789Z",
 *   "level": "info",
 *   "module": "memory/store",
 *   "operation": "saveFrame",
 *   "duration_ms": 12,
 *   "message": "Frame saved successfully",
 *   "metadata": { "frameId": "abc123", "jira": "PROJ-123" },
 *   "error": { "name": "Error", "message": "...", "stack": "..." }
 * }
 */

import {
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from "fs";
import { join } from "path";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message?: string;
  module?: string;
  operation?: string;
  duration_ms?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Get the log directory path
 */
export function getLogDirectory(): string {
  // Check for workspace root
  const workspaceRoot = process.env.LEX_WORKSPACE_ROOT || process.cwd();
  const logDir = join(workspaceRoot, ".smartergpt.local", "lex", "logs");

  // Ensure directory exists
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  return logDir;
}

/**
 * Get the current log file path
 */
export function getLogFilePath(): string {
  return join(getLogDirectory(), "lex.log.ndjson");
}

/**
 * Rotate log file if it exceeds max size (default 100MB)
 */
export function rotateLogIfNeeded(maxSizeBytes: number = 100 * 1024 * 1024): void {
  const logPath = getLogFilePath();

  if (!existsSync(logPath)) {
    return;
  }

  const stats = statSync(logPath);
  if (stats.size < maxSizeBytes) {
    return;
  }

  // Rotate: rename current log to timestamped version
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").split("Z")[0];
  const rotatedPath = join(getLogDirectory(), `lex.log.${timestamp}.ndjson`);
  renameSync(logPath, rotatedPath);

  // Clean up old rotated logs (keep last 10)
  cleanupOldLogs(10);
}

/**
 * Clean up old rotated log files, keeping only the N most recent
 */
function cleanupOldLogs(keepCount: number): void {
  const logDir = getLogDirectory();
  const files = readdirSync(logDir)
    .filter((f) => f.startsWith("lex.log.") && f.endsWith(".ndjson") && f !== "lex.log.ndjson")
    .map((f) => ({
      name: f,
      path: join(logDir, f),
      mtime: statSync(join(logDir, f)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // Remove oldest files beyond keepCount
  files.slice(keepCount).forEach((file) => {
    try {
      unlinkSync(file.path);
    } catch {
      // Ignore errors during cleanup
    }
  });
}

/**
 * Write a log entry to the NDJSON log file
 */
export function writeLog(entry: LogEntry): void {
  // Check if logging is explicitly enabled (overrides all other settings)
  const explicitlyEnabled = process.env.LEX_LOG_NDJSON === "1";

  if (!explicitlyEnabled) {
    // Skip logging in test environment unless explicitly enabled
    if (process.env.NODE_ENV === "test") {
      return;
    }

    // Check if logging is disabled
    if (process.env.LEX_LOG_LEVEL === "silent") {
      return;
    }
  }

  try {
    // Rotate if needed
    rotateLogIfNeeded();

    // Ensure timestamp is set
    if (!entry.timestamp) {
      entry.timestamp = new Date().toISOString();
    }

    // Write NDJSON line
    const line = JSON.stringify(entry) + "\n";
    const logPath = getLogFilePath();

    // Create file if it doesn't exist
    if (!existsSync(logPath)) {
      writeFileSync(logPath, line, "utf-8");
    } else {
      appendFileSync(logPath, line, "utf-8");
    }
  } catch (error) {
    // Silent fail - don't disrupt application if logging fails
    // Only log to stderr in debug mode to avoid polluting application output
    if (process.env.LEX_DEBUG === "1") {
      // eslint-disable-next-line no-console
      console.error("Failed to write log:", error);
    }
  }
}

/**
 * Create a scoped NDJSON logger
 */
export class NDJSONLogger {
  constructor(private module: string) {}

  private log(
    level: LogLevel,
    message: string,
    opts?: {
      operation?: string;
      duration_ms?: number;
      error?: Error;
      metadata?: Record<string, unknown>;
    }
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      module: this.module,
      operation: opts?.operation,
      duration_ms: opts?.duration_ms,
      metadata: opts?.metadata,
    };

    if (opts?.error) {
      entry.error = {
        name: opts.error.name,
        message: opts.error.message,
        stack: opts.error.stack,
      };
    }

    writeLog(entry);
  }

  trace(message: string, opts?: Parameters<NDJSONLogger["log"]>[2]): void {
    this.log("trace", message, opts);
  }

  debug(message: string, opts?: Parameters<NDJSONLogger["log"]>[2]): void {
    this.log("debug", message, opts);
  }

  info(message: string, opts?: Parameters<NDJSONLogger["log"]>[2]): void {
    this.log("info", message, opts);
  }

  warn(message: string, opts?: Parameters<NDJSONLogger["log"]>[2]): void {
    this.log("warn", message, opts);
  }

  error(message: string, opts?: Parameters<NDJSONLogger["log"]>[2]): void {
    this.log("error", message, opts);
  }

  fatal(message: string, opts?: Parameters<NDJSONLogger["log"]>[2]): void {
    this.log("fatal", message, opts);
  }
}

/**
 * Get a scoped NDJSON logger instance
 */
export function getNDJSONLogger(module: string): NDJSONLogger {
  return new NDJSONLogger(module);
}
