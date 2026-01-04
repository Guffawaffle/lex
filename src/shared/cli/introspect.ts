/**
 * CLI Command: lex introspect
 *
 * Discover the current state of Lex (available modules, policy, frame count, capabilities).
 * CLI equivalent of the MCP system_introspect tool.
 *
 * Per AX v0.1 Contract:
 * - Supports --json for structured output
 * - Uses AXError for structured error handling
 *
 * @module shared/cli/introspect
 */

import { createFrameStore, type FrameStore } from "../../memory/store/index.js";
import { loadPolicyIfAvailable } from "../policy/loader.js";
import { getCurrentBranch } from "../git/branch.js";
import { createOutput, raw } from "./output.js";
import { createAXError, type AXError } from "../errors/ax-error.js";
import { LEX_ERROR_CODES } from "../errors/error-codes.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface IntrospectOptions {
  json?: boolean;
  format?: "full" | "compact";
}

/**
 * Get version from package.json
 */
function getVersion(): string {
  try {
    // From dist/shared/cli/introspect.js, package.json is at ../../../package.json (root)
    const packagePath = join(__dirname, "..", "..", "..", "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf-8"));
    return packageJson.version;
  } catch {
    return "unknown";
  }
}

/**
 * Abbreviate error code for compact format (same logic as MCP server)
 */
function abbreviateErrorCode(code: string): string {
  // Keep first char of each word (VALIDATION_REQUIRED_FIELD -> V_R_F)
  return code
    .split("_")
    .map((word) => word[0])
    .join("_");
}

/**
 * Execute the 'lex introspect' command
 * Shows current Lex state, policy, capabilities, and error codes.
 *
 * Per AX v0.1 Contract:
 * - --json outputs structured data
 * - Errors return AXError shape with nextActions
 *
 * @param options - Command options
 * @param frameStore - Optional FrameStore for dependency injection
 */
