/**
 * Database maintenance commands
 */

import { getDefaultDbPath, createDatabase } from "../../memory/store/db.js";
import { vacuumDatabase, backupDatabase, getBackupRetention } from "../../memory/store/backup.js";
import * as output from "./output.js";

export interface DbVacuumOptions {
  json?: boolean;
}

export interface DbBackupOptions {
  rotate?: number;
  json?: boolean;
}

/**
 * Vacuum the database to optimize and reclaim space
 */
export async function dbVacuum(options: DbVacuumOptions): Promise<void> {
  try {
    const dbPath = getDefaultDbPath();
    const db = createDatabase(dbPath);

    vacuumDatabase(db);
    db.close();

    if (options.json) {
      output.json({ success: true, message: "Database vacuum completed", dbPath });
    } else {
      output.success("Database vacuum completed");
      output.info(`Database: ${dbPath}`);
    }
  } catch (error) {
    if (options.json) {
      output.json({ success: false, error: String(error) });
    } else {
      output.error(`Database vacuum failed: ${String(error)}`);
    }
    process.exit(1);
  }
}

/**
 * Create a timestamped backup of the database
 */
export async function dbBackup(options: DbBackupOptions): Promise<void> {
  try {
    const dbPath = getDefaultDbPath();
    const rotation = options.rotate !== undefined ? options.rotate : getBackupRetention();
    
    const backupPath = backupDatabase(dbPath, undefined, rotation);

    if (options.json) {
      output.json({ success: true, backupPath, dbPath, rotation });
    } else {
      output.success("Database backup created");
      output.info(`Database: ${dbPath}`);
      output.info(`Backup: ${backupPath}`);
      output.info(`Retention: ${rotation} backups`);
    }
  } catch (error) {
    if (options.json) {
      output.json({ success: false, error: String(error) });
    } else {
      output.error(`Database backup failed: ${String(error)}`);
    }
    process.exit(1);
  }
}
