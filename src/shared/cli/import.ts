/**
 * CLI Command: lex frames import
 *
 * Import frames from JSON files for backup recovery, migration, and team sharing.
 */

import { createFrameStore, type FrameStore } from "../../memory/store/index.js";
import { safeParseFrame } from "../types/frame-schema.js";
import type { Frame } from "../types/frame.js";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import * as output from "./output.js";
import { AXErrorException } from "../errors/ax-error.js";

export interface ImportCommandOptions {
  fromDir?: string;
  fromFile?: string;
  dryRun?: boolean;
  skipDuplicates?: boolean;
  merge?: boolean;
  json?: boolean;
}

/**
 * Read and parse a single JSON file
 * @returns Array of Frames (handles both single Frame and array formats)
 */
function readFramesFromFile(filepath: string): Frame[] {
  try {
    const content = readFileSync(filepath, "utf-8");
    const parsed = JSON.parse(content);

    // Handle both single Frame and array of Frames
    const candidates = Array.isArray(parsed) ? parsed : [parsed];

    // Validate each Frame
    const frames: Frame[] = [];
    const errors: string[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const result = safeParseFrame(candidates[i]);
      if (result.success) {
        frames.push(result.data);
      } else {
        const frameIndex = Array.isArray(parsed) ? `[${i}]` : "";
        errors.push(`Frame${frameIndex} validation failed: ${result.error.message}`);
      }
    }

    if (errors.length > 0 && frames.length === 0) {
      throw new Error(`All frames failed validation:\n${errors.join("\n")}`);
    }

    if (errors.length > 0) {
      output.warn(`Some frames in ${filepath} failed validation and were skipped`);
      errors.forEach((err) => output.warn(`  - ${err}`));
    }

    return frames;
  } catch (error) {
    throw new AXErrorException(
      "IMPORT_FILE_READ_ERROR",
      `Failed to read or parse file: ${filepath}`,
      [
        "Ensure the file exists and contains valid JSON",
        "File must contain either a single Frame object or an array of Frames",
        "All frames must conform to the Frame schema",
      ],
      { filepath, error: String(error) }
    );
  }
}

/**
 * Read all JSON files from a directory
 */
function readFramesFromDirectory(dirpath: string): { filesMap: Map<string, Frame[]>; readErrors: number } {
  if (!existsSync(dirpath)) {
    throw new AXErrorException(
      "IMPORT_DIR_NOT_FOUND",
      `Directory not found: ${dirpath}`,
      ["Ensure the directory path is correct", "Use --from-file for a single file import"],
      { dirpath }
    );
  }

  if (!statSync(dirpath).isDirectory()) {
    throw new AXErrorException(
      "IMPORT_PATH_NOT_DIR",
      `Path is not a directory: ${dirpath}`,
      ["Provide a directory path for --from-dir", "Use --from-file for a single file import"],
      { dirpath }
    );
  }

  const filesMap = new Map<string, Frame[]>();
  const files = readdirSync(dirpath).filter((f) => f.endsWith(".json"));
  let readErrors = 0;

  if (files.length === 0) {
    output.warn(`No JSON files found in directory: ${dirpath}`);
    return { filesMap, readErrors };
  }

  for (const file of files) {
    const filepath = join(dirpath, file);
    try {
      const frames = readFramesFromFile(filepath);
      if (frames.length > 0) {
        filesMap.set(file, frames);
      }
    } catch (error) {
      readErrors++;
      output.error(`Failed to read ${file}: ${String(error)}`);
    }
  }

  return { filesMap, readErrors };
}

/**
 * Execute the 'lex frames import' command
 *
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection
 */
