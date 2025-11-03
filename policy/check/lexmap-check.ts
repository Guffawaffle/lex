#!/usr/bin/env node
/**
 * LexMap Policy Checker
 *
 * Enforces architectural policy by checking scanner output against lexmap.policy.json.
 *
 * Usage:
 *     lexmap check <merged.json> <policy.json> [options]
 *
 * Options:
 *     --strict              Fail on any violation (same as default)
 *     --report-format       Output format: text, json, or markdown (default: text)
 *     --ticket              Optional ticket number for tracking
 *
 * What it does:
 *     1. Loads merged scanner output (from lexmap merge)
 *     2. Loads policy file (lexmap.policy.json)
 *     3. For each file:
 *        - Resolves file path → module_scope using owns_paths
 *        - Checks imports against allowed_callers/forbidden_callers
 *        - Detects feature flag violations
 *        - Detects permission violations
 *        - Detects kill_patterns in code
 *     4. Reports violations with Atlas Frame context
 *
 * Exit codes:
 *     0 - No violations
 *     1 - Violations found
 *     2 - Error (file not found, schema invalid, etc.)
 *
 * Example:
 *     lexmap check merged.json lexmap.policy.json
 *     lexmap check merged.json lexmap.policy.json --report-format markdown
 *     lexmap check merged.json lexmap.policy.json --strict
 *
 * Author: LexMap
 * License: MIT
 */

import * as fs from "fs";
import { Policy } from "@lex/types/policy";
import { MergedScanResult } from "@lex/merge/types";
import { detectViolations } from "./violations.js";
import { printReport, getExitCode, ReportFormat } from "./reporter.js";

/**
 * Parse command line arguments
 */
interface CliArgs {
  scannerFile: string;
  policyFile: string;
  strict: boolean;
  reportFormat: ReportFormat;
  ticket?: string;
}

function parseArgs(): CliArgs | null {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    return null;
  }

  const scannerFile = args[0];
  const policyFile = args[1];
  
  let strict = false;
  let reportFormat: ReportFormat = 'text';
  let ticket: string | undefined;

  // Parse optional flags
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--strict') {
      strict = true;
    } else if (arg === '--report-format' && i + 1 < args.length) {
      const format = args[i + 1];
      if (format === 'text' || format === 'json' || format === 'markdown') {
        reportFormat = format;
        i++; // Skip next arg
      } else {
        console.error(`Error: Invalid report format '${format}'. Use: text, json, or markdown`);
        return null;
      }
    } else if (arg === '--ticket' && i + 1 < args.length) {
      ticket = args[i + 1];
      i++; // Skip next arg
    }
  }

  return {
    scannerFile,
    policyFile,
    strict,
    reportFormat,
    ticket,
  };
}

function printUsage(): void {
  console.error("Usage: lexmap check <merged.json> <policy.json> [options]");
  console.error("");
  console.error("Options:");
  console.error("  --strict              Fail on any violation (default behavior)");
  console.error("  --report-format FMT   Output format: text, json, or markdown (default: text)");
  console.error("  --ticket TICKET       Optional ticket number for tracking");
  console.error("");
  console.error("Checks scanner output against architectural policy.");
  console.error("");
  console.error("Examples:");
  console.error("  lexmap check merged.json lexmap.policy.json");
  console.error("  lexmap check merged.json lexmap.policy.json --report-format markdown");
  console.error("  lexmap check merged.json lexmap.policy.json --ticket WEB-23621");
}

function main() {
  const cliArgs = parseArgs();

  if (!cliArgs) {
    printUsage();
    process.exit(2);
  }

  const { scannerFile, policyFile, reportFormat, ticket } = cliArgs;

  // Validate file existence
  if (!fs.existsSync(scannerFile)) {
    console.error(`Error: Scanner output not found: ${scannerFile}`);
    process.exit(2);
  }

  if (!fs.existsSync(policyFile)) {
    console.error(`Error: Policy file not found: ${policyFile}`);
    process.exit(2);
  }

  try {
    // Load scanner output
    const scannerContent = fs.readFileSync(scannerFile, "utf-8");
    const scannerOutput: MergedScanResult = JSON.parse(scannerContent);

    // Load policy
    const policyContent = fs.readFileSync(policyFile, "utf-8");
    const policy: Policy = JSON.parse(policyContent);

    // Detect violations
    const violations = detectViolations(scannerOutput, policy);

    // Print report
    printReport(violations, policy, reportFormat);

    // Exit with appropriate code
    const exitCode = getExitCode(violations);
    process.exit(exitCode);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

main();
