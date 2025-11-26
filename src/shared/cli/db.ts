/**
 * Database maintenance commands
 *
 * Commands:
 * - lex db vacuum: Optimize database
 * - lex db backup [--rotate N]: Create timestamped backup with rotation
 * - lex db encrypt: Encrypt existing database with SQLCipher
 */

import { getDb, getDefaultDbPath } from "../../memory/store/index.js";
import { backupDatabase, vacuumDatabase, getBackupRetention } from "../../memory/store/backup.js";
import { deriveEncryptionKey, initializeDatabase } from "../../memory/store/db.js";
import * as output from "./output.js";
import { getNDJSONLogger } from "../logger/index.js";
import Database from "better-sqlite3-multiple-ciphers";
import { existsSync, renameSync, unlinkSync, copyFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { dirname, join, basename } from "path";

const logger = getNDJSONLogger("cli/db");

export interface DbVacuumOptions {
  json?: boolean;
}

export interface DbBackupOptions {
  rotate?: number;
  json?: boolean;
}

export interface DbEncryptOptions {
  input?: string;
  output?: string;
  verify?: boolean;
  json?: boolean;
  /**
   * Create a timestamped backup of the input database before encryption.
   * Defaults to true for safety. Use --no-backup to disable.
   */
  backup?: boolean;
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
      metadata: { dbPath },
    });

    vacuumDatabase(db);

    const duration = Date.now() - startTime;

    logger.info("Database vacuum completed", {
      operation: "dbVacuum",
      duration_ms: duration,
      metadata: { dbPath },
    });

    if (options.json) {
      output.json({
        success: true,
        operation: "vacuum",
        database: dbPath,
        duration_ms: duration,
      });
    } else {
      output.success(`Database optimized (vacuum completed in ${duration}ms)`);
      output.info(`Database: ${dbPath}`);
    }
  } catch (error) {
    logger.error("Database vacuum failed", {
      operation: "dbVacuum",
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (options.json) {
      output.json({
        success: false,
        operation: "vacuum",
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      output.error(
        `Failed to vacuum database: ${error instanceof Error ? error.message : String(error)}`
      );
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
      metadata: { dbPath, rotateCount },
    });

    const backupPath = backupDatabase(dbPath, rotateCount);

    const duration = Date.now() - startTime;

    logger.info("Database backup completed", {
      operation: "dbBackup",
      duration_ms: duration,
      metadata: { dbPath, backupPath, rotateCount },
    });

    if (options.json) {
      output.json({
        success: true,
        operation: "backup",
        database: dbPath,
        backup: backupPath,
        rotation: rotateCount > 0 ? rotateCount : "disabled",
        duration_ms: duration,
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
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (options.json) {
      output.json({
        success: false,
        operation: "backup",
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      output.error(
        `Failed to backup database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    process.exit(1);
  }
}

/**
 * Encrypt an existing database with SQLCipher
 *
 * Migrates an unencrypted database to an encrypted one, with data integrity verification.
 * 
 * Security features:
 * - Creates a timestamped backup before encryption (unless --no-backup)
 * - Uses atomic file creation via temp+rename pattern to prevent TOCTOU race conditions
 */
export async function dbEncrypt(options: DbEncryptOptions = {}): Promise<void> {
  const startTime = Date.now();
  const shouldBackup = options.backup ?? true; // Default to true unless explicitly disabled
  let tempPath: string | undefined;
  let backupPath: string | undefined;

  try {
    // Determine input and output paths
    const inputPath = options.input || getDefaultDbPath();
    const outputPath = options.output || inputPath.replace(/\.db$/, "-encrypted.db");

    // Get passphrase from environment only (not CLI for security)
    const passphrase = process.env.LEX_DB_KEY;
    if (!passphrase) {
      throw new Error("Encryption passphrase is required. Set LEX_DB_KEY environment variable.");
    }

    // Verify input database exists
    if (!existsSync(inputPath)) {
      throw new Error(`Input database not found: ${inputPath}`);
    }

    // Check if output exists (still fail early for user feedback, but atomic create prevents race)
    if (existsSync(outputPath)) {
      throw new Error(
        `Output database already exists: ${outputPath}. ` +
          `Please remove it first or choose a different output path.`
      );
    }

    logger.info("Starting database encryption", {
      operation: "dbEncrypt",
      metadata: { inputPath, outputPath, verify: options.verify, backup: shouldBackup },
    });

    if (!options.json) {
      output.info(`Encrypting database...`);
      output.info(`Input:  ${inputPath}`);
      output.info(`Output: ${outputPath}`);
    }

    // Create backup before encryption (unless opted out)
    if (shouldBackup) {
      backupPath = createEncryptionBackup(inputPath);
      if (!options.json) {
        output.info(`Backup created: ${backupPath}`);
      }
      logger.info("Pre-encryption backup created", {
        operation: "dbEncrypt",
        metadata: { backupPath },
      });
    }

    // Calculate checksum of source database if verification requested
    let sourceChecksum: string | undefined;
    if (options.verify) {
      sourceChecksum = calculateDatabaseChecksum(inputPath);
      if (!options.json) {
        output.info(`Source checksum: ${sourceChecksum}`);
      }
    }

    // Open source database (unencrypted)
    const sourceDb = new Database(inputPath, { readonly: true });

    // Get row count for progress reporting
    const rowCountResult = sourceDb.prepare("SELECT COUNT(*) as count FROM frames").get() as {
      count: number;
    };
    const totalRows = rowCountResult.count;

    if (!options.json) {
      output.info(`Found ${totalRows} frames to migrate`);
    }

    // Derive encryption key
    const encryptionKey = deriveEncryptionKey(passphrase);

    // Create encrypted database in a temp file first (atomic creation pattern).
    // This prevents TOCTOU race conditions: the temp file is created exclusively,
    // and then atomically renamed to the final destination.
    const outputDir = dirname(outputPath);
    const outputBasename = basename(outputPath);
    const randomSuffix = randomBytes(8).toString("hex");
    tempPath = join(outputDir, `.${outputBasename}.${randomSuffix}.tmp`);

    const destDb = new Database(tempPath);
    destDb.pragma(`cipher='sqlcipher'`);
    destDb.pragma(`key="x'${encryptionKey}'"`);

    // Initialize schema using same approach as createDatabase
    initializeDatabase(destDb);

    // Copy data from all regular tables (exclude FTS virtual tables)
    // FTS (full-text search) tables are intentionally excluded from manual copying.
    // After calling initializeDatabase(destDb), triggers will automatically populate FTS tables
    // when data is inserted into the main tables (e.g., 'frames'), ensuring FTS synchronization.
    const tableNames = sourceDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'"
      )
      .all() as Array<{ name: string }>;

    // Validate table names to prevent SQL injection (even though they come from schema)
    const validTableNamePattern = /^[a-zA-Z0-9_]+$/;

    for (const { name } of tableNames) {
      // Validate table name matches expected pattern
      if (!validTableNamePattern.test(name)) {
        throw new Error(`Invalid table name detected: ${name}`);
      }
      const rows = sourceDb.prepare(`SELECT * FROM ${name}`).all();
      if (rows.length > 0) {
        const columns = Object.keys(rows[0] as Record<string, unknown>);
        const placeholders = columns.map(() => "?").join(", ");
        const stmt = destDb.prepare(
          `INSERT OR REPLACE INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})`
        );

        for (const row of rows) {
          const values = columns.map((col) => (row as Record<string, unknown>)[col]);
          stmt.run(...values);
        }
      }
    }

    sourceDb.close();
    destDb.close();

    // Atomically move temp file to final destination (POSIX atomic rename).
    // This ensures the output file is either completely written or doesn't exist.
    renameSync(tempPath, outputPath);
    tempPath = undefined; // Clear so cleanup doesn't try to remove it

    // Verify encrypted database if requested
    if (options.verify) {
      if (!options.json) {
        output.info("Verifying encrypted database...");
      }

      // Open encrypted database and verify data
      const verifyDb = new Database(outputPath);
      verifyDb.pragma(`cipher='sqlcipher'`);
      verifyDb.pragma(`key="x'${encryptionKey}'"`);

      const verifyCountResult = verifyDb.prepare("SELECT COUNT(*) as count FROM frames").get() as {
        count: number;
      };
      const verifiedRows = verifyCountResult.count;

      verifyDb.close();

      if (verifiedRows !== totalRows) {
        throw new Error(
          `Data verification failed: source has ${totalRows} rows, ` +
            `encrypted database has ${verifiedRows} rows`
        );
      }

      if (!options.json) {
        output.success(`✓ Verified: ${verifiedRows} frames migrated successfully`);
      }
    }

    const duration = Date.now() - startTime;

    logger.info("Database encryption completed", {
      operation: "dbEncrypt",
      duration_ms: duration,
      metadata: { inputPath, outputPath, rowCount: totalRows, backupPath },
    });

    if (options.json) {
      output.json({
        success: true,
        operation: "encrypt",
        input: inputPath,
        output: outputPath,
        rows_migrated: totalRows,
        source_checksum: sourceChecksum,
        backup_path: backupPath,
        duration_ms: duration,
      });
    } else {
      output.success(`Database encrypted successfully in ${duration}ms`);
      output.info(`Encrypted database: ${outputPath}`);
      output.info(`Rows migrated: ${totalRows}`);
      if (backupPath) {
        output.info(`Backup: ${backupPath}`);
      }
      output.warn(`\nIMPORTANT: Set LEX_DB_KEY environment variable to use the encrypted database`);
      output.warn(`Keep your passphrase secure - there is no way to recover it if lost!`);
      output.info(`Example: export LEX_DB_KEY="your-passphrase-here"`);
    }
  } catch (error) {
    // Cleanup temp file on error
    if (tempPath && existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    logger.error("Database encryption failed", {
      operation: "dbEncrypt",
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (options.json) {
      output.json({
        success: false,
        operation: "encrypt",
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      output.error(
        `Failed to encrypt database: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    process.exit(1);
  }
}

/**
 * Create a timestamped backup of the database before encryption.
 * Format: {filename}.pre-encrypt.{YYYYMMDD-HHMMSS}.db
 *
 * @param inputPath - Path to the input database file
 * @returns Path to the created backup file
 */
function createEncryptionBackup(inputPath: string): string {
  const now = new Date();
  // Format: YYYYMMDD-HHMMSS
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}${month}${day}-${hours}${minutes}${seconds}`;
  
  const inputDir = dirname(inputPath);
  const fullBasename = basename(inputPath);
  // Remove .db or .sqlite extension if present, otherwise use full basename
  const inputBasename = fullBasename.replace(/\.(db|sqlite)$/, "");
  const backupFilename = `${inputBasename}.pre-encrypt.${timestamp}.db`;
  const backupPath = join(inputDir, backupFilename);
  
  copyFileSync(inputPath, backupPath);
  return backupPath;
}

/**
 * Calculate SHA-256 checksum of database data (for verification)
 * Includes all tables to ensure complete data integrity verification
 */
function calculateDatabaseChecksum(dbPath: string): string {
  const db = new Database(dbPath, { readonly: true });

  // Get all regular tables (exclude sqlite internal and FTS tables)
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name"
    )
    .all() as Array<{ name: string }>;

  // Validate table names
  const validTableNamePattern = /^[a-zA-Z0-9_]+$/;

  // For each table, get all rows ordered deterministically
  const tableData: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    if (!validTableNamePattern.test(name)) {
      throw new Error(`Invalid table name detected during checksum: ${name}`);
    }

    // Get primary key columns for ordering
    const pragma = db.prepare(`PRAGMA table_info("${name}")`).all() as Array<{
      pk: number;
      name: string;
    }>;
    const pkCols = pragma.filter((col) => col.pk > 0).map((col) => col.name);

    // Build ORDER BY clause
    let orderBy = "";
    if (pkCols.length > 0) {
      orderBy = "ORDER BY " + pkCols.map((col) => `"${col}"`).join(", ");
    }

    const rows = db.prepare(`SELECT * FROM "${name}" ${orderBy}`).all();
    tableData[name] = rows;
  }

  db.close();

  // Serialize tables in deterministic order (already sorted by name)
  const dataString = JSON.stringify(
    tables.map(({ name }) => ({ table: name, rows: tableData[name] }))
  );

  return createHash("sha256").update(dataString).digest("hex");
}
