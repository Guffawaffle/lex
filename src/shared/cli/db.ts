/**
 * Database maintenance commands
 *
 * Commands:
 * - lex db vacuum: Optimize database
 * - lex db backup [--rotate N]: Create timestamped backup with rotation
 */

import { getDb, getDefaultDbPath } from "../../memory/store/index.js";
import { backupDatabase, vacuumDatabase, getBackupRetention } from "../../memory/store/backup.js";
import * as output from "./output.js";
import { getNDJSONLogger } from "../logger/index.js";

const logger = getNDJSONLogger("cli/db");

export interface DbVacuumOptions {
  json?: boolean;
}

export interface DbBackupOptions {
  rotate?: number;
  json?: boolean;
}

/**
 * Vacuum (optimize) the database
 */
export async function dbVacuum(options: DbVacuumOptions = {}): Promise<void> {
  const startTime = Date.now();
  
  try {
    const dbPath = getDefaultDbPath();
    const db = getDb();
    
    logger.info("Starting database vacuum", {
      operation: "dbVacuum",
      metadata: { dbPath }
    });
    
    vacuumDatabase(db);
    
    const duration = Date.now() - startTime;
    
    logger.info("Database vacuum completed", {
      operation: "dbVacuum",
      duration_ms: duration,
      metadata: { dbPath }
    });
    
    if (options.json) {
      output.json({
        success: true,
        operation: "vacuum",
        database: dbPath,
        duration_ms: duration
      });
    } else {
      output.success(`Database optimized (vacuum completed in ${duration}ms)`);
      output.info(`Database: ${dbPath}`);
    }
  } catch (error) {
    logger.error("Database vacuum failed", {
      operation: "dbVacuum",
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    if (options.json) {
      output.json({
        success: false,
        operation: "vacuum",
        error: error instanceof Error ? error.message : String(error)
      });
    } else {
      output.error(`Failed to vacuum database: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Backup the database with optional rotation
 */
export async function dbBackup(options: DbBackupOptions = {}): Promise<void> {
  const startTime = Date.now();
  
  try {
    const dbPath = getDefaultDbPath();
    
    // Use provided rotation count or environment variable default
    const rotateCount = options.rotate !== undefined ? options.rotate : getBackupRetention();
    
    logger.info("Starting database backup", {
      operation: "dbBackup",
      metadata: { dbPath, rotateCount }
    });
    
    const backupPath = backupDatabase(dbPath, rotateCount);
    
    const duration = Date.now() - startTime;
    
    logger.info("Database backup completed", {
      operation: "dbBackup",
      duration_ms: duration,
      metadata: { dbPath, backupPath, rotateCount }
    });
    
    if (options.json) {
      output.json({
        success: true,
        operation: "backup",
        database: dbPath,
        backup: backupPath,
        rotation: rotateCount > 0 ? rotateCount : "disabled",
        duration_ms: duration
      });
    } else {
      output.success(`Database backed up successfully in ${duration}ms`);
      output.info(`Source: ${dbPath}`);
      output.info(`Backup: ${backupPath}`);
      if (rotateCount > 0) {
        output.info(`Rotation: keeping last ${rotateCount} backups`);
      } else {
        output.info(`Rotation: disabled`);
      }
    }
  } catch (error) {
    logger.error("Database backup failed", {
      operation: "dbBackup",
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    if (options.json) {
      output.json({
        success: false,
        operation: "backup",
        error: error instanceof Error ? error.message : String(error)
      });
    } else {
      output.error(`Failed to backup database: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}
