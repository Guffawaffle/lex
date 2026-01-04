/**
 * CLI Command: lex remember
 *
 * Prompts user for Frame metadata, validates module_scope, creates Frame.
 *
 * Per AX v0.1 Contract:
 * - Supports --json for structured output
 * - Uses AXError for structured error handling
 */

import inquirer from "inquirer";
import { v4 as uuidv4 } from "uuid";
import type { Frame } from "../types/frame.js";
import { validateModuleIds } from "../module_ids/index.js";
import { loadPolicyIfAvailable } from "../policy/loader.js";
import { createFrameStore, type FrameStore } from "../../memory/store/index.js";
import { getCurrentBranch } from "../git/branch.js";
import { createOutput } from "./output.js";
import { createAXError, type AXError } from "../errors/ax-error.js";

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
  dryRun?: boolean;
}

/**
 * Execute the 'lex remember' command
 * Creates a new Frame with user input
 *
 * Per AX v0.1 Contract:
 * - --json outputs structured CliEvent with frame data
 * - Errors return AXError shape with nextActions
 *
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection (defaults to SqliteFrameStore)
 */
export async function remember(
  options: RememberOptions = {},
  frameStore?: FrameStore
): Promise<void> {
  // Create output writer for this command
  // When --json is set, use JSONL mode for structured output (AX v0.1 compliance)
  const out = createOutput({
    scope: "cli:remember",
    mode: options.json ? "jsonl" : "plain",
  });

  // If no store is provided, create a default one (which we'll need to close)
  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    // Get current git branch
    const branch = await getCurrentBranch();

    // AX Level 3: In JSON mode, NEVER prompt — fail-fast with structured guidance
    if (options.json) {
      const missingRequired: string[] = [];
      if (!options.summary) missingRequired.push("--summary");
      if (!options.modules || options.modules.length === 0) missingRequired.push("--modules");

      if (missingRequired.length > 0) {
        const axError: AXError = createAXError(
          "MISSING_REQUIRED_PARAMS",
          `Missing required parameters: ${missingRequired.join(", ")}`,
          [
            ...missingRequired.map((p) => `Add ${p} parameter`),
            "Example: lex remember --summary 'What happened' --modules 'cli,memory/store'",
            "Use --interactive for guided input",
          ],
          {
            missingParams: missingRequired,
            providedParams: Object.keys(options).filter(
              (k) => options[k as keyof RememberOptions] !== undefined
            ),
          }
        );
        out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
        process.exit(1);
      }
    }

    // If interactive mode or missing required fields (non-JSON), prompt for input
    const answers =
      options.interactive || !options.summary || !options.modules
        ? await promptForFrameData(options, branch)
        : applyDefaults(options);

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
        out.warn(
          `${reason}. Module validation skipped.`,
          undefined,
          "POLICY_SKIPPED",
          options.noPolicy
            ? undefined
            : "To enable validation, create a policy file or set LEX_POLICY_PATH."
        );
      }
      resolvedModules = answers.modules || [];
    } else {
      // Policy exists - validate modules
      const validationResult = await validateModuleIds(answers.modules || [], policy);

      if (!validationResult.valid) {
        // Get valid modules from policy for helpful error recovery
        const validModules = Object.keys(policy.modules || {});
        const providedModules = answers.modules || [];

        // Build specific next actions based on what went wrong
        const nextActions: string[] = [];

        // For each invalid module, suggest the closest valid one if available
        for (const error of validationResult.errors || []) {
          if (error.suggestions && error.suggestions.length > 0) {
            nextActions.push(`Replace '${error.module}' with '${error.suggestions[0]}'`);
          }
        }

        // Always include the valid modules list
        nextActions.push(
          `Available modules: ${validModules.slice(0, 10).join(", ")}${validModules.length > 10 ? ` (and ${validModules.length - 10} more)` : ""}`
        );

        // Escape hatches - prefer using existing modules over adding new ones
        nextActions.push("Prefer using an existing module from the list above");
        nextActions.push(
          "Use --skip-policy to bypass validation (if module truly doesn't exist yet)"
        );

        if (options.json) {
          const axError: AXError = createAXError(
            "MODULE_VALIDATION_FAILED",
            "Module validation failed",
            nextActions,
            {
              errors: validationResult.errors?.map((e) => e.message),
              providedModules,
              validModules,
            }
          );
          out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
        } else {
          // AX3: Show errors AND actionable next steps in plain text mode
          out.error("Module validation failed");
          for (const error of validationResult.errors || []) {
            out.error(`  - ${error.message}`);
          }
          out.info("");
          out.info("Next steps:");
          for (const action of nextActions) {
            out.info(`  → ${action}`);
          }
        }
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

    // Dry-run mode: validate but don't store (matches frame_validate MCP tool)
    if (options.dryRun) {
      if (options.json) {
        out.json({
          level: "success",
          message: "Frame validation passed (dry-run)",
          code: "FRAME_VALID",
          data: {
            valid: true,
            dryRun: true,
            frame: {
              id: frame.id,
              branch: frame.branch,
              modules: frame.module_scope,
              referencePoint: frame.reference_point,
              summary: frame.summary_caption,
              nextAction: frame.status_snapshot.next_action,
            },
          },
        });
      } else {
        out.success("✅ Frame validation passed (dry-run mode - not stored)");
        out.info(`Frame ID: ${frame.id}`);
        out.info(`Branch: ${frame.branch}`);
        out.info(`Modules: ${frame.module_scope.join(", ")}`);
        out.info(`Summary: ${frame.summary_caption}`);
        out.info(`Next: ${frame.status_snapshot.next_action || "(none)"}`);
      }
      return;
    }

    // Save Frame to database using FrameStore
    await store.saveFrame(frame);

    // Output result (AX v0.1: structured output with --json)
    if (options.json) {
      out.json({
        level: "success",
        message: "Frame stored",
        code: "FRAME_CREATED",
        data: {
          success: true,
          frame_id: frame.id,
          created_at: frame.timestamp,
          // Additional context fields
          branch: frame.branch,
          modules: frame.module_scope,
          referencePoint: frame.reference_point,
        },
      });
    } else {
      out.success("Frame created successfully!");
      out.info(`Frame ID: ${frame.id}`);
      out.info(`Timestamp: ${frame.timestamp}`);
      out.info(`Branch: ${frame.branch}`);
      if (frame.jira) {
        out.info(`Jira: ${frame.jira}`);
      }
      out.info(`Reference: ${frame.reference_point}`);
      out.info(`Modules: ${frame.module_scope.join(", ")}`);
    }
  } catch (error: unknown) {
    if (options.json) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const axError: AXError = createAXError(
        "FRAME_STORE_FAILED",
        errorMessage,
        [
          "Check database connection",
          "Verify write permissions",
          "Run 'lex check' to diagnose issues",
        ],
        error instanceof Error ? { stack: error.stack?.split("\n").slice(0, 5) } : undefined
      );
      out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      out.error(`Error: ${errorMessage}`);
    }
    process.exit(2);
  } finally {
    // Close store if we own it
    if (ownsStore) {
      await store.close();
    }
  }
}

/**
 * Apply defaults to optional fields (AX Level 3: no hidden prompts)
 *
 * Required fields: summary, modules
 * Optional fields with defaults:
 *   - referencePoint: "" (empty string)
 *   - next: "" (empty string)
 *   - jira: undefined
 *   - blockers: undefined
 *   - mergeBlockers: undefined
 *   - testsFailing: undefined
 *   - keywords: undefined
 *   - featureFlags: undefined
 *   - permissions: undefined
 */
function applyDefaults(options: RememberOptions): RememberOptions {
  return {
    ...options,
    referencePoint: options.referencePoint ?? "",
    next: options.next ?? "",
    // All other optional fields default to undefined (omitted from Frame)
  };
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

  // Only prompt for REQUIRED fields when not in full interactive mode
  const fullInteractive = options.interactive;

  if (fullInteractive && !options.jira) {
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
      message: "Reference point (memorable phrase, optional):",
      default: "",
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
      message: "Next action (optional):",
      default: "",
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

  // Only prompt for optional fields in full interactive mode
  if (fullInteractive && !options.blockers) {
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

  if (fullInteractive && !options.mergeBlockers) {
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