export async function introspect(
  options: IntrospectOptions = {},
  frameStore?: FrameStore
): Promise<void> {
  const format = options.format || "full";

  // Create output writer for this command
  const out = createOutput({
    scope: "cli:introspect",
    mode: options.json ? "jsonl" : "plain",
  });

  // If no store is provided, create a default one (which we'll need to close)
  const store = frameStore ?? createFrameStore();
  const ownsStore = frameStore === undefined;

  try {
    // Get version
    const version = getVersion();

    // Get policy information
    const policy = loadPolicyIfAvailable();
    const policyData: { modules: string[]; moduleCount: number } | null = policy
      ? {
          modules: Object.keys(policy.modules).sort(),
          moduleCount: Object.keys(policy.modules).length,
        }
      : null;

    // Get state information
    const result = await store.listFrames({ limit: 1 });

    // Count all frames by querying with a high limit
    // Note: This is a simple approach; for large DBs, a dedicated count query would be better
    const allFrames = await store.listFrames({ limit: 10000 });
    const frameCount = allFrames.frames.length;
    const latestFrame = result.frames.length > 0 ? result.frames[0].timestamp : null;

    // Get current git branch (if available)
    let currentBranch = "unknown";
    try {
      currentBranch = getCurrentBranch();
    } catch {
      // If we can't get branch, keep "unknown"
    }

    // Capabilities (basic detection - MCP server has more sophisticated checks)
    const capabilities = {
      encryption: !!process.env.LEX_DB_KEY,
      images: true, // Always supported in current version
    };

    // Error codes - get all LEX_ERROR_CODES values and sort for deterministic ordering
    const errorCodes = Object.values(LEX_ERROR_CODES).sort();

    // Build error code metadata map for introspection
    // Categorize by prefix (CONFIG_*, POLICY_*, etc.)
    const errorCodeMetadata: Record<string, { category: string; retryable: boolean }> = {};
    for (const code of errorCodes) {
      const prefix = code.split("_")[0].toLowerCase();
      // Determine category from prefix
      let category = "internal";
      if (["config", "policy", "prompt", "schema", "instructions"].includes(prefix)) {
        category = "configuration";
      } else if (["db", "frame", "store"].includes(prefix)) {
        category = "storage";
      } else if (prefix === "validation") {
        category = "validation";
      } else if (prefix === "git") {
        category = "git";
      } else if (prefix === "lexsona") {
        category = "lexsona";
      }
      // Most config/validation errors are not retryable
      const retryable = ["storage", "git"].includes(category);
      errorCodeMetadata[code] = { category, retryable };
    }

    // Schema version for contract stability
    const schemaVersion = "1.0.0";

    if (format === "compact") {
      // Compact format for small-context agents
      const compactResponse = {
        schemaVersion,
        v: version,
        caps: [] as string[],
        state: {
          frames: frameCount,
          branch: currentBranch,
        },
        mods: policyData ? policyData.moduleCount : 0,
        // Abbreviate error codes
        errs: errorCodes.map((code) => abbreviateErrorCode(code)).sort(),
      };

      // Add capability abbreviations
      if (capabilities.encryption) compactResponse.caps.push("enc");
      if (capabilities.images) compactResponse.caps.push("img");
      compactResponse.caps.sort();

      if (options.json) {
        out.json({ level: "info", message: "Lex introspection (compact)", data: compactResponse });
      } else {
        raw(JSON.stringify(compactResponse, null, 2));
      }
    } else {
      // Full format
      const fullResponse = {
        schemaVersion,
        version,
        policy: policyData
          ? {
              modules: policyData.modules,
              moduleCount: policyData.moduleCount,
            }
          : null,
        state: {
          frameCount,
          latestFrame,
          currentBranch,
        },
        capabilities,
        errorCodes,
        errorCodeMetadata,
      };

      if (options.json) {
        out.json({ level: "info", message: "Lex introspection", data: fullResponse });
      } else {
        // Human-readable output
        raw(`🔍 Lex Introspection\n`);
        raw(`📐 Schema Version: ${schemaVersion}`);
        raw(`📦 Version: ${version}\n`);

        if (policyData) {
          raw(`📋 Policy:`);
          raw(`  Modules: ${policyData.moduleCount}`);
          raw(`  Module IDs: ${policyData.modules.join(", ")}\n`);
        } else {
          raw(`📋 Policy: Not loaded\n`);
        }

        raw(`📊 State:`);
        raw(`  Frames: ${frameCount}`);
        raw(`  Latest Frame: ${latestFrame || "none"}`);
        raw(`  Branch: ${currentBranch}\n`);

        raw(`⚙️  Capabilities:`);
        raw(`  Encryption: ${capabilities.encryption ? "✅" : "❌"}`);
        raw(`  Images: ${capabilities.images ? "✅" : "❌"}\n`);

        raw(`🚨 Error Codes (${errorCodes.length}):`);
        // Group by category for better readability
        const byCategory: Record<string, string[]> = {};
        for (const code of errorCodes) {
          const metadata = errorCodeMetadata[code];
          if (metadata) {
            if (!byCategory[metadata.category]) {
              byCategory[metadata.category] = [];
            }
            byCategory[metadata.category].push(code);
          }
        }
        // Sort categories for consistent output
        const sortedCategories = Object.keys(byCategory).sort();
        for (const category of sortedCategories) {
          const codes = byCategory[category];
          if (codes.length > 0) {
            const retryableCount = codes.filter((c) => errorCodeMetadata[c]?.retryable).length;
            raw(`  ${category.toUpperCase()} (${codes.length}, ${retryableCount} retryable):`);
            raw(`    ${codes.join(", ")}`);
          }
        }
      }
    }
  } catch (error) {
    if (options.json) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const axError: AXError = createAXError(
        "INTROSPECT_FAILED",
        errorMessage,
        [
          "Check database connection",
          "Verify Lex is properly initialized (run 'lex init')",
          "Check LEX_DB_PATH environment variable",
        ],
        error instanceof Error ? { stack: error.stack?.split("\n").slice(0, 5) } : undefined
      );
      out.json({ level: "error", message: axError.message, data: axError, code: axError.code });
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      out.error(`Error: ${errorMessage}`);
    }
    process.exit(1);
  } finally {
    // Close store if we own it
    if (ownsStore) {
      await store.close();
    }
  }
}
