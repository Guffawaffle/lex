/**
 * CLI Commands: lex instructions init / generate / check
 *
 * Scaffolds, generates, and validates host-specific instruction projections from the canonical source file.
 *
 * Usage:
 *   lex instructions init                        # Scaffold canonical source + lex.yaml + targets
 *   lex instructions init --force                # Overwrite existing files
 *   lex instructions init --targets copilot      # Only configure specific hosts
 *
 *   lex instructions generate                    # Generate all projections
 *   lex instructions generate --dry-run          # Preview changes
 *   lex instructions generate --json             # Output as JSON
 *   lex instructions generate --verbose          # Show detailed progress
 *   lex instructions generate --project-root .   # Custom project root
 *
 *   lex instructions check                       # Verify projections are in sync
 *   lex instructions check --json                # Output results as JSON
 */

import * as fs from "node:fs";
import * as path from "node:path";
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
import { wrapWithMarkers } from "../instructions/markers.js";
import * as output from "./output.js";

/**
 * Supported host targets for instructions init
 */
export type InstructionsHostTarget = "copilot" | "cursor";

/**
 * Options for the instructions init command
 */
export interface InstructionsInitOptions {
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
  /** Overwrite existing files */
  force?: boolean;
  /** Comma-separated host targets (default: "copilot,cursor") */
  targets?: string;
  /** Output results as JSON */
  json?: boolean;
}

/**
 * Result of initializing instructions (for JSON output)
 */
export interface InstructionsInitResult {
  success: boolean;
  created: string[];
  skipped: string[];
  errors: Array<{ path: string; error: string }>;
  nextSteps: string[];
}

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
 * Execute the 'lex instructions init' command
 *
 * Creates the canonical source file, lex.yaml configuration, and target files
 * with LEX markers for the specified hosts.
 *
 * @param options - Command options
 */
export async function instructionsInit(options: InstructionsInitOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const force = options.force ?? false;

  // Parse targets
  const targetStr = options.targets ?? "copilot,cursor";
  const targets = targetStr
    .split(",")
    .map((t) => t.trim().toLowerCase()) as InstructionsHostTarget[];
  const validTargets: InstructionsHostTarget[] = ["copilot", "cursor"];
  const invalidTargets = targets.filter((t) => !validTargets.includes(t));

  if (invalidTargets.length > 0) {
    const errorMsg = `Invalid target(s): ${invalidTargets.join(", ")}. Valid targets: ${validTargets.join(", ")}`;
    if (options.json) {
      output.json({
        success: false,
        created: [],
        skipped: [],
        errors: [{ path: "", error: errorMsg }],
        nextSteps: [],
      } as InstructionsInitResult);
    } else {
      output.error(errorMsg);
    }
    process.exit(1);
  }

  const result: InstructionsInitResult = {
    success: true,
    created: [],
    skipped: [],
    errors: [],
    nextSteps: [],
  };

  try {
    // Define paths
    const canonicalPath = path.join(projectRoot, ".smartergpt", "instructions", "lex.md");
    const lexYamlPath = path.join(projectRoot, "lex.yaml");

    // Check existing files
    const canonicalExists = fs.existsSync(canonicalPath);
    const lexYamlExists = fs.existsSync(lexYamlPath);

    // Check if we should abort
    if (!force) {
      if (canonicalExists) {
        result.skipped.push(canonicalPath);
      }
      if (lexYamlExists) {
        result.skipped.push(lexYamlPath);
      }

      if (canonicalExists || lexYamlExists) {
        const msg = "Files already exist. Use --force to overwrite.";
        if (options.json) {
          result.success = false;
          result.errors.push({ path: "", error: msg });
          output.json(result);
        } else {
          output.error(msg);
          for (const skipped of result.skipped) {
            output.info(`  - ${path.relative(projectRoot, skipped)}`);
          }
        }
        process.exit(1);
      }
    }

    // Create canonical source directory and file
    const canonicalDir = path.dirname(canonicalPath);
    fs.mkdirSync(canonicalDir, { recursive: true });

    const canonicalTemplate = getCanonicalTemplate();
    fs.writeFileSync(canonicalPath, canonicalTemplate, "utf8");
    result.created.push(path.relative(projectRoot, canonicalPath));

    // Create lex.yaml
    const lexYamlContent = getLexYamlTemplate(targets);
    fs.writeFileSync(lexYamlPath, lexYamlContent, "utf8");
    result.created.push(path.relative(projectRoot, lexYamlPath));

    // Create target files with LEX markers
    const targetPaths = getTargetPaths(projectRoot, targets);
    for (const { host, targetPath } of targetPaths) {
      const targetExists = fs.existsSync(targetPath);

      if (targetExists && !force) {
        result.skipped.push(path.relative(projectRoot, targetPath));
        continue;
      }

      // Create directory if needed
      const targetDir = path.dirname(targetPath);
      fs.mkdirSync(targetDir, { recursive: true });

      // Create file with placeholder LEX markers
      const placeholderContent = getTargetPlaceholder(host);
      const wrappedContent = wrapWithMarkers(placeholderContent);
      fs.writeFileSync(targetPath, wrappedContent, "utf8");
      result.created.push(path.relative(projectRoot, targetPath));
    }

    // Set next steps
    result.nextSteps = [
      `Edit ${path.relative(projectRoot, canonicalPath)} with your project instructions`,
      "Run 'lex instructions generate' to update target files",
    ];

    // Output
    if (options.json) {
      output.json(result);
    } else {
      displayInitResults(result, projectRoot);
    }

    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (options.json) {
      result.success = false;
      result.errors.push({ path: "", error: errorMsg });
      output.json(result);
    } else {
      output.error(`Failed to initialize instructions: ${errorMsg}`);
    }
    process.exit(1);
  }
}

