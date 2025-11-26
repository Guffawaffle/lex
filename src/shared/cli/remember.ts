/**
 * CLI Command: lex remember
 *
 * Prompts user for Frame metadata, validates module_scope, creates Frame.
 */

import inquirer from "inquirer";
import { v4 as uuidv4 } from "uuid";
import type { Frame } from "../types/frame.js";
import { validateModuleIds } from "../module_ids/index.js";
import { loadPolicyIfAvailable } from "../policy/loader.js";
import { getDb, saveFrame } from "../../memory/store/index.js";
import { getCurrentBranch } from "../git/branch.js";
import * as output from "./output.js";

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
  strict?: boolean;
  noSubstring?: boolean;
  noPolicy?: boolean;
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
    const answers =
      options.interactive || !options.summary || !options.next || !options.modules
        ? await promptForFrameData(options, branch)
        : options;

    // Resolve and validate module_scope against policy (THE CRITICAL RULE + auto-correction)
    // Load policy if available, or skip validation if --no-policy or no policy file exists
    const policy = options.noPolicy ? null : loadPolicyIfAvailable();

    let resolvedModules: string[];

    if (!policy) {
      // No policy available - emit warning and use modules as-is
      if (!options.json) {
        const reason = options.noPolicy
          ? "Policy validation disabled (--skip-policy flag)"
          : "No policy file found";
        output.warn(
          `\n⚠️  ${reason}. Module validation skipped.\n` +
            (options.noPolicy
              ? ""
              : "   To enable validation, create a policy file or set LEX_POLICY_PATH.\n")
        );
      }
      resolvedModules = answers.modules || [];
    } else {
      // Policy exists - validate modules
      const validationResult = await validateModuleIds(answers.modules || [], policy);

      if (!validationResult.valid) {
        output.error(`\n❌ Module validation failed:\n`);
        for (const error of validationResult.errors || []) {
          output.error(`  - ${error.message}`);
        }
        output.error("");
        process.exit(1);
      }

      // Use canonical (resolved) module IDs from validation
      resolvedModules = validationResult.canonical || [];
    }

    // Build Frame object
    const frame: Frame = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      branch: branch,
      module_scope: resolvedModules, // Use resolved (potentially auto-corrected) module IDs
      summary_caption: answers.summary || "",
      reference_point: answers.referencePoint || "",
      status_snapshot: {
        next_action: answers.next || "",
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
      output.json({ id: frame.id, timestamp: frame.timestamp });
    } else {
      output.success("\n✅ Frame created successfully!\n");
      output.info(`Frame ID: ${frame.id}`);
      output.info(`Timestamp: ${frame.timestamp}`);
      output.info(`Branch: ${frame.branch}`);
      if (frame.jira) {
        output.info(`Jira: ${frame.jira}`);
      }
      output.info(`Reference: ${frame.reference_point}`);
      output.info(`Modules: ${frame.module_scope.join(", ")}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    output.error(`\n❌ Error: ${errorMessage}\n`);
    process.exit(2);
  }
}

/**
 * Prompt user for Frame metadata interactively
 */
async function promptForFrameData(
  options: RememberOptions,
  _currentBranch: string
): Promise<RememberOptions> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const questions: any[] = [];

  if (!options.jira) {
    questions.push({
      type: "input",
      name: "jira",
      message: "Jira ticket (optional):",
    });
  }

  if (!options.referencePoint) {
    questions.push({
      type: "input",
      name: "referencePoint",
      message: "Reference point (memorable phrase):",
      validate: (input: string) => input.trim().length > 0 || "Reference point is required",
    });
  }

  if (!options.summary) {
    questions.push({
      type: "input",
      name: "summary",
      message: "Summary (one-line description):",
      validate: (input: string) => input.trim().length > 0 || "Summary is required",
    });
  }

  if (!options.next) {
    questions.push({
      type: "input",
      name: "next",
      message: "Next action:",
      validate: (input: string) => input.trim().length > 0 || "Next action is required",
    });
  }

  if (!options.modules) {
    questions.push({
      type: "input",
      name: "modules",
      message: "Module scope (comma-separated):",
      filter: (input: string) =>
        input
          .split(",")
          .map((m) => m.trim())
          .filter((m) => m.length > 0),
      validate: (input: string[]) => input.length > 0 || "At least one module is required",
    });
  }

  if (!options.blockers) {
    questions.push({
      type: "input",
      name: "blockers",
      message: "Blockers (comma-separated, optional):",
      filter: (input: string) => {
        if (!input.trim()) return undefined;
        return input
          .split(",")
          .map((b) => b.trim())
          .filter((b) => b.length > 0);
      },
    });
  }

  if (!options.mergeBlockers) {
    questions.push({
      type: "input",
      name: "mergeBlockers",
      message: "Merge blockers (comma-separated, optional):",
      filter: (input: string) => {
        if (!input.trim()) return undefined;
        return input
          .split(",")
          .map((b) => b.trim())
          .filter((b) => b.length > 0);
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
