/**
 * CLI Command: lex instructions generate
 *
 * Generates host-specific instruction projections from the canonical source file.
 *
 * Usage:
 *   lex instructions generate                    # Generate all projections
 *   lex instructions generate --dry-run          # Preview changes
 *   lex instructions generate --json             # Output as JSON
 *   lex instructions generate --verbose          # Show detailed progress
 *   lex instructions generate --project-root .   # Custom project root
 */

import { resolve } from "node:path";
import { loadLexYaml } from "../config/lex-yaml-loader.js";
import { loadCanonicalInstructions } from "../instructions/canonical-loader.js";
import { detectAvailableHosts } from "../instructions/host-detection.js";
import {
  generateProjections,
  defaultFileReader,
  type ProjectionResult,
} from "../instructions/projection-engine.js";
import { writeProjections, type WriteResult } from "../instructions/file-writer.js";
import * as output from "./output.js";

/**
 * Options for the instructions generate command
 */
export interface InstructionsGenerateOptions {
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
  /** Path to lex.yaml config file */
  config?: string;
  /** Preview changes without writing */
  dryRun?: boolean;
  /** Show detailed output */
  verbose?: boolean;
  /** Output results as JSON */
  json?: boolean;
}

/**
 * Result of generating instructions (for JSON output)
 */
export interface InstructionsGenerateResult {
  generated: Array<{ path: string; action: "created" | "updated" }>;
  skipped: Array<{ path: string; reason: string }>;
  errors: Array<{ path: string; error: string }>;
  summary: {
    generated: number;
    skipped: number;
    errors: number;
  };
}

/**
 * Execute the 'lex instructions generate' command
 *
 * @param options - Command options
 */
export async function instructionsGenerate(
  options: InstructionsGenerateOptions = {}
): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  try {
    // Load config
    const configResult = loadLexYaml(projectRoot);
    if (!configResult.success || !configResult.config) {
      const errorMsg = configResult.error ?? "Failed to load lex.yaml configuration";
      if (options.json) {
        output.json(createErrorResult(errorMsg));
      } else {
        output.error(errorMsg);
      }
      process.exit(1);
    }

    if (options.verbose && !options.json) {
      if (configResult.source === "file") {
        output.info(`Loaded config from ${configResult.path}`);
      } else {
        output.info("Using auto-detected defaults (no lex.yaml found)");
      }
    }

    // Load canonical instructions
    const canonical = loadCanonicalInstructions(projectRoot, configResult.config);
    if (!canonical.exists) {
      const errorMsg = `Canonical instruction file not found: ${canonical.path}`;
      if (options.json) {
        output.json(createErrorResult(errorMsg));
      } else {
        output.error(errorMsg);
        output.info(
          `Create the file at: ${configResult.config.instructions?.canonical ?? ".smartergpt/instructions/lex.md"}`
        );
      }
      process.exit(1);
    }

    if (options.verbose && !options.json) {
      output.info(`Loaded canonical instructions from ${canonical.path}`);
    }

    // Detect available hosts
    const hosts = detectAvailableHosts(projectRoot);

    if (options.verbose && !options.json) {
      if (hosts.copilot.available) {
        output.info(`Detected Copilot host: ${hosts.copilot.path}`);
      }
      if (hosts.cursor.available) {
        output.info(`Detected Cursor host: ${hosts.cursor.path}`);
      }
      if (!hosts.copilot.available && !hosts.cursor.available) {
        output.warn("No supported hosts detected in repository");
      }
    }

    // Generate projections
    const projections = generateProjections({
      canonical,
      hosts,
      config: configResult.config,
      readFile: defaultFileReader,
    });

    if (projections.length === 0) {
      const result: InstructionsGenerateResult = {
        generated: [],
        skipped: [],
        errors: [],
        summary: { generated: 0, skipped: 0, errors: 0 },
      };

      if (options.json) {
        output.json(result);
      } else {
        output.info("No projections to generate (no available hosts or all disabled)");
      }
      process.exit(0);
    }

    // Write projections or preview
    const writeResult = writeProjections(
      projections.map((p) => ({ path: p.path, content: p.content })),
      { dryRun: options.dryRun ?? false, backup: false }
    );

    // Build result
    const result = buildResult(projections, writeResult, options.dryRun ?? false);

    // Output
    if (options.json) {
      output.json(result);
    } else {
      displayResults(result, options.dryRun ?? false, options.verbose ?? false);
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (options.json) {
      output.json(createErrorResult(errorMsg));
    } else {
      output.error(`Failed to generate instructions: ${errorMsg}`);
    }
    process.exit(1);
  }
}

/**
 * Build the result object from projections and write result
 */
function buildResult(
  projections: ProjectionResult[],
  writeResult: WriteResult,
  _dryRun: boolean
): InstructionsGenerateResult {
  const generated: InstructionsGenerateResult["generated"] = [];
  const skipped: InstructionsGenerateResult["skipped"] = [];
  const errors: InstructionsGenerateResult["errors"] = [];

  // Map projections to results
  for (const projection of projections) {
    if (projection.action === "skip") {
      skipped.push({ path: projection.path, reason: "no changes" });
    } else if (writeResult.written.includes(projection.path)) {
      generated.push({
        path: projection.path,
        action: projection.action === "create" ? "created" : "updated",
      });
    } else if (writeResult.skipped.includes(projection.path)) {
      skipped.push({ path: projection.path, reason: "no changes" });
    }
  }

  // Add errors
  for (const error of writeResult.errors) {
    errors.push({ path: error.path, error: error.error });
  }

  return {
    generated,
    skipped,
    errors,
    summary: {
      generated: generated.length,
      skipped: skipped.length,
      errors: errors.length,
    },
  };
}

/**
 * Display results in human-readable format
 */
function displayResults(
  result: InstructionsGenerateResult,
  dryRun: boolean,
  verbose: boolean
): void {
  const prefix = dryRun ? "Would write" : "Wrote";
  const skipPrefix = dryRun ? "Would skip" : "Skipped";

  // Show generated files
  for (const item of result.generated) {
    const actionLabel = item.action === "created" ? "(new)" : "(updated)";
    output.success(`${prefix} ${item.path} ${actionLabel}`);
  }

  // Show skipped files (only if verbose or no generated files)
  if (verbose || result.generated.length === 0) {
    for (const item of result.skipped) {
      output.info(`${skipPrefix} ${item.path} (${item.reason})`);
    }
  }

  // Show errors
  for (const item of result.errors) {
    output.error(`Failed ${item.path}: ${item.error}`);
  }

  // Summary
  output.info("");
  if (dryRun) {
    output.info(
      `Would generate ${result.summary.generated} file(s), skip ${result.summary.skipped}`
    );
  } else {
    output.info(`Generated ${result.summary.generated} file(s), skipped ${result.summary.skipped}`);
  }

  if (result.summary.errors > 0) {
    output.error(`${result.summary.errors} error(s) occurred`);
  }
}

/**
 * Create an error result for JSON output
 */
function createErrorResult(errorMessage: string): InstructionsGenerateResult {
  return {
    generated: [],
    skipped: [],
    errors: [{ path: "", error: errorMessage }],
    summary: { generated: 0, skipped: 0, errors: 1 },
  };
}