export async function importFrames(
  options: ImportCommandOptions = {},
  frameStore?: FrameStore
): Promise<void> {
  // Validate options
  if (!options.fromDir && !options.fromFile) {
    if (options.json) {
      output.json({
        success: false,
        error: "Either --from-dir or --from-file must be specified",
      });
    } else {
      output.error("\n❌ Error: Either --from-dir or --from-file must be specified\n");
    }
    process.exit(1);
  }

  if (options.fromDir && options.fromFile) {
    if (options.json) {
      output.json({
        success: false,
        error: "Cannot specify both --from-dir and --from-file",
      });
    } else {
      output.error("\n❌ Error: Cannot specify both --from-dir and --from-file\n");
    }
    process.exit(1);
  }

  // If no store is provided, create a default one (which we'll need to close)
  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    const startTime = Date.now();
    let allFrames: Frame[] = [];
    let readErrors = 0;

    // Read frames from source
    if (options.fromDir) {
      const result = readFramesFromDirectory(options.fromDir);
      readErrors = result.readErrors;
      for (const frames of result.filesMap.values()) {
        allFrames.push(...frames);
      }
    } else if (options.fromFile) {
      allFrames = readFramesFromFile(options.fromFile);
    }

    if (allFrames.length === 0 && readErrors === 0) {
      const message = "No valid frames found to import";
      if (options.json) {
        output.json({
          success: true,
          imported: 0,
          skipped: 0,
          errors: 0,
          message,
        });
      } else {
        output.info(`\n${message}\n`);
      }
      return;
    }

    // If there were read errors, exit with error
    if (readErrors > 0 && allFrames.length === 0) {
      const message = `Failed to read ${readErrors} file(s)`;
      if (options.json) {
        output.json({
          success: false,
          imported: 0,
          skipped: 0,
          errors: readErrors,
          message,
        });
      } else {
        output.error(`\n❌ ${message}\n`);
      }
      process.exit(1);
    }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Dry run mode - validate without writing
    if (options.dryRun) {
      if (!options.json) {
        output.info(`\n🔍 Dry run mode - validating ${allFrames.length} frames...\n`);
      }

      for (const frame of allFrames) {
        const result = safeParseFrame(frame);
        if (result.success) {
          imported++;
        } else {
          errors++;
          if (!options.json) {
            output.error(`Frame ${frame.id} validation failed: ${result.error.message}`);
          }
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (options.json) {
        output.json({
          success: true,
          dryRun: true,
          validated: imported,
          errors,
          durationSeconds: parseFloat(duration),
        });
      } else {
        output.success(`\n✅ Dry run complete: ${imported} frames valid, ${errors} errors`);
        output.info(`Duration: ${duration}s\n`);
      }
      return;
    }

    // Import frames
    if (!options.json) {
      output.info(`\n📥 Importing ${allFrames.length} frames...\n`);
    }

    for (const frame of allFrames) {
      try {
        // Check if frame exists
        const existing = await store.getFrameById(frame.id);

        if (existing) {
          if (options.skipDuplicates) {
            skipped++;
            continue;
          } else if (!options.merge) {
            // Default behavior: error on duplicate
            errors++;
            if (!options.json) {
              output.error(`Frame ${frame.id} already exists (use --skip-duplicates or --merge)`);
            }
            continue;
          }
          // If merge is enabled, we'll overwrite below
        }

        // Save frame (this will upsert in merge mode)
        await store.saveFrame(frame);
        imported++;

        // Progress indicator for large imports
        if (imported % 100 === 0 && !options.json) {
          output.info(`Imported ${imported} frames...`);
        }
      } catch (error) {
        errors++;
        if (!options.json) {
          output.error(`Failed to import frame ${frame.id}: ${String(error)}`);
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Include readErrors in total error count
    const totalErrors = errors + readErrors;

    // Output results
    if (options.json) {
      const result = {
        success: totalErrors === 0,
        imported,
        skipped,
        errors: totalErrors,
        durationSeconds: parseFloat(duration),
      };
      output.json(result);
    } else {
      output.success(`\n✅ Import complete`);
      output.info(`Imported: ${imported}`);
      if (skipped > 0) {
        output.info(`Skipped: ${skipped}`);
      }
      if (totalErrors > 0) {
        output.warn(`Errors: ${totalErrors}`);
      }
      output.info(`Duration: ${duration}s\n`);
    }

    // Exit with error code if there were errors
    if (totalErrors > 0) {
      process.exit(1);
    }
  } catch (error) {
    if (options.json) {
      output.json({
        success: false,
        error: String(error),
      });
    } else {
      output.error(`\n❌ Import failed: ${String(error)}\n`);
    }
    process.exit(1);
  } finally {
    // Close store if we own it
    if (ownsStore) {
      await store.close();
    }
  }
}
