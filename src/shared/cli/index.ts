/**
 * CLI Entry Point - Command Routing and Global Flags
 *
 * Routes commands to appropriate handlers and handles global flags.
 */

import { Command } from "commander";
import { remember, type RememberOptions } from "./remember.js";
import { recall, type RecallOptions } from "./recall.js";
import { check, type CheckOptions } from "./check.js";
import { checkContradictions, type CheckContradictionsOptions } from "./check-contradictions.js";
import { timeline, type TimelineCommandOptions } from "./timeline.js";
import { init, type InitOptions } from "./init.js";
import { exportFrames, type ExportCommandOptions } from "./export.js";
import { importFrames, type ImportCommandOptions } from "./import.js";
import {
  dbVacuum,
  dbBackup,
  dbEncrypt,
  dbStats,
  type DbVacuumOptions,
  type DbBackupOptions,
  type DbEncryptOptions,
  type DbStatsOptions,
} from "./db.js";
import { policyCheck, type PolicyCheckOptions } from "./policy-check.js";
import { policyAddModule, type PolicyAddModuleOptions } from "./policy-add-module.js";
import { codeAtlas, type CodeAtlasOptions } from "./code-atlas.js";
import {
  instructionsInit,
  instructionsGenerate,
  instructionsCheck,
  type InstructionsInitOptions,
  type InstructionsGenerateOptions,
  type InstructionsCheckOptions,
} from "./instructions.js";
import { turncost, type TurnCostOptions } from "./turncost.js";
import { dedupe, type DedupeOptions } from "./dedupe.js";
import { epicSync, type EpicSyncOptions } from "./epic.js";
import { waveComplete, type WaveCompleteOptions } from "./wave.js";
import { introspect, type IntrospectOptions } from "./introspect.js";
import { hints, type HintsOptions } from "./hints.js";
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
    .option("--json", "Output results in JSON format")
    .option("--verbose", "Enable diagnostic logging (Pino logs)");

  // lex init command
  program
    .command("init")
    .description("Initialize .smartergpt/ workspace with prompts, policy, and instructions")
    .option("--force", "Overwrite existing files")
    .option("--policy", "Generate seed policy from src/ directory structure")
    .option("--prompts-dir <path>", "Custom prompts directory (default: .smartergpt/prompts)")
    .option("--no-instructions", "Skip creating canonical instructions file")
    .option("--mcp", "Generate .vscode/mcp.json for MCP server configuration")
    .option("-y, --yes", "Non-interactive mode (skip prompts)")
    .option("-i, --interactive", "Interactive mode (prompt for first frame)")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: InitOptions = {
        force: cmdOptions.force || false,
        policy: cmdOptions.policy || false,
        json: globalOptions.json || false,
        promptsDir: cmdOptions.promptsDir,
        instructions: cmdOptions.instructions,
        mcp: cmdOptions.mcp || false,
        yes: cmdOptions.yes || false,
        interactive: cmdOptions.interactive || false,
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
    .option("--dry-run", "Validate frame without storing (matches frame_validate MCP tool)")
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
        dryRun: cmdOptions.dryRun || false,
      };
      await remember(options);
    });

  // lex recall command
  program
    .command("recall [query]")
    .description(
      "Retrieve a Frame by reference point, ticket ID, or Frame ID, or list recent frames"
    )
    .option("-q, --query <text>", "Search query (alternative to positional argument)")
    .option("--list [limit]", "List recent frames (optionally limit to N results)", parseInt)
    .option("--fold-radius <number>", "Fold radius for Atlas Frame neighborhood", parseInt)
    .option("--auto-radius", "Auto-tune radius based on token limits")
    .option(
      "--max-tokens <number>",
      "Maximum tokens for Atlas Frame (use with --auto-radius)",
      parseInt
    )
    .option("--cache-stats", "Show cache statistics")
    .option("--exact", "Disable fuzzy matching (prefix wildcards)")
    .option(
      "--mode <type>",
      "Search mode: 'all' (AND - all terms must match, default) or 'any' (OR - any term can match)",
      /^(all|any)$/,
      "all"
    )
    .option("--strict", "Exit with code 1 when no frames found (for CI/scripts)")
    .option("--summary", "Enable compact format mode for small-context agents")
    .option(
      "--format <type>",
      "Output format: json, prose (narrative), or default (pretty print)",
      /^(json|prose|default)$/,
      undefined
    )
    .action(async (query, cmdOptions) => {
      const globalOptions = program.opts();
      // Support both positional argument and --query option
      const searchQuery = query || cmdOptions.query;
      const options: RecallOptions = {
        list: cmdOptions.list,
        foldRadius: cmdOptions.foldRadius || 1,
        autoRadius: cmdOptions.autoRadius || false,
        maxTokens: cmdOptions.maxTokens,
        showCacheStats: cmdOptions.cacheStats || false,
        exact: cmdOptions.exact || false,
        mode: cmdOptions.mode || "all",
        strict: cmdOptions.strict || false,
        json: globalOptions.json || false,
        summary: cmdOptions.summary || false,
        format: cmdOptions.format,
      };

      // Validate auto-radius options
      if (options.autoRadius && !options.maxTokens) {
        output.error("Error: --auto-radius requires --max-tokens to be specified");
        process.exit(1);
      }

      // Validate that either query or --list is provided
      if (!searchQuery && options.list === undefined) {
        output.error(
          "\n❌ Error: Either provide a search query or use --list to browse recent frames\n"
        );
        process.exit(1);
      }

      await recall(searchQuery, options);
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

  // lex frames import command
  framesCommand
    .command("import")
    .description("Import frames from JSON files for backup recovery and migration")
    .option("--from-dir <path>", "Import all JSON files from directory")
    .option("--from-file <path>", "Import single JSON file (array of Frames)")
    .option("--dry-run", "Validate without writing to database")
    .option("--skip-duplicates", "Skip frames with existing IDs")
    .option("--merge", "Update existing frames with new data")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: ImportCommandOptions = {
        fromDir: cmdOptions.fromDir,
        fromFile: cmdOptions.fromFile,
        dryRun: cmdOptions.dryRun || false,
        skipDuplicates: cmdOptions.skipDuplicates || false,
        merge: cmdOptions.merge || false,
        json: globalOptions.json || false,
      };
      await importFrames(options);
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
    .option(
      "--batch-size <n>",
      "Number of rows per batch/transaction (reduces memory usage)",
      parseInt
    )
    .option("--dry-run", "Estimate migration time and rows without writing")
    .option("--progress", "Show progress indicator during migration")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: DbEncryptOptions = {
        input: cmdOptions.input,
        output: cmdOptions.output,
        verify: cmdOptions.verify || false,
        json: globalOptions.json || false,
        backup: cmdOptions.backup,
        batchSize: cmdOptions.batchSize,
        dryRun: cmdOptions.dryRun || false,
        progress: cmdOptions.progress || false,
      };
      await dbEncrypt(options);
    });

  // lex db stats
  dbCommand
    .command("stats")
    .description("Show database statistics and health information")
    .option("--detailed", "Include full module breakdown")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: DbStatsOptions = {
        json: globalOptions.json || false,
        detailed: cmdOptions.detailed || false,
      };
      await dbStats(options);
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

  // lex policy add-module
  policyCommand
    .command("add-module <moduleId>")
    .description("Add a new module to the policy file")
    .option("--policy <path>", "Custom policy file path")
    .action(async (moduleId, cmdOptions) => {
      const globalOptions = program.opts();
      const options: PolicyAddModuleOptions = {
        json: globalOptions.json || false,
        policyPath: cmdOptions.policy,
      };
      await policyAddModule(moduleId, options);
    });

  // lex instructions command group
  const instructionsCommand = program
    .command("instructions")
    .description("Manage AI assistant instructions");

  // lex instructions init
  instructionsCommand
    .command("init")
    .description("Scaffold canonical source file, lex.yaml, and target files")
    .option("--project-root <path>", "Project root directory")
    .option("--force", "Overwrite existing files")
    .option("--targets <hosts>", "Comma-separated host targets (default: copilot,cursor)")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: InstructionsInitOptions = {
        projectRoot: cmdOptions.projectRoot,
        force: cmdOptions.force || false,
        targets: cmdOptions.targets,
        json: globalOptions.json || false,
      };
      await instructionsInit(options);
    });

  // lex instructions generate
  instructionsCommand
    .command("generate")
    .description("Generate host-specific instruction projections from canonical source")
    .option("--project-root <path>", "Project root directory")
    .option("--config <path>", "Path to lex.yaml config")
    .option("--dry-run", "Preview changes without writing")
    .option("--verbose", "Show detailed output")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: InstructionsGenerateOptions = {
        projectRoot: cmdOptions.projectRoot,
        config: cmdOptions.config,
        dryRun: cmdOptions.dryRun || false,
        verbose: cmdOptions.verbose || globalOptions.verbose || false,
        json: globalOptions.json || false,
      };
      await instructionsGenerate(options);
    });

  // lex instructions check
  instructionsCommand
    .command("check")
    .description("Verify instruction files are in sync with canonical source")
    .option("--project-root <path>", "Project root directory")
    .option("--config <path>", "Path to lex.yaml config")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: InstructionsCheckOptions = {
        projectRoot: cmdOptions.projectRoot,
        config: cmdOptions.config,
        json: globalOptions.json || false,
      };
      await instructionsCheck(options);
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
    .option("--policy-seed <path>", "Generate policy seed file from detected modules (YAML format)")
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

  // lex turncost command
  program
    .command("turncost")
    .description("Measure and analyze Turn Cost metrics (governance coordination cost)")
    .option("--period <duration>", "Time period for metrics (e.g., 24h, 7d, 30d)", "24h")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: TurnCostOptions = {
        json: globalOptions.json || false,
        period: cmdOptions.period,
      };
      await turncost(options);
    });

  // lex dedupe command
  program
    .command("dedupe")
    .description("Detect and consolidate duplicate frames based on similarity scoring")
    .option("--dry-run", "Show what would be consolidated without making changes")
    .option("--threshold <number>", "Similarity threshold (0.0-1.0, default: 0.85)", parseFloat)
    .option("--auto", "Automatically consolidate duplicates without prompting")
    .option("--show-candidates", "Show duplicate candidates")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: DedupeOptions = {
        dryRun: cmdOptions.dryRun || false,
        threshold: cmdOptions.threshold,
        auto: cmdOptions.auto || false,
        showCandidates: cmdOptions.showCandidates || false,
        json: globalOptions.json || false,
      };
      await dedupe(options);
    });

  // lex check contradictions command
  program
    .command("check-contradictions")
    .description("Scan all frames for contradictions")
    .option("--module <id>", "Filter by module ID")
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: CheckContradictionsOptions = {
        module: cmdOptions.module,
        json: globalOptions.json || false,
      };
      await checkContradictions(options);
    });

  // lex epic command group
  const epicCommand = program.command("epic").description("Epic/tracking issue operations");

  // lex epic sync
  epicCommand
    .command("sync <epic-ref>")
    .description("Sync epic status with actual sub-issue states (e.g., lexrunner#653)")
    .action(async (epicRef, _cmdOptions) => {
      const globalOptions = program.opts();
      const options: EpicSyncOptions = {
        json: globalOptions.json || false,
      };
      await epicSync(epicRef, options);
    });

  // lex wave command group
  const waveCommand = program.command("wave").description("Wave management operations");

  // lex wave complete command
  waveCommand
    .command("complete")
    .description("Emit wave completion frame with aggregated metrics")
    .option("--epic <ref>", "Epic issue reference (e.g., lexrunner#653)")
    .option("--wave <id>", "Wave identifier (e.g., 2 or wave-2)")
    .option("--epic-labels <labels>", "Comma-separated epic labels for keywords", parseList)
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: WaveCompleteOptions = {
        epic: cmdOptions.epic,
        wave: cmdOptions.wave,
        epicLabels: cmdOptions.epicLabels,
        json: globalOptions.json || false,
      };
      await waveComplete(options);
    });

  // lex introspect command
  program
    .command("introspect")
    .description("Discover current Lex state, policy, capabilities, and error codes")
    .option(
      "--format <type>",
      "Output format: full (default) or compact",
      /^(full|compact)$/,
      "full"
    )
    .action(async (cmdOptions) => {
      const globalOptions = program.opts();
      const options: IntrospectOptions = {
        json: globalOptions.json || false,
        format: cmdOptions.format,
      };
      await introspect(options);
    });

  // lex hints command
  program
    .command("hints [ids...]")
    .description("Retrieve hint details by hint ID (stable advice for error recovery)")
    .option("--list", "List all available hint IDs")
    .action(async (hintIds: string[], cmdOptions) => {
      const globalOptions = program.opts();
      const options: HintsOptions = {
        json: globalOptions.json || false,
        list: cmdOptions.list || false,
      };
      await hints(hintIds || [], options);
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

// Direct execution detection - guide users to correct entry point
// This module is a library; use lex.js for CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  output.error("This is the library module, not the CLI entry point.");
  output.info("Use: node dist/shared/cli/lex.js <command>");
  output.info("Or:  npx lex <command>");
  process.exit(1);
}
