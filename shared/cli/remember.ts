/**
 * CLI Command: lex remember
 * 
 * Prompts user for Frame metadata, validates module_scope, creates Frame.
 */

import inquirer from 'inquirer';
import { v4 as uuidv4 } from 'uuid';
import type { Frame } from '../types/frame.js';
import { validateModuleIds } from '../module_ids/validator.js';
import { loadPolicy } from '../policy/loader.js';
import { getDb, saveFrame } from '../../memory/store/index.js';
import { getCurrentBranch } from '../git/branch.js';

export interface RememberOptions {
  jira?: string;
  referencePoint?: string;
  summary?: string;
  next?: string;
  modules?: string[];
  blockers?: string[];
  mergeBlockers?: string[];
  testsFailing?: string[];
  keywords?: string[];
  featureFlags?: string[];
  permissions?: string[];
  interactive?: boolean;
  json?: boolean;
  noSubstring?: boolean;
}

/**
 * Execute the 'lex remember' command
 * Creates a new Frame with user input
 */
export async function remember(options: RememberOptions = {}): Promise<void> {
  try {
    // Get current git branch
    const branch = await getCurrentBranch();
    
    // If interactive mode or missing required fields, prompt for input
    const answers = options.interactive || !options.summary || !options.next || !options.modules
      ? await promptForFrameData(options, branch)
      : options;

    // Validate module_scope against policy (THE CRITICAL RULE)
    // 
    // Note: For Phase 3 substring matching integration, replace validateModuleIds
    // with resolveModuleId for each module when noSubstring is false:
    //
    // import { resolveModuleId } from '../aliases/resolver.js';
    // 
    // const resolvedModules = [];
    // for (const moduleId of answers.modules || []) {
    //   try {
    //     const result = resolveModuleId(moduleId, policy, { 
    //       noSubstring: options.noSubstring 
    //     });
    //     if (result.warning) {
    //       console.warn(result.warning);
    //     }
    //     resolvedModules.push(result.canonical);
    //   } catch (err) {
    //     console.error(`❌ ${err.message}`);
    //     process.exit(1);
    //   }
    // }
    // answers.modules = resolvedModules;
    //
    const policy = loadPolicy();
    const validationResult = validateModuleIds(answers.modules || [], policy);

    if (!validationResult.valid && validationResult.errors) {
      console.error('\n❌ Module validation failed:\n');
      for (const error of validationResult.errors) {
        console.error(`  • ${error.message}`);
        if (error.suggestions.length > 0) {
          console.error(`    Suggestions: ${error.suggestions.join(', ')}`);
        }
      }
      process.exit(1);
    }

    // Build Frame object
    const frame: Frame = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      branch: branch,
      module_scope: answers.modules || [],
      summary_caption: answers.summary || '',
      reference_point: answers.referencePoint || '',
      status_snapshot: {
        next_action: answers.next || '',
        blockers: answers.blockers,
        merge_blockers: answers.mergeBlockers,
        tests_failing: answers.testsFailing,
      },
      jira: answers.jira,
      keywords: answers.keywords,
      feature_flags: answers.featureFlags,
      permissions: answers.permissions,
    };

    // Save Frame to database
    const db = getDb();
    saveFrame(db, frame);

    // Output result
    if (options.json) {
      console.log(JSON.stringify({ id: frame.id, timestamp: frame.timestamp }, null, 2));
    } else {
      console.log('\n✅ Frame created successfully!\n');
      console.log(`Frame ID: ${frame.id}`);
      console.log(`Timestamp: ${frame.timestamp}`);
      console.log(`Branch: ${frame.branch}`);
      if (frame.jira) {
        console.log(`Jira: ${frame.jira}`);
      }
      console.log(`Reference: ${frame.reference_point}`);
      console.log(`Modules: ${frame.module_scope.join(', ')}`);
    }
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(2);
  }
}

/**
 * Prompt user for Frame metadata interactively
 */
async function promptForFrameData(
  options: RememberOptions,
  currentBranch: string
): Promise<RememberOptions> {
  const questions: any[] = [];

  if (!options.jira) {
    questions.push({
      type: 'input',
      name: 'jira',
      message: 'Jira ticket (optional):',
    });
  }

  if (!options.referencePoint) {
    questions.push({
      type: 'input',
      name: 'referencePoint',
      message: 'Reference point (memorable phrase):',
      validate: (input: string) => input.trim().length > 0 || 'Reference point is required',
    });
  }

  if (!options.summary) {
    questions.push({
      type: 'input',
      name: 'summary',
      message: 'Summary (one-line description):',
      validate: (input: string) => input.trim().length > 0 || 'Summary is required',
    });
  }

  if (!options.next) {
    questions.push({
      type: 'input',
      name: 'next',
      message: 'Next action:',
      validate: (input: string) => input.trim().length > 0 || 'Next action is required',
    });
  }

  if (!options.modules) {
    questions.push({
      type: 'input',
      name: 'modules',
      message: 'Module scope (comma-separated):',
      filter: (input: string) => input.split(',').map(m => m.trim()).filter(m => m.length > 0),
      validate: (input: string[]) => input.length > 0 || 'At least one module is required',
    });
  }

  if (!options.blockers) {
    questions.push({
      type: 'input',
      name: 'blockers',
      message: 'Blockers (comma-separated, optional):',
      filter: (input: string) => {
        if (!input.trim()) return undefined;
        return input.split(',').map(b => b.trim()).filter(b => b.length > 0);
      },
    });
  }

  if (!options.mergeBlockers) {
    questions.push({
      type: 'input',
      name: 'mergeBlockers',
      message: 'Merge blockers (comma-separated, optional):',
      filter: (input: string) => {
        if (!input.trim()) return undefined;
        return input.split(',').map(b => b.trim()).filter(b => b.length > 0);
      },
    });
  }

  const answers = questions.length > 0 ? await inquirer.prompt(questions) : {};

  // Merge with provided options (provided options take precedence)
  return {
    ...answers,
    ...options,
  };
}
