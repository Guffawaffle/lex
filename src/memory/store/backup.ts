/**
 * Database backup and maintenance utilities
 */

import type Database from "better-sqlite3";
import { mkdirSync, existsSync, readdirSync, statSync, unlinkSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { readFileSync } from "fs";
import { getLogger } from "../../shared/logger/index.js";

const logger = getLogger("memory:store:backup");

/**
 * Get default backup directory path
 */
export function getBackupDir(): string {
  // Try to find repo root
  try {
    const repoRoot = findRepoRoot(process.cwd());
    const backupDir = join(repoRoot, ".smartergpt.local", "lex", "backups");
    
    // Ensure directory exists
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    return backupDir;
  } catch {
    // Fallback to home directory if not in repo
    const backupDir = join(homedir(), ".lex", "backups");
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
    return backupDir;
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
 * Vacuum the database to optimize and reclaim space
 */
export function vacuumDatabase(db: Database.Database): void {
  const start = Date.now();
  logger.info({ operation: "vacuumDatabase" }, "Starting database vacuum");
  
  try {
    db.exec("VACUUM");
    const duration = Date.now() - start;
    logger.info({ operation: "vacuumDatabase", duration_ms: duration }, "Database vacuum completed");
  } catch (error) {
    logger.error({ operation: "vacuumDatabase", error }, "Database vacuum failed");
    throw error;
  }
}

/**
 * Create a timestamped backup of the database
 * 
 * @param dbPath - Path to the database file
 * @param backupDir - Directory to store backups (optional, defaults to .smartergpt.local/lex/backups)
 * @param rotate - Number of backups to keep (optional, defaults to LEX_BACKUP_RETENTION or 7)
 * @returns Path to the created backup file
 */
export function backupDatabase(
  dbPath: string,
  backupDir?: string,
  rotate?: number
): string {
  const start = Date.now();
  const dir = backupDir || getBackupDir();
  const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const backupPath = join(dir, `memory-${timestamp}.sqlite`);

  logger.info({ operation: "backupDatabase", metadata: { dbPath, backupPath } }, "Starting database backup");

  try {
    // Ensure backup directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Copy database file
    copyFileSync(dbPath, backupPath);

    const duration = Date.now() - start;
    logger.info(
      { operation: "backupDatabase", duration_ms: duration, metadata: { backupPath } },
      "Database backup completed"
    );

    // Rotate backups if requested
    if (rotate !== undefined) {
      rotateBackups(dir, rotate);
    }

    return backupPath;
  } catch (error) {
    logger.error({ operation: "backupDatabase", error }, "Database backup failed");
    throw error;
  }
}

/**
 * Rotate backups, keeping only the most recent N backups
 * 
 * @param backupDir - Directory containing backups
 * @param maxBackups - Maximum number of backups to keep (default: 7)
 */
export function rotateBackups(backupDir: string, maxBackups: number = 7): void {
  const start = Date.now();
  logger.info(
    { operation: "rotateBackups", metadata: { backupDir, maxBackups } },
    "Starting backup rotation"
  );

  try {
    const backups = readdirSync(backupDir)
      .filter(f => f.startsWith("memory-") && f.endsWith(".sqlite"))
      .map(f => ({
        name: f,
        path: join(backupDir, f),
        mtime: statSync(join(backupDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);

    // Keep only maxBackups newest
    const toDelete = backups.slice(maxBackups);
    toDelete.forEach(backup => {
      logger.info({ metadata: { file: backup.name } }, "Deleting old backup");
      unlinkSync(backup.path);
    });

    const duration = Date.now() - start;
    logger.info(
      { operation: "rotateBackups", duration_ms: duration, metadata: { deleted: toDelete.length, kept: backups.length - toDelete.length } },
      "Backup rotation completed"
    );
  } catch (error) {
    logger.error({ operation: "rotateBackups", error }, "Backup rotation failed");
    throw error;
  }
}

/**
 * Get the default backup retention count from environment variable
 */
export function getBackupRetention(): number {
  const retention = process.env.LEX_BACKUP_RETENTION;
  if (retention) {
    const parsed = parseInt(retention, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 7; // default
}