/**
 * Get the canonical source template content
 */
function getCanonicalTemplate(): string {
  return `# Project Instructions

> **This file is the canonical source of AI assistant guidance for this repository.**
> Content from here is projected to host files (e.g., \`.github/copilot-instructions.md\`).

## Overview

[Describe your project and key conventions here]

## Key Files

| File | Purpose |
|------|---------|
| \`src/\` | Source code |
| \`test/\` | Test files |

## Coding Style

- [Add your coding conventions]

---

*Generated by \`lex instructions init\`. Edit this file, then run \`lex instructions generate\`.*
`;
}

/**
 * Get the lex.yaml template content
 */
function getLexYamlTemplate(targets: InstructionsHostTarget[]): string {
  const projectionsLines = targets.map((t) => `    ${t}: true`).join("\n");
  return `# Lex Configuration
# See: https://github.com/Guffawaffle/lex

version: 1

instructions:
  # Canonical source of AI instructions
  canonical: .smartergpt/instructions/lex.md

  # Which hosts to project to (auto-detected if omitted)
  projections:
${projectionsLines}
`;
}

/**
 * Get target file paths for specified hosts
 */
function getTargetPaths(
  projectRoot: string,
  targets: InstructionsHostTarget[]
): Array<{ host: InstructionsHostTarget; targetPath: string }> {
  const paths: Array<{ host: InstructionsHostTarget; targetPath: string }> = [];

  if (targets.includes("copilot")) {
    paths.push({
      host: "copilot",
      targetPath: path.join(projectRoot, ".github", "copilot-instructions.md"),
    });
  }

  if (targets.includes("cursor")) {
    paths.push({
      host: "cursor",
      targetPath: path.join(projectRoot, ".cursorrules"),
    });
  }

  return paths;
}

/**
 * Get placeholder content for a target file
 */
function getTargetPlaceholder(_host: InstructionsHostTarget): string {
  return `# Lex Instructions

This content is auto-generated from the canonical source.
Run \`lex instructions generate\` to update.
`;
}

/**
 * Display init results in human-readable format
 */
