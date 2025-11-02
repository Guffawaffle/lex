#!/usr/bin/env node
/**
 * LexMap Merge Tool
 *
 * Combines scanner outputs from multiple language scanners into a single unified view.
 *
 * Usage:
 *     node lexmap-merge.ts <scanner1.json> <scanner2.json> ... [-o output.json]
 *     node lexmap-merge.ts scan1.json scan2.json > merged.json
 *     node lexmap-merge.ts scan1.json scan2.json -o merged.json
 *
 * Philosophy:
 *     This tool MERGES scanner outputs, it does NOT enforce policy.
 *     Policy enforcement happens AFTER merge, using lexmap.policy.json.
 *
 * Flow:
 *     1. Read all scanner output JSON files
 *     2. Validate each against expected structure
 *     3. Merge file lists (deduplicating by path)
 *     4. Deduplicate cross-module call edges
 *     5. Aggregate feature flag and permission observations
 *     6. Output unified merged.json
 *
 * Next Step:
 *     Feed merged output to policy checker which:
 *     - Resolves file paths → module_scope (using lexmap.policy.json)
 *     - Checks allowed_callers vs actual imports
 *     - Reports violations
 *
 * Author: LexMap
 * License: MIT
 */

import * as fs from "fs";
import * as path from "path";
import { mergeScans, validateScanOutputs } from "./merge.js";
import type { ScanResult } from "./types.js";

function parseArgs(args: string[]): { inputs: string[]; output?: string } {
  const inputs: string[] = [];
  let output: string | undefined;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      // Next argument is output file
      if (i + 1 >= args.length) {
        console.error(`Error: ${arg} flag requires a filename argument`);
        process.exit(1);
      }
      output = args[i + 1];
      i += 2;
    } else if (arg.startsWith('-')) {
      console.error(`Error: Unknown flag: ${arg}`);
      process.exit(1);
    } else {
      // Input file
      inputs.push(arg);
      i++;
    }
  }

  return { inputs, output };
}

function loadScannerOutput(filePath: string): ScanResult {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const data: ScanResult = JSON.parse(content);

    // Basic validation
    if (!data.language || !Array.isArray(data.files)) {
      console.error(
        `Error: ${filePath} does not conform to expected scanner output format`
      );
      console.error(`Expected: { "language": "...", "files": [...] }`);
      process.exit(1);
    }

    console.error(
      `Loaded scanner output: ${filePath} (${data.language}, ${data.files.length} files)`
    );
    
    return data;
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error loading ${filePath}: ${error.message}`);
    } else {
      console.error(`Error loading ${filePath}:`, error);
    }
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error("Usage: node lexmap-merge.ts <scanner1.json> <scanner2.json> ... [-o output.json]");
    console.error("");
    console.error("Combines scanner outputs from multiple language scanners.");
    console.error("Output format is versioned and includes deduplicated edges.");
    console.error("");
    console.error("Options:");
    console.error("  -o, --output FILE    Write output to FILE instead of stdout");
    console.error("");
    console.error("Examples:");
    console.error("  # Merge to stdout");
    console.error("  node lexmap-merge.ts php.json ts.json > merged.json");
    console.error("");
    console.error("  # Merge to file");
    console.error("  node lexmap-merge.ts php.json ts.json -o merged.json");
    console.error("");
    console.error("  # Full workflow");
    console.error("  python3 php_scanner.py app/ > php.json");
    console.error("  node ts_scanner.ts ui/ > ts.json");
    console.error("  node lexmap-merge.ts php.json ts.json -o merged.json");
    process.exit(1);
  }

  const { inputs, output } = parseArgs(args);

  if (inputs.length === 0) {
    console.error("Error: No input files specified");
    process.exit(1);
  }

  // Load all scanner outputs
  const scannerOutputs: ScanResult[] = [];
  for (const scannerFile of inputs) {
    if (!fs.existsSync(scannerFile)) {
      console.error(`Error: File not found: ${scannerFile}`);
      process.exit(1);
    }
    scannerOutputs.push(loadScannerOutput(scannerFile));
  }

  // Validate scanner outputs
  const validation = validateScanOutputs(scannerOutputs);
  if (!validation.valid) {
    console.error("Error: Invalid scanner outputs:");
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // Merge scanner outputs
  try {
    const merged = mergeScans(scannerOutputs);

    // Output result
    const outputJson = JSON.stringify(merged, null, 2);
    
    if (output) {
      // Write to file
      fs.writeFileSync(output, outputJson, "utf-8");
      console.error(
        `\nMerged ${merged.files.length} files from ${merged.sources.length} scanners → ${output}`
      );
      if (merged.warnings.length > 0) {
        console.error(`\nWarnings:`);
        for (const warning of merged.warnings) {
          console.error(`  - ${warning}`);
        }
      }
    } else {
      // Write to stdout
      console.log(outputJson);
      console.error(
        `\nMerged ${merged.files.length} files from ${merged.sources.length} scanners`
      );
      if (merged.warnings.length > 0) {
        console.error(`\nWarnings:`);
        for (const warning of merged.warnings) {
          console.error(`  - ${warning}`);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError during merge: ${error.message}`);
    } else {
      console.error(`\nError during merge:`, error);
    }
    process.exit(1);
  }
}

main();
