/**
 * CLI Command: lex hints
 *
 * Retrieve hint details by hint ID.
 * Hints are stable, cacheable advice snippets for error recovery.
 * CLI equivalent of the MCP hints_get tool.
 *
 * Per AX v0.1 Contract:
 * - Supports --json for structured output
 * - Uses AXError for structured error handling
 *
 * @module shared/cli/hints
 */

import { getHintsForCodes, isValidHintId, getAvailableHintIds } from "../errors/hint-registry.js";
import { createOutput, raw } from "./output.js";
import { createAXError, type AXError } from "../errors/ax-error.js";

export interface HintsOptions {
  json?: boolean;
  list?: boolean;
}

/**
 * Execute the 'lex hints' command
 * Retrieves hint details by hint ID(s), or lists all available hints.
 *
 * Per AX v0.1 Contract:
 * - --json outputs structured data
 * - Errors return AXError shape with nextActions
 *
 * @param hintIds - Array of hint IDs to retrieve
 * @param options - Command options
 */
export async function hints(hintIds: string[], options: HintsOptions = {}): Promise<void> {
  // Create output writer for this command
  const out = createOutput({
    scope: "cli:hints",
    mode: options.json ? "jsonl" : "plain",
  });

  try {
    // If --list flag is set, show all available hints
    if (options.list) {
      const availableHints = getAvailableHintIds();

      if (options.json) {
        out.json({
          level: "info",
          message: `Found ${availableHints.length} available hints`,
          data: { hints: availableHints, count: availableHints.length },
        });
      } else {
        raw(`📚 Available Hints (${availableHints.length}):\n`);
        for (const id of availableHints.sort()) {
          raw(`  • ${id}`);
        }
        raw(`\nTo view hint details: lex hints <id> [<id2> ...]`);
      }
      return;
    }

    // Validate that hint IDs were provided
    if (hintIds.length === 0) {
      if (options.json) {
        const axError: AXError = createAXError(
          "VALIDATION_ERROR",
          "No hint IDs provided",
          [
            "Provide one or more hint IDs: lex hints <id1> [<id2> ...]",
            "Use --list to see available hints",
          ],
          { example: "lex hints hint_frame_no_ref hint_mod_orphan" }
        );
        out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
      } else {
        out.error("Error: No hint IDs provided");
        raw("\nUsage: lex hints <id> [<id2> ...]");
        raw("       lex hints --list");
        raw("\nExample: lex hints hint_frame_no_ref hint_mod_orphan");
      }
      process.exit(1);
    }

    // Validate hint ID format
    const invalidIds = hintIds.filter((id) => !isValidHintId(id));
    if (invalidIds.length > 0 && !options.json) {
      out.warn(`Some IDs don't match hint ID format: ${invalidIds.join(", ")}`);
    }

    // Get hints for the provided IDs
    const result = getHintsForCodes(hintIds);
    const notFound = hintIds.filter((id) => !result[id]);

    // Build response
    const response = {
      hints: result,
      found: Object.keys(result).length,
      requested: hintIds.length,
      ...(notFound.length > 0 && { notFound }),
    };

    if (options.json) {
      out.json({
        level: notFound.length > 0 ? "warn" : "info",
        message: `Retrieved ${response.found}/${response.requested} hints`,
        data: response,
      });
    } else {
      raw(`📖 Hint Details\n`);

      if (Object.keys(result).length === 0) {
        raw("  No hints found for the provided IDs.\n");
        raw("  Use --list to see available hints.");
      } else {
        for (const [id, hint] of Object.entries(result)) {
          raw(`┌─ ${id}`);
          raw(`│  ${hint.text}`);
          if (hint.docLink) {
            raw(`│  📎 ${hint.docLink}`);
          }
          raw(`└─`);
          raw("");
        }
      }

      if (notFound.length > 0) {
        raw(`⚠️  Not found (${notFound.length}): ${notFound.join(", ")}`);
        raw(`   Use --list to see available hints.`);
      }
    }
  } catch (error) {
    if (options.json) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const axError: AXError = createAXError(
        "HINTS_FAILED",
        errorMessage,
        ["Check hint ID format (should start with 'hint_')", "Use --list to see available hints"],
        error instanceof Error ? { stack: error.stack?.split("\n").slice(0, 5) } : undefined
      );
      out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      out.error(`Error: ${errorMessage}`);
    }
    process.exit(1);
  }
}
