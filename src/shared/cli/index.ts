/**
 * CLI Entry Point - Command Routing and Global Flags
 *
 * Routes commands to appropriate handlers and handles global flags.
 */

import { Command } from "commander";
import { remember, type RememberOptions } from "./remember.js";
import { recall, type RecallOptions } from "./recall.js";
import { check, type CheckOptions } from "./check.js";
import { timeline, type TimelineCommandOptions } from "./timeline.js";
import { init, type InitOptions } from "./init.js";
import { exportFrames, type ExportCommandOptions } from "./export.js";
import {
  dbVacuum,
  dbBackup,
  dbEncrypt,
  type DbVacuumOptions,
  type DbBackupOptions,
  type DbEncryptOptions,
} from "./db.js";
import { policyCheck, type PolicyCheckOptions } from "./policy-check.js";
import { codeAtlas, type CodeAtlasOptions } from "./code-atlas.js";
import * as output from "./output.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
function getVersion(): string {
  try {
    // From dist/shared/cli/index.js, package.json is at ../../../package.json (root)
    const packagePath = join(__dirname, "..", "..", "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
    return packageJson.version;
  } catch {
    return "0.2.0";
  }
}

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("lex")
    .description("Policy-aware work continuity with receipts")
    .version(getVersion())
    .option("--json", "Output results in JSON format");

  // lex init command
  program
    .command("init")
    .description("Initialize .smartergpt/ workspace with prompts and policy")
    .option("--force", "Overwrite existing files")
    .option("--policy", "Generate seed policy from src/ directory structure")
    .option("--prompts-dir <path>", "Custom prompts directory (default: .smartergpt/prompts)")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: InitOptions = {
        force: cmdOptions.force || false,
        policy: cmdOptions.policy || false,
        json: globalOptions.json || false,
        promptsDir: cmdOptions.promptsDir,
      };
      await init(options);
    });

  // lex remember command
  program
    .command("remember")
    .description("Capture a work session Frame")
    .option("--jira <ticket>", "Jira ticket ID")
    .option("--reference-point <phrase>", "Human-memorable anchor phrase")
    .option("--summary <text>", "One-line summary")
    .option("--next <action>", "Next action to take")
    .option("--modules <list>", "Comma-separated module IDs", parseList)
    .option("--blockers <list>", "Comma-separated blockers", parseList)
    .option("--merge-blockers <list>", "Comma-separated merge blockers", parseList)
    .option("--tests-failing <list>", "Comma-separated test names", parseList)
    .option("--keywords <list>", "Comma-separated keywords", parseList)
    .option("--feature-flags <list>", "Comma-separated feature flags", parseList)
    .option("--permissions <list>", "Comma-separated permissions", parseList)
    .option("-i, --interactive", "Interactive mode (prompt for all fields)")
    .option("--strict", "Disable auto-correction for typos (for CI)")
    .option("--no-substring", "Disable substring matching for module IDs (for CI)")
    .option("--skip-policy", "Skip policy validation (allow any module ID)")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: RememberOptions = {
        jira: cmdOptions.jira,
        referencePoint: cmdOptions.referencePoint,
        summary: cmdOptions.summary,
        next: cmdOptions.next,
        modules: cmdOptions.modules,
        blockers: cmdOptions.blockers,
        mergeBlockers: cmdOptions.mergeBlockers,
        testsFailing: cmdOptions.testsFailing,
        keywords: cmdOptions.keywords,
        featureFlags: cmdOptions.featureFlags,
        permissions: cmdOptions.permissions,
        interactive: cmdOptions.interactive || false,
        json: globalOptions.json || false,
        strict: cmdOptions.strict || false,
        noSubstring: cmdOptions.noSubstring || false,
        noPolicy: cmdOptions.skipPolicy || false,
      };
      await remember(options);
    });

  // lex recall command
  program
    .command("recall <query>")
    .description("Retrieve a Frame by reference point, ticket ID, or Frame ID")
    .option("--fold-radius <number>", "Fold radius for Atlas Frame neighborhood", parseInt)
    .option("--auto-radius", "Auto-tune radius based on token limits")
    .option(
      "--max-tokens <number>",
      "Maximum tokens for Atlas Frame (use with --auto-radius)",
      parseInt
    )
    .option("--cache-stats", "Show cache statistics")
    .action(async (query, cmdOptions) => {
      const globalOptions = program.opts();
      const options: RecallOptions = {
        foldRadius: cmdOptions.foldRadius || 1,
        autoRadius: cmdOptions.autoRadius || false,
        maxTokens: cmdOptions.maxTokens,
        showCacheStats: cmdOptions.cacheStats || false,
        json: globalOptions.json || false,
      };

      // Validate auto-radius options
      if (options.autoRadius && !options.maxTokens) {
        output.error("Error: --auto-radius requires --max-tokens to be specified");
        process.exit(1);
      }

      await recall(query, options);
    });

  // lex check command
  program
    .command("check <merged-json> <policy-json>")
    .description("Enforce policy against scanned code")
    .option("--ticket <id>", "Ticket ID for context")
    .action(async (mergedJson, policyJson, cmdOptions) => {
      const globalOptions = program.opts();
      const options: CheckOptions = {
        ticket: cmdOptions.ticket,
        json: globalOptions.json || false,
      };
      await check(mergedJson, policyJson, options);
    });

  // lex timeline command
  program
    .command("timeline <ticket-or-branch>")
    .description("Show visual timeline of Frame evolution for a ticket or branch")
    .option("--since <date>", "Filter frames since this date (ISO 8601)")
    .option("--until <date>", "Filter frames until this date (ISO 8601)")
    .option("--format <type>", "Output format: text, json, or html", /^(text|json|html)$/, "text")
    .option("--output <file>", "Write output to file instead of stdout")
    .action(async (ticketOrBranch, cmdOptions) => {
      const globalOptions = program.opts();
      const options: TimelineCommandOptions = {
        since: cmdOptions.since,
        until: cmdOptions.until,
        format: cmdOptions.format,
        output: cmdOptions.output,
        json: globalOptions.json || false,
      };
      await timeline(ticketOrBranch, options);
    });

  // lex frames command group
  const framesCommand = program.command("frames").description("Frame database operations");

  // lex frames export command
  framesCommand
    .command("export")
    .description("Export frames from database to JSON files")
    .option("--out <dir>", "Output directory (default: .smartergpt/lex/frames.export)")
    .option(
      "--since <date|duration>",
      "Export frames since date or duration (e.g., 7d, 2025-01-01)"
    )
    .option("--jira <ticket>", "Export frames for specific Jira ticket")
    .option("--branch <name>", "Export frames for specific branch")
    .option("--format <type>", "Output format: json or ndjson", /^(json|ndjson)$/, "json")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: ExportCommandOptions = {
        out: cmdOptions.out,
        since: cmdOptions.since,
        jira: cmdOptions.jira,
        branch: cmdOptions.branch,
        format: cmdOptions.format,
        json: globalOptions.json || false,
      };
      await exportFrames(options);
    });

  // lex db command group
  const dbCommand = program.command("db").description("Database maintenance commands");

  // lex db vacuum
  dbCommand
    .command("vacuum")
    .description("Optimize database (rebuild and compact)")
    .action(async () => {
      const globalOptions = program.opts();
      const options: DbVacuumOptions = {
        json: globalOptions.json || false,
      };
      await dbVacuum(options);
    });

  // lex db backup
  dbCommand
    .command("backup")
    .description("Create timestamped database backup")
    .option("--rotate <n>", "Keep N most recent backups (0 = no rotation)", parseInt)
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: DbBackupOptions = {
        rotate: cmdOptions.rotate,
        json: globalOptions.json || false,
      };
      await dbBackup(options);
    });

  // lex db encrypt
  dbCommand
    .command("encrypt")
    .description(
      "Encrypt existing database with SQLCipher (passphrase must be provided via LEX_DB_KEY environment variable)"
    )
    .option("--input <path>", "Input database file (default: current database)")
    .option("--output <path>", "Output encrypted database file (default: input-encrypted.db)")
    .option("--verify", "Verify data integrity after encryption")
    .option("--no-backup", "Skip creating a backup before encryption")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: DbEncryptOptions = {
        input: cmdOptions.input,
        output: cmdOptions.output,
        verify: cmdOptions.verify || false,
        json: globalOptions.json || false,
        backup: cmdOptions.backup,
      };
      await dbEncrypt(options);
    });

  // lex policy command group
  const policyCommand = program.command("policy").description("Policy file operations");

  // lex policy check
  policyCommand
    .command("check")
    .description("Validate policy file syntax and optionally verify module-codebase mapping")
    .option("--match", "Verify modules match codebase structure")
    .option("--policy <path>", "Custom policy file path")
    .option("--src-dir <dir>", "Source directory for --match (default: src)")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: PolicyCheckOptions = {
        json: globalOptions.json || false,
        match: cmdOptions.match || false,
        policyPath: cmdOptions.policy,
        srcDir: cmdOptions.srcDir,
      };
      await policyCheck(options);
    });

  // lex code-atlas command
  program
    .command("code-atlas")
    .description("Extract code units from repository using static analysis")
    .option("--repo <path>", "Repository root (default: current directory)")
    .option("--include <pattern>", "Glob pattern for files (default: **/*.{ts,tsx,js,jsx,py})")
    .option("--exclude <pattern>", "Exclude pattern (default: **/node_modules/**)")
    .option("--max-files <n>", "Limit files scanned (default: 500)", parseInt)
    .option("--out <path>", "Output file path (default: stdout)")
    .option(
      "--strategy <type>",
      "Extraction strategy: static (default)",
      /^(static|llm-assisted|mixed)$/,
      "static"
    )
    .option(
      "--policy-seed <path>",
      "Generate policy seed file from detected modules (YAML format)"
    )
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: CodeAtlasOptions = {
        repo: cmdOptions.repo,
        include: cmdOptions.include,
        exclude: cmdOptions.exclude,
        maxFiles: cmdOptions.maxFiles,
        out: cmdOptions.out,
        strategy: cmdOptions.strategy,
        json: globalOptions.json || false,
        policySeed: cmdOptions.policySeed,
      };
      await codeAtlas(options);
    });

  return program;
}

/**
 * Parse comma-separated list
 */
function parseList(value: string): string[] | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Run the CLI program
 */
export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
