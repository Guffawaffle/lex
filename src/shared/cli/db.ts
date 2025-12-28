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
import { existsSync, renameSync, unlinkSync, copyFileSync, statSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { dirname, join, basename } from "path";
import { AXErrorException } from "../errors/ax-error.js";

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
  /**
   * Number of rows to insert per batch/transaction. Reduces memory usage
   * for large migrations. Defaults to processing all rows in one transaction.
   */
  batchSize?: number;
  /**
   * Dry-run mode: estimate migration time and row counts without writing.
   */
  dryRun?: boolean;
  /**
   * Show progress indicator during migration.
   */
  progress?: boolean;
}

export interface DbStatsOptions {
  json?: boolean;
  detailed?: boolean;
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

// Constants for progress reporting
const ESTIMATED_ROWS_PER_SECOND = 10000; // Conservative throughput estimate for dry-run time estimation
const PROGRESS_UPDATE_INTERVAL = 100; // Update progress every N rows for large tables

/**
 * Format duration in human-readable format (e.g., "2h 30m 45s", "1m 30s", or "45s")
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Progress reporter for long-running operations.
 * Outputs progress updates to stdout without line breaks (using carriage return).
 */
interface ProgressState {
  totalRows: number;
  processedRows: number;
  startTime: number;
  tableName: string;
}

function updateProgress(state: ProgressState, json: boolean): void {
  if (json) return; // No progress in JSON mode

  const elapsed = Date.now() - state.startTime;
  const rowsPerMs = state.processedRows / (elapsed || 1);
  const remainingRows = state.totalRows - state.processedRows;
  const estimatedRemainingMs = remainingRows / (rowsPerMs || 1);

  const percent =
    state.totalRows > 0 ? Math.round((state.processedRows / state.totalRows) * 100) : 100;

  const etaStr =
    estimatedRemainingMs > 0 && state.processedRows > 0
      ? ` ETA: ${formatDuration(estimatedRemainingMs)}`
      : "";

  // Use carriage return to overwrite the same line
  process.stdout.write(
    `\r• Migrating ${state.tableName}: ${state.processedRows}/${state.totalRows} rows (${percent}%)${etaStr}   `
  );
}

function clearProgress(json: boolean): void {
  if (json) return;
  // Clear the progress line and move to next line
  process.stdout.write("\r\x1b[K");
}

// SQL identifier validation pattern (table and column names)
const VALID_SQL_IDENTIFIER_PATTERN = /^[a-zA-Z0-9_]+$/;

/**
 * Validate that a SQL identifier (table or column name) matches the expected pattern.
 * This prevents SQL injection even though identifiers come from the schema.
 *
 * @param identifier - The identifier to validate
 * @param type - Type of identifier for error messaging ("table" or "column")
 * @param context - Additional context for error messaging (e.g., table name for columns)
 * @throws Error if identifier doesn't match the pattern
 */
function validateSqlIdentifier(
  identifier: string,
  type: "table" | "column",
  context?: string
): void {
  if (!VALID_SQL_IDENTIFIER_PATTERN.test(identifier)) {
    const contextStr = context ? ` in ${context}` : "";
    const errorCode = type === "table" ? "INVALID_TABLE_NAME" : "INVALID_COLUMN_NAME";
    const errorMessage = `Invalid ${type} name detected${contextStr}: ${identifier}`;
    const nextActions = [
      `Ensure the database schema uses valid ${type} names`,
      `Check that no special characters are present in ${type} names`,
    ];
    throw new AXErrorException(errorCode, errorMessage, nextActions, { identifier, type, context });
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
 *
 * Performance features:
 * - Optional batch size for memory-efficient large migrations (--batch-size N)
 * - Progress indicator showing rows processed and ETA (--progress)
 * - Dry-run mode to estimate migration without writing (--dry-run)
 */
export async function dbEncrypt(options: DbEncryptOptions = {}): Promise<void> {
  const startTime = Date.now();
  const shouldBackup = options.backup ?? true; // Default to true unless explicitly disabled
  const batchSize = options.batchSize;
  const isDryRun = options.dryRun ?? false;
  const showProgress = options.progress ?? false;
  let tempPath: string | undefined;
  let backupPath: string | undefined;

  try {
    // Determine input and output paths
    const inputPath = options.input || getDefaultDbPath();
    const outputPath = options.output || inputPath.replace(/\.db$/, "-encrypted.db");

    // Get passphrase from environment only (not CLI for security)
    const passphrase = process.env.LEX_DB_KEY;
    if (!passphrase && !isDryRun) {
      throw new AXErrorException(
        "DB_ENCRYPTION_KEY_MISSING",
        "Encryption passphrase is required. Set LEX_DB_KEY environment variable.",
        [
          'Set the LEX_DB_KEY environment variable: export LEX_DB_KEY="your-passphrase"',
          "Ensure the passphrase is secure and backed up safely",
        ],
        { operation: "dbEncrypt" }
      );
    }

    // Verify input database exists
    if (!existsSync(inputPath)) {
      throw new AXErrorException(
        "DB_NOT_FOUND",
        `Input database not found: ${inputPath}`,
        [
          "Run `lex init` to create the database",
          "Check that LEX_DB_PATH environment variable points to the correct location",
          "Verify the database file path is correct",
        ],
        { path: inputPath, operation: "dbEncrypt" }
      );
    }

    // Check if output exists (still fail early for user feedback, but atomic create prevents race)
    // Skip this check in dry-run mode since we won't write anything
    if (!isDryRun && existsSync(outputPath)) {
      throw new AXErrorException(
        "DB_OUTPUT_EXISTS",
        `Output database already exists: ${outputPath}. Please remove it first or choose a different output path.`,
        [
          "Remove the existing output database file",
          "Choose a different output path using --output option",
          "Backup the existing file if needed before removing",
        ],
        { outputPath, inputPath, operation: "dbEncrypt" }
      );
    }

    logger.info("Starting database encryption", {
      operation: "dbEncrypt",
      metadata: {
        inputPath,
        outputPath,
        verify: options.verify,
        backup: shouldBackup,
        batchSize,
        dryRun: isDryRun,
        progress: showProgress,
      },
    });

    if (!options.json) {
      if (isDryRun) {
        output.info(`[DRY RUN] Analyzing database...`);
      } else {
        output.info(`Encrypting database...`);
      }
      output.info(`Input:  ${inputPath}`);
      if (!isDryRun) {
        output.info(`Output: ${outputPath}`);
      }
      if (batchSize) {
        output.info(`Batch size: ${batchSize} rows`);
      }
    }

    // Create backup before encryption (unless opted out or dry-run)
    if (shouldBackup && !isDryRun) {
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
    if (options.verify && !isDryRun) {
      sourceChecksum = calculateDatabaseChecksum(inputPath);
      if (!options.json) {
        output.info(`Source checksum: ${sourceChecksum}`);
      }
    }

    // Open source database (unencrypted)
    const sourceDb = new Database(inputPath, { readonly: true });

    // Get table information for all regular tables (exclude FTS virtual tables)
    const tableNames = sourceDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'"
      )
      .all() as Array<{ name: string }>;

    // Collect row counts for all tables (validates table names as well)
    const tableStats: Array<{ name: string; rowCount: number }> = [];
    let totalRowsAllTables = 0;

    for (const { name } of tableNames) {
      validateSqlIdentifier(name, "table");
      const countResult = sourceDb.prepare(`SELECT COUNT(*) as count FROM ${name}`).get() as {
        count: number;
      };
      tableStats.push({ name, rowCount: countResult.count });
      totalRowsAllTables += countResult.count;
    }

    // Get frame count specifically for backward compatibility
    const framesTable = tableStats.find((t) => t.name === "frames");
    const totalRows = framesTable?.rowCount ?? 0;

    if (!options.json) {
      output.info(
        `Found ${totalRows} frames to migrate (${totalRowsAllTables} total rows across ${tableNames.length} tables)`
      );
    }

    // Dry-run mode: estimate and exit
    if (isDryRun) {
      sourceDb.close();

      // Estimate time based on typical throughput
      const estimatedMs = (totalRowsAllTables / ESTIMATED_ROWS_PER_SECOND) * 1000;

      const duration = Date.now() - startTime;

      logger.info("Dry run completed", {
        operation: "dbEncrypt",
        duration_ms: duration,
        metadata: { inputPath, totalRows, totalRowsAllTables, tableCount: tableNames.length },
      });

      if (options.json) {
        output.json({
          success: true,
          operation: "encrypt",
          dry_run: true,
          input: inputPath,
          output: outputPath,
          tables: tableStats,
          total_rows: totalRowsAllTables,
          frames_count: totalRows,
          estimated_duration_ms: Math.round(estimatedMs),
          analysis_duration_ms: duration,
        });
      } else {
        output.success(`[DRY RUN] Analysis completed in ${duration}ms`);
        output.info(`Tables to migrate: ${tableNames.length}`);
        for (const { name, rowCount } of tableStats) {
          output.info(`  - ${name}: ${rowCount} rows`);
        }
        output.info(`Total rows: ${totalRowsAllTables}`);
        output.info(`Estimated migration time: ${formatDuration(estimatedMs)}`);
        output.warn(`\nRun without --dry-run to perform the actual migration`);
      }
      return;
    }

    // Derive encryption key
    const encryptionKey = deriveEncryptionKey(passphrase!);

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

    let totalProcessedRows = 0;

    for (const { name, rowCount } of tableStats) {
      const rows = sourceDb.prepare(`SELECT * FROM ${name}`).all();
      if (rows.length > 0) {
        const columns = Object.keys(rows[0] as Record<string, unknown>);
        // Validate column names to prevent SQL injection
        for (const col of columns) {
          validateSqlIdentifier(col, "column", `table "${name}"`);
        }
        const placeholders = columns.map(() => "?").join(", ");
        const stmt = destDb.prepare(
          `INSERT OR REPLACE INTO ${name} (${columns.join(", ")}) VALUES (${placeholders})`
        );

        // Progress state for this table
        const progressState: ProgressState = {
          totalRows: rowCount,
          processedRows: 0,
          startTime: Date.now(),
          tableName: name,
        };

        if (batchSize && batchSize > 0) {
          // Batched processing: insert rows in chunks of batchSize
          const insertBatch = destDb.transaction((batchRows: Record<string, unknown>[]) => {
            for (const row of batchRows) {
              const values = columns.map((col) => row[col]);
              stmt.run(...values);
            }
          });

          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize) as Record<string, unknown>[];
            insertBatch(batch);

            progressState.processedRows = Math.min(i + batchSize, rows.length);
            totalProcessedRows += batch.length;

            if (showProgress) {
              updateProgress(progressState, options.json ?? false);
            }
          }
        } else {
          // Wrap per-table inserts in a transaction for atomicity and performance.
          // This batches all writes into a single transaction, significantly reducing
          // I/O overhead and ensuring table-level rollback on failure.
          const insertAllRows = destDb.transaction((rowsToInsert: Record<string, unknown>[]) => {
            let rowIdx = 0;
            for (const row of rowsToInsert) {
              const values = columns.map((col) => row[col]);
              stmt.run(...values);
              rowIdx++;

              // Update progress periodically for large tables
              if (showProgress && rowIdx % PROGRESS_UPDATE_INTERVAL === 0) {
                progressState.processedRows = rowIdx;
                updateProgress(progressState, options.json ?? false);
              }
            }
          });

          insertAllRows(rows as Record<string, unknown>[]);
          totalProcessedRows += rows.length;
        }

        // Final progress update for this table
        if (showProgress) {
          progressState.processedRows = rowCount;
          updateProgress(progressState, options.json ?? false);
          clearProgress(options.json ?? false);
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
        throw new AXErrorException(
          "DB_VERIFICATION_FAILED",
          `Data verification failed: source has ${totalRows} rows, encrypted database has ${verifiedRows} rows`,
          [
            "Check for database corruption during encryption",
            "Retry the encryption operation",
            "Restore from backup if available",
          ],
          { totalRows, verifiedRows, inputPath, outputPath, operation: "dbEncrypt" }
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
      metadata: { inputPath, outputPath, rowCount: totalRows, backupPath, batchSize },
    });

    if (options.json) {
      output.json({
        success: true,
        operation: "encrypt",
        input: inputPath,
        output: outputPath,
        rows_migrated: totalRows,
        total_rows_all_tables: totalProcessedRows,
        source_checksum: sourceChecksum,
        backup_path: backupPath,
        batch_size: batchSize,
        duration_ms: duration,
      });
    } else {
      output.success(`Database encrypted successfully in ${duration}ms`);
      output.info(`Encrypted database: ${outputPath}`);
      output.info(`Rows migrated: ${totalRows} frames (${totalProcessedRows} total rows)`);
      if (backupPath) {
        output.info(`Backup: ${backupPath}`);
      }
      output.warn(`\nIMPORTANT: Set LEX_DB_KEY environment variable to use the encrypted database`);
      output.warn(`Keep your passphrase secure - there is no way to recover it if lost!`);
      output.info(`Example: export LEX_DB_KEY="your-passphrase-here"`);
    }
  } catch (error) {
    // Clear progress line if showing progress
    if (showProgress) {
      clearProgress(options.json ?? false);
    }

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

  // Validate identifiers to prevent SQL injection
  const validIdentifierPattern = /^[a-zA-Z0-9_]+$/;

  // For each table, get all rows ordered deterministically
  const tableData: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    if (!validIdentifierPattern.test(name)) {
      throw new AXErrorException(
        "INVALID_TABLE_NAME",
        `Invalid table name detected during checksum: ${name}`,
        [
          "Ensure the database schema uses valid table names",
          "Check that no special characters are present in table names",
        ],
        { tableName: name, operation: "calculateChecksum" }
      );
    }

    // Get primary key columns for ordering
    const pragma = db.prepare(`PRAGMA table_info("${name}")`).all() as Array<{
      pk: number;
      name: string;
    }>;
    const pkCols = pragma.filter((col) => col.pk > 0).map((col) => col.name);

    // Validate column names from pragma to prevent SQL injection
    for (const col of pkCols) {
      if (!validIdentifierPattern.test(col)) {
        throw new AXErrorException(
          "INVALID_COLUMN_NAME",
          `Invalid column name detected in table "${name}": ${col}`,
          [
            "Ensure the database schema uses valid column names",
            "Check that no special characters are present in column names",
          ],
          { tableName: name, columnName: col, operation: "calculateChecksum" }
        );
      }
    }

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

/**
 * Receipt CLI command options
 */
export interface ReceiptCreateOptions {
  action: string;
  rationale: string;
  confidence: "high" | "medium" | "low" | "uncertain";
  reversibility: "reversible" | "partially-reversible" | "irreversible";
  outcome?: "success" | "failure" | "partial" | "deferred";
  rollbackPath?: string;
  output?: string;
  json?: boolean;
}

export interface ReceiptValidateOptions {
  input: string;
  json?: boolean;
}

/**
 * Create a receipt and optionally save to file
 */
export async function receiptCreate(options: ReceiptCreateOptions): Promise<void> {
  try {
    // Lazy load receipt module to avoid circular dependencies
    const { createReceipt } = await import("../../memory/receipts/index.js");

    const receipt = createReceipt({
      action: options.action,
      rationale: options.rationale,
      confidence: options.confidence,
      reversibility: options.reversibility,
      outcome: options.outcome,
      rollbackPath: options.rollbackPath,
    });

    if (options.json) {
      output.json(receipt);
    } else {
      output.success("Receipt created successfully");
      output.info(`Action: ${receipt.action}`);
      output.info(`Confidence: ${receipt.confidence}`);
      output.info(`Reversibility: ${receipt.reversibility}`);
      output.info(`Timestamp: ${receipt.timestamp}`);

      if (receipt.rollbackPath) {
        output.info(`Rollback path: ${receipt.rollbackPath}`);
      }
    }

    // Save to file if output path specified
    if (options.output) {
      const { writeFileSync } = await import("fs");
      writeFileSync(options.output, JSON.stringify(receipt, null, 2));

      if (!options.json) {
        output.success(`Receipt saved to ${options.output}`);
      }
    }
  } catch (error) {
    logger.error("Receipt creation failed", {
      operation: "receiptCreate",
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (options.json) {
      output.json({
        success: false,
        operation: "receipt-create",
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      output.error(
        `Failed to create receipt: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    process.exit(1);
  }
}

/**
 * Validate a receipt from file
 */
export async function receiptValidate(options: ReceiptValidateOptions): Promise<void> {
  try {
    // Lazy load receipt validation module
    const { validateReceiptPayload } = await import("../../memory/receipts/validator.js");
    const { readFileSync } = await import("fs");

    // Read and parse the receipt file
    const receiptData = JSON.parse(readFileSync(options.input, "utf-8"));

    // Validate
    const result = validateReceiptPayload(receiptData);

    if (options.json) {
      output.json(result);
    } else {
      if (result.valid) {
        output.success("Receipt is valid");
      } else {
        output.error("Receipt validation failed");
        output.info(`Errors: ${result.errors.length}`);

        for (const err of result.errors) {
          output.error(`  ${err.path}: ${err.message} (${err.code})`);
        }
      }

      if (result.warnings.length > 0) {
        output.warn(`\nWarnings: ${result.warnings.length}`);
        for (const warn of result.warnings) {
          output.warn(`  ${warn.path}: ${warn.message}`);
        }
      }
    }

    // Exit with error code if validation failed
    if (!result.valid) {
      process.exit(1);
    }
  } catch (error) {
    logger.error("Receipt validation failed", {
      operation: "receiptValidate",
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (options.json) {
      output.json({
        success: false,
        operation: "receipt-validate",
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      output.error(
        `Failed to validate receipt: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    process.exit(1);
  }
}

/**
 * Show database statistics
 */
export async function dbStats(options: DbStatsOptions = {}): Promise<void> {
  const startTime = Date.now();

  try {
    const dbPath = getDefaultDbPath();

    // Check if database exists
    if (!existsSync(dbPath)) {
      if (options.json) {
        output.json({
          success: false,
          error: "Database not found. Run 'lex init' to create it.",
        });
      } else {
        output.error("Database not found. Run 'lex init' to create it.");
      }
      process.exit(1);
    }

    const db = getDb();

    logger.info("Gathering database statistics", {
      operation: "dbStats",
      metadata: { dbPath },
    });

    // Get file size
    const stats = statSync(dbPath);
    const sizeBytes = stats.size;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1);

    // Get total frame count
    const totalCountResult = db.prepare("SELECT COUNT(*) as count FROM frames").get() as {
      count: number;
    };
    const totalFrames = totalCountResult.count;

    // Calculate date for one week ago
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const oneWeekAgoISO = oneWeekAgo.toISOString();

    // Calculate date for one month ago
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoISO = oneMonthAgo.toISOString();

    // Get frames from this week
    const weekCountResult = db
      .prepare("SELECT COUNT(*) as count FROM frames WHERE timestamp >= ?")
      .get(oneWeekAgoISO) as { count: number };
    const thisWeek = weekCountResult.count;

    // Get frames from this month
    const monthCountResult = db
      .prepare("SELECT COUNT(*) as count FROM frames WHERE timestamp >= ?")
      .get(oneMonthAgoISO) as { count: number };
    const thisMonth = monthCountResult.count;

    // Get date range (oldest and newest)
    let oldestDate: string | null = null;
    let newestDate: string | null = null;

    if (totalFrames > 0) {
      const oldestResult = db.prepare("SELECT MIN(timestamp) as oldest FROM frames").get() as {
        oldest: string | null;
      };
      oldestDate = oldestResult.oldest;

      const newestResult = db.prepare("SELECT MAX(timestamp) as newest FROM frames").get() as {
        newest: string | null;
      };
      newestDate = newestResult.newest;
    }

    // Get module distribution
    const moduleDistribution: Record<string, number> = {};

    // Get all frames and parse module_scope
    // For large databases, we iterate rather than load all at once
    const frameIterator = db
      .prepare("SELECT module_scope FROM frames")
      .iterate() as IterableIterator<{
      module_scope: string;
    }>;

    for (const frame of frameIterator) {
      try {
        const modules = JSON.parse(frame.module_scope) as string[];
        for (const module of modules) {
          moduleDistribution[module] = (moduleDistribution[module] || 0) + 1;
        }
      } catch {
        // Skip frames with invalid JSON
      }
    }

    // Sort modules by count descending
    const sortedModules = Object.entries(moduleDistribution)
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count);

    // Get rules count (check if table exists first)
    let rulesCount = 0;
    try {
      const rulesCountResult = db
        .prepare("SELECT COUNT(*) as count FROM lexsona_behavior_rules")
        .get() as { count: number };
      rulesCount = rulesCountResult.count;
    } catch {
      // Table doesn't exist yet (pre-migration V7)
      rulesCount = 0;
    }

    // Get receipts count (check if table exists first)
    let receiptsCount = 0;
    try {
      const receiptsCountResult = db.prepare("SELECT COUNT(*) as count FROM receipts").get() as {
        count: number;
      };
      receiptsCount = receiptsCountResult.count;
    } catch {
      // Table doesn't exist yet (pre-migration V8)
      receiptsCount = 0;
    }

    const duration = Date.now() - startTime;

    logger.info("Database statistics gathered", {
      operation: "dbStats",
      duration_ms: duration,
      metadata: { dbPath, totalFrames },
    });

    // Output results
    if (options.json) {
      const jsonOutput: Record<string, unknown> = {
        path: dbPath,
        sizeBytes,
        frames: {
          total: totalFrames,
          thisWeek,
          thisMonth,
        },
        dateRange: {
          oldest: oldestDate,
          newest: newestDate,
        },
        moduleDistribution: options.detailed
          ? Object.fromEntries(sortedModules.map((m) => [m.module, m.count]))
          : Object.fromEntries(sortedModules.slice(0, 5).map((m) => [m.module, m.count])),
        rules: rulesCount,
        receipts: receiptsCount,
      };

      output.json(jsonOutput);
    } else {
      // Human-readable output
      output.info("Database Statistics");
      output.info("═══════════════════");
      output.info("");
      output.info(`Location: ${dbPath}`);
      output.info(`Size: ${sizeMB} MB`);
      output.info("");
      output.info("Frames:");
      output.info(`  Total: ${totalFrames}`);
      output.info(`  This week: ${thisWeek}`);
      output.info(`  This month: ${thisMonth}`);
      output.info("");

      if (oldestDate && newestDate) {
        output.info("Date Range:");
        output.info(`  Oldest: ${oldestDate.split("T")[0]}`);
        output.info(`  Newest: ${newestDate.split("T")[0]}`);
        output.info("");
      }

      if (sortedModules.length > 0) {
        const modulesToShow = options.detailed ? sortedModules : sortedModules.slice(0, 5);
        const otherCount = options.detailed
          ? 0
          : sortedModules.slice(5).reduce((sum, m) => sum + m.count, 0);

        // Calculate max length for padding (minimum 20, maximum from actual module names)
        const maxModuleLength = Math.max(
          20,
          ...modulesToShow.map((m) => m.module.length),
          otherCount > 0 ? "(other)".length : 0
        );

        output.info(options.detailed ? "Module Distribution:" : "Top Modules:");
        for (const { module, count } of modulesToShow) {
          const percentage = totalFrames > 0 ? Math.round((count / totalFrames) * 100) : 0;
          output.info(`  ${module.padEnd(maxModuleLength)} ${count} frames (${percentage}%)`);
        }

        if (!options.detailed && otherCount > 0) {
          const otherPercentage =
            totalFrames > 0 ? Math.round((otherCount / totalFrames) * 100) : 0;
          output.info(
            `  ${"(other)".padEnd(maxModuleLength)} ${otherCount} frames (${otherPercentage}%)`
          );
        }
        output.info("");
      }

      output.info(`Rules: ${rulesCount}`);
      output.info(`Receipts: ${receiptsCount}`);
    }
  } catch (error) {
    logger.error("Database stats failed", {
      operation: "dbStats",
      error: error instanceof Error ? error : new Error(String(error)),
    });

    if (options.json) {
      output.json({
        success: false,
        operation: "stats",
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      output.error(
        `Failed to gather database statistics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    process.exit(1);
  }
}
