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
import { loadPolicyIfAvailable, resolvePolicyPath } from "../policy/loader.js";
import { getCurrentBranch } from "../git/branch.js";
import { createOutput, raw } from "./output.js";
import { createAXError, type AXError } from "../errors/ax-error.js";
import { LEX_ERROR_CODES } from "../errors/error-codes.js";
import { loadConfigResolution } from "../config/index.js";
import { alternateStoreWarning, resolveStoreIdentity } from "../config/store-identity.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildFrameWriteContract } from "./frame-write-contract.js";

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
    const configResolution = loadConfigResolution();
    const policyResolution = resolvePolicyPath();

    // Get policy information
    const policy = loadPolicyIfAvailable();
    const policyData: { modules: string[]; moduleCount: number } | null = policy
      ? {
          modules: Object.keys(policy.modules).sort(),
          moduleCount: Object.keys(policy.modules).length,
        }
      : null;

    // Probe backend health before issuing state queries so introspection can
    // still describe an unavailable configured store without leaking credentials.
    const storeHealth = await store.getHealth();
    const result = storeHealth.healthy
      ? await store.listFrames({ limit: 1 })
      : { frames: [] as Awaited<ReturnType<FrameStore["listFrames"]>>["frames"] };
    const allFrames = storeHealth.healthy
      ? await store.listFrames({ limit: 10 })
      : { frames: [] as Awaited<ReturnType<FrameStore["listFrames"]>>["frames"] };
    const frameCount = storeHealth.healthy ? await store.getFrameCount() : 0;
    const latestFrame = result.frames.length > 0 ? result.frames[0].timestamp : null;

    // Get current git branch (if available)
    let currentBranch = "unknown";
    let branchSource = "unknown";
    if (process.env.LEX_DEFAULT_BRANCH) {
      currentBranch = getCurrentBranch();
      branchSource = "env:LEX_DEFAULT_BRANCH";
    } else {
      try {
        currentBranch = getCurrentBranch();
        if (currentBranch !== "unknown") {
          branchSource = "git";
        }
      } catch {
        // If we can't get branch, keep "unknown"
      }
    }

    const metadata = store.getMetadata();
    const databaseSource =
      metadata.backend === "postgres"
        ? "env:LEX_DATABASE_URL"
        : process.env.LEX_DB_PATH
          ? "env:LEX_DB_PATH"
          : process.env.LEX_MEMORY_DB
            ? "env:LEX_MEMORY_DB"
            : configResolution.pathSources.database;
    const sqliteIdentity =
      metadata.backend === "sqlite"
        ? resolveStoreIdentity(
            metadata.location,
            databaseSource,
            configResolution.workspaceRoot.path
          )
        : null;
    const storeWarning = sqliteIdentity ? alternateStoreWarning(sqliteIdentity) : null;
    const warnings: Array<{ code: string; message: string }> = [];
    if (storeWarning) warnings.push({ code: "ALTERNATE_STORES_FOUND", message: storeWarning });
    if (!storeHealth.healthy) {
      warnings.push({
        code: "STORE_UNAVAILABLE",
        message: storeHealth.message ?? "The configured FrameStore is unavailable.",
      });
    }

    const runtimeResolution = {
      workspaceRoot: {
        path: configResolution.workspaceRoot.path,
        source:
          configResolution.workspaceRoot.source === "explicit"
            ? process.env.LEX_WORKSPACE_ROOT
              ? "env:LEX_WORKSPACE_ROOT"
              : process.env.LEX_APP_ROOT
                ? "env:LEX_APP_ROOT"
                : "explicit"
            : configResolution.workspaceRoot.source,
      },
      configFile: configResolution.configFile,
      database: {
        backend: metadata.backend,
        path: metadata.location,
        canonicalPath: metadata.canonicalLocation,
        identity: metadata.identity,
        source: databaseSource,
        candidates: sqliteIdentity?.candidates ?? [],
        health: storeHealth,
      },
      policy: {
        path: policyResolution.path,
        source: policyResolution.source,
        loaded: policy !== null,
      },
      branch: {
        name: currentBranch,
        source: branchSource,
      },
    };

    // Capabilities (basic detection - MCP server has more sophisticated checks)
    const capabilities = metadata.capabilities;

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
    const frameWriteContract = buildFrameWriteContract({
      policy,
      projectRoot: configResolution.workspaceRoot.path,
      branch: currentBranch,
      recentFrames: allFrames.frames.slice(0, 10),
    });

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
        ctx: runtimeResolution,
        mods: policyData ? policyData.moduleCount : 0,
        frameWriteContract: {
          requiredFields: frameWriteContract.requiredFields,
          policyState: frameWriteContract.policy.state,
          inferenceAvailable: frameWriteContract.inference.available,
          suggestions: frameWriteContract.suggestions.map((item) => item.moduleId),
          fallback: frameWriteContract.fallback.moduleId,
        },
        // Abbreviate error codes
        errs: errorCodes.map((code) => abbreviateErrorCode(code)).sort(),
        warnings,
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
        frameWriteContract,
        state: {
          frameCount,
          latestFrame,
          currentBranch,
        },
        resolution: runtimeResolution,
        capabilities,
        errorCodes,
        errorCodeMetadata,
        warnings,
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

        raw(`🧭 Resolution:`);
        raw(
          `  Project Root: ${runtimeResolution.workspaceRoot.path} (${runtimeResolution.workspaceRoot.source})`
        );
        raw(
          `  Config File: ${runtimeResolution.configFile.path || "none"} (${runtimeResolution.configFile.source})`
        );
        raw(
          `  Database: ${runtimeResolution.database.path} (${runtimeResolution.database.source})`
        );
        raw(
          `  Policy: ${runtimeResolution.policy.path || "none"} (${runtimeResolution.policy.source})`
        );
        raw(`  Branch Source: ${runtimeResolution.branch.source}\n`);

        for (const warning of warnings) {
          raw(`⚠️  ${warning.code}: ${warning.message}`);
        }
        if (warnings.length > 0) raw("");

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
    process.exitCode = 1;
  } finally {
    // Close store if we own it
    if (ownsStore) {
      await store.close();
    }
  }
}
