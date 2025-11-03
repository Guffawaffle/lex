/**
 * CLI Entry Point - Command Routing and Global Flags
 * 
 * Routes commands to appropriate handlers and handles global flags.
 */

import { Command } from 'commander';
import { remember, type RememberOptions } from './remember.js';
import { recall, type RecallOptions } from './recall.js';
import { check, type CheckOptions } from './check.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
function getVersion(): string {
  try {
    // From dist/shared/cli/index.js, package.json is at ../../../package.json (root)
    const packagePath = join(__dirname, '..', '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version;
  } catch {
    return '0.2.0';
  }
}

/**
 * Create and configure the CLI program
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('lex')
    .description('Policy-aware work continuity with receipts')
    .version(getVersion())
    .option('--json', 'Output results in JSON format');

  // lex remember command
  program
    .command('remember')
    .description('Capture a work session Frame')
    .option('--jira <ticket>', 'Jira ticket ID')
    .option('--reference-point <phrase>', 'Human-memorable anchor phrase')
    .option('--summary <text>', 'One-line summary')
    .option('--next <action>', 'Next action to take')
    .option('--modules <list>', 'Comma-separated module IDs', parseList)
    .option('--blockers <list>', 'Comma-separated blockers', parseList)
    .option('--merge-blockers <list>', 'Comma-separated merge blockers', parseList)
    .option('--tests-failing <list>', 'Comma-separated test names', parseList)
    .option('--keywords <list>', 'Comma-separated keywords', parseList)
    .option('--feature-flags <list>', 'Comma-separated feature flags', parseList)
    .option('--permissions <list>', 'Comma-separated permissions', parseList)
    .option('-i, --interactive', 'Interactive mode (prompt for all fields)')
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
      };
      await remember(options);
    });

  // lex recall command
  program
    .command('recall <query>')
    .description('Retrieve a Frame by reference point, ticket ID, or Frame ID')
    .option('--fold-radius <number>', 'Fold radius for Atlas Frame neighborhood', parseInt)
    .action(async (query, cmdOptions) => {
      const globalOptions = program.opts();
      const options: RecallOptions = {
        foldRadius: cmdOptions.foldRadius || 1,
        json: globalOptions.json || false,
      };
      await recall(query, options);
    });

  // lex check command
  program
    .command('check <merged-json> <policy-json>')
    .description('Enforce policy against scanned code')
    .option('--ticket <id>', 'Ticket ID for context')
    .action(async (mergedJson, policyJson, cmdOptions) => {
      const globalOptions = program.opts();
      const options: CheckOptions = {
        ticket: cmdOptions.ticket,
        json: globalOptions.json || false,
      };
      await check(mergedJson, policyJson, options);
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
  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

/**
 * Run the CLI program
 */
export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();
  await program.parseAsync(argv);
}