function displayInitResults(result: InstructionsInitResult, _projectRoot: string): void {
  for (const created of result.created) {
    output.success(`✓ Created ${created}`);
  }

  for (const skipped of result.skipped) {
    output.warn(`- Skipped ${skipped} (already exists)`);
  }

  for (const err of result.errors) {
    output.error(`✗ ${err.path}: ${err.error}`);
  }

  output.info("");
  output.info("Next steps:");
  for (let i = 0; i < result.nextSteps.length; i++) {
    output.info(`  ${i + 1}. ${result.nextSteps[i]}`);
  }
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

/**
 * Options for the instructions check command
 */
export interface InstructionsCheckOptions {
  /** Project root directory (default: process.cwd()) */
  projectRoot?: string;
  /** Path to lex.yaml config file */
  config?: string;
  /** Output results as JSON */
  json?: boolean;
}

/**
 * Result of checking instructions (for JSON output)
 */
export interface InstructionsCheckResult {
  inSync: Array<{ path: string }>;
  outOfSync: Array<{ path: string; reason: string }>;
  errors: Array<{ path: string; error: string }>;
  summary: {
    inSync: number;
    outOfSync: number;
    errors: number;
    total: number;
  };
}

/**
 * Execute the 'lex instructions check' command
 *
 * Validates that host-specific instruction files are in sync with the canonical source.
 * Exits with code 1 if any files are out of sync.
 *
 * @param options - Command options
 */
export async function instructionsCheck(options: InstructionsCheckOptions = {}): Promise<void> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  try {
    // Load config
    const configResult = loadLexYaml(projectRoot);
    if (!configResult.success || !configResult.config) {
      const errorMsg = configResult.error ?? "Failed to load lex.yaml configuration";
      if (options.json) {
        output.json(createCheckErrorResult(errorMsg));
      } else {
        output.error(errorMsg);
      }
      process.exit(1);
    }

    // Load canonical instructions
    const canonical = loadCanonicalInstructions(projectRoot, configResult.config);
    if (!canonical.exists) {
      const errorMsg = `Canonical instruction file not found: ${canonical.path}`;
      if (options.json) {
        output.json(createCheckErrorResult(errorMsg));
      } else {
        output.error(errorMsg);
        output.info(
          `Create the file at: ${configResult.config.instructions?.canonical ?? ".smartergpt/instructions/lex.md"}`
        );
      }
      process.exit(1);
    }

    // Detect available hosts
    const hosts = detectAvailableHosts(projectRoot);

    // Generate expected projections (without writing)
    const projections = generateProjections({
      canonical,
      hosts,
      config: configResult.config,
      readFile: defaultFileReader,
    });

    // Check each projection
    const result: InstructionsCheckResult = {
      inSync: [],
      outOfSync: [],
      errors: [],
      summary: { inSync: 0, outOfSync: 0, errors: 0, total: 0 },
    };

    for (const projection of projections) {
      result.summary.total++;

      if (projection.action === "skip") {
        // Content matches - in sync
        result.inSync.push({ path: projection.path });
        result.summary.inSync++;
      } else if (projection.action === "create") {
        // File doesn't exist - out of sync
        result.outOfSync.push({ path: projection.path, reason: "file does not exist" });
        result.summary.outOfSync++;
      } else if (projection.action === "update") {
        // Content differs - out of sync
        result.outOfSync.push({ path: projection.path, reason: "content differs" });
        result.summary.outOfSync++;
      }
    }

    // Output
    if (options.json) {
      output.json(result);
    } else {
      displayCheckResults(result);
    }

    // Exit with code 1 if any files are out of sync
    process.exit(result.summary.outOfSync > 0 || result.summary.errors > 0 ? 1 : 0);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (options.json) {
      output.json(createCheckErrorResult(errorMsg));
    } else {
      output.error(`Failed to check instructions: ${errorMsg}`);
    }
    process.exit(1);
  }
}

/**
 * Display check results in human-readable format
 */
function displayCheckResults(result: InstructionsCheckResult): void {
  // Show in-sync files
  for (const item of result.inSync) {
    output.success(`✓ ${item.path} is in sync`);
  }

  // Show out-of-sync files
  for (const item of result.outOfSync) {
    output.error(`✗ ${item.path} is OUT OF SYNC (${item.reason})`);
  }

  // Show errors
  for (const item of result.errors) {
    output.error(`! ${item.path}: ${item.error}`);
  }

  // Summary
  output.info("");
  if (result.summary.outOfSync === 0 && result.summary.errors === 0) {
    output.success(`All ${result.summary.total} file(s) are in sync.`);
  } else {
    output.error(
      `${result.summary.outOfSync} file(s) out of sync. Run 'lex instructions generate' to fix.`
    );
  }
}

/**
 * Create an error result for check JSON output
 */
function createCheckErrorResult(errorMessage: string): InstructionsCheckResult {
  return {
    inSync: [],
    outOfSync: [],
    errors: [{ path: "", error: errorMessage }],
    summary: { inSync: 0, outOfSync: 0, errors: 1, total: 0 },
  };
}
