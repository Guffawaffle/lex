/**
 * Database backup and maintenance utilities
 *
 * Provides backup, vacuum, and rotation functionality for SQLite database.
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import type Database from "better-sqlite3";

/**
 * Get the backup directory path
 */
export function getBackupDirectory(workspaceRoot?: string): string {
  const root = workspaceRoot || process.env.LEX_WORKSPACE_ROOT || process.cwd();
  const backupDir = join(root, ".smartergpt.local", "lex", "backups");
  
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  
  return backupDir;
}

/**
 * Generate timestamped backup filename (format: memory-YYYYMMDD.sqlite)
 */
export function generateBackupFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `memory-${year}${month}${day}.sqlite`;
}

/**
 * Rotate backups, keeping only the N most recent
 */
export function rotateBackups(backupDir: string, maxBackups: number = 7): void {
  const backups = readdirSync(backupDir)
    .filter(f => f.startsWith("memory-") && f.endsWith(".sqlite"))
    .map(f => ({
      name: f,
      path: join(backupDir, f),
      time: statSync(join(backupDir, f)).mtime
    }))
    .sort((a, b) => b.time.getTime() - a.time.getTime());
  
  // Keep only maxBackups newest
  backups.slice(maxBackups).forEach(backup => {
    unlinkSync(backup.path);
  });
}

/**
 * Backup database to timestamped file with optional rotation
 *
 * @param dbPath - Path to the source database file
 * @param rotate - Number of backups to keep (default: 7, 0 = no rotation)
 * @param workspaceRoot - Optional workspace root override
 * @returns Path to the created backup file
 */
export function backupDatabase(
  dbPath: string,
  rotate: number = 7,
  workspaceRoot?: string
): string {
  const backupDir = getBackupDirectory(workspaceRoot);
  const backupFilename = generateBackupFilename();
  const backupPath = join(backupDir, backupFilename);
  
  // Copy database file
  copyFileSync(dbPath, backupPath);
  
  // Rotate old backups if requested
  if (rotate > 0) {
    rotateBackups(backupDir, rotate);
  }
  
  return backupPath;
}

/**
 * Vacuum (optimize) the database
 *
 * This command rebuilds the database file, repacking it into a minimal amount
 * of disk space and improving query performance.
 *
 * @param db - Database instance
 */
export function vacuumDatabase(db: Database.Database): void {
  db.exec("VACUUM");
}

/**
 * Get backup retention count from environment variable
 */
export function getBackupRetention(): number {
  const retention = process.env.LEX_BACKUP_RETENTION;
  if (retention) {
    const parsed = parseInt(retention, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 7; // Default: keep last 7 backups
}
