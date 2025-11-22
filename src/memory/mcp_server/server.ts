import { getLogger } from "lex/logger";
import { createDatabase } from "../store/db.js";
import {
  saveFrame,
  deleteFrame,
  searchFrames,
  getFramesByBranch,
  getFramesByJira,
  getAllFrames,
} from "../store/queries.js";
import type Database from "better-sqlite3";
// @ts-ignore - importing from compiled dist directories
import { ImageManager } from "../store/images.js";
// @ts-ignore - importing from compiled dist directories
import type { Frame } from "../frames/types.js";
import { MCP_TOOLS } from "./tools.js";
// @ts-ignore - importing from compiled dist directories
import { generateAtlasFrame, formatAtlasFrame } from "../../shared/atlas/atlas-frame.js";
// @ts-ignore - importing from compiled dist directories
import { validateModuleIds } from "../../shared/module_ids/validator.js";
// @ts-ignore - importing from compiled dist directories
import type { ModuleIdError } from "../../shared/types/validation.js";
// @ts-ignore - importing from compiled dist directories
import { loadPolicy } from "../../shared/policy/loader.js";
// @ts-ignore - importing from compiled dist directories
import { getCurrentBranch } from "../../shared/git/branch.js";
import { randomUUID } from "crypto";
import { join } from "path";
import { existsSync } from "fs";

const logger = getLogger("memory:mcp_server:server");

export interface MCPRequest {
  method: string;
  params?: any;
}

export interface MCPResponse {
  tools?: any[];
  content?: any[];
  error?: {
    message: string;
    code: string;
  };
}

export interface ToolCallParams {
  name: string;
  arguments: any;
}

/**
 * MCP Server - handles protocol requests
 */
export class MCPServer {
  private db: Database.Database;
  private imageManager: ImageManager;
  private policy: any | null; // Cached policy for validation (null if not available)
  private repoRoot: string | null; // Repository root path

  constructor(dbPath: string, repoRoot?: string) {
    this.db = createDatabase(dbPath);
    this.imageManager = new ImageManager(this.db);
    this.repoRoot = repoRoot || null;

    // Load policy once at initialization for better performance
    // If policy is not found, operate without policy enforcement
    try {
      // Policy path resolution priority:
      // 1. LEX_POLICY_PATH env var (explicit override)
      // 2. If repoRoot provided, use standard locations within it
      // 3. Let loadPolicy() use its default search logic
      let policyPath: string | undefined;

      if (process.env.LEX_POLICY_PATH) {
        // Explicit policy path from environment
        policyPath = process.env.LEX_POLICY_PATH;
      } else if (this.repoRoot) {
        // Try standard locations within provided repoRoot
        // Check working file first, then example
        const workingPath = join(this.repoRoot, ".smartergpt.local/lex/lexmap.policy.json");
        const examplePath = join(this.repoRoot, "policy/policy_spec/lexmap.policy.json");

        if (existsSync(workingPath)) {
          policyPath = workingPath;
        } else if (existsSync(examplePath)) {
          policyPath = examplePath;
        }
        // If neither exists, policyPath remains undefined and loadPolicy will handle it
      }

      this.policy = loadPolicy(policyPath);
    } catch (error: any) {
      if (process.env.LEX_DEBUG) {
        logger.error(`[LEX] Policy not available: ${error.message}`);
        logger.error(`[LEX] Operating without policy enforcement`);
      }
      this.policy = null;
    }
  }

  /**
   * Handle incoming MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params } = request;

    try {
      switch (method) {
        case "initialize":
          return this.handleInitialize();

        case "tools/list":
          return this.handleToolsList();

        case "tools/call":
          return await this.handleToolsCall(params as ToolCallParams);

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (error: any) {
      return {
        error: {
          message: error.message,
          code: error.code || "INTERNAL_ERROR",
        },
      };
    }
  }

  /**
   * Handle initialize request (MCP protocol handshake)
   */
  private handleInitialize(): MCPResponse {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "lex-memory-mcp-server",
        version: "0.1.0",
      },
    } as any;
  }

  /**
   * Handle tools/list request
   */
  private handleToolsList(): MCPResponse {
    return {
      tools: MCP_TOOLS,
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: ToolCallParams): Promise<MCPResponse> {
    const { name, arguments: args } = params;

    switch (name) {
      case "lex.remember":
        return await this.handleRemember(args);

      case "lex.recall":
        return this.handleRecall(args);

      case "lex.list_frames":
        return this.handleListFrames(args);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Handle lex.remember tool - create new Frame
   *
   * Validates module IDs against policy with alias resolution before creating Frame (THE CRITICAL RULE)
   */
  private async handleRemember(args: any): Promise<MCPResponse> {
    const {
      reference_point,
      summary_caption,
      status_snapshot,
      module_scope,
      branch,
      jira,
      keywords,
      atlas_frame_id,
      images,
    } = args;

    // Validate required fields
    if (!reference_point || !summary_caption || !status_snapshot || !module_scope) {
      throw new Error(
        "Missing required fields: reference_point, summary_caption, status_snapshot, module_scope"
      );
    }

    if (!Array.isArray(module_scope) || module_scope.length === 0) {
      throw new Error("module_scope must be a non-empty array of module IDs");
    }

    // Validate status_snapshot structure
    if (!status_snapshot.next_action) {
      throw new Error("status_snapshot.next_action is required");
    }

    // THE CRITICAL RULE: Resolve aliases and validate module IDs against policy (if available)
    let canonicalModuleScope = module_scope;
    if (this.policy) {
      const validationResult = await validateModuleIds(module_scope, this.policy);

      if (!validationResult.valid && validationResult.errors) {
        // Format error message with suggestions
        const errorMessages = validationResult.errors.map((error: ModuleIdError) => {
          const suggestions =
            error.suggestions.length > 0
              ? `\n  Did you mean: ${error.suggestions.join(", ")}?`
              : "";
          return `  • ${error.message}${suggestions}`;
        });

        throw new Error(
          `Invalid module IDs in module_scope:\n${errorMessages.join("\n")}\n\n` +
            `Module IDs must match those defined in lexmap.policy.json.\n` +
            `Available modules: ${Object.keys(this.policy.modules).join(", ")}`
        );
      }

      // Use canonical IDs for storage (never store aliases)
      if (validationResult.canonical) {
        canonicalModuleScope = validationResult.canonical;
      }
    } else if (process.env.LEX_DEBUG) {
      logger.error(`[LEX] Skipping module validation (no policy loaded)`);
    }

    // Generate Frame ID and timestamp
    const frameId = `frame-${Date.now()}-${randomUUID()}`;
    const timestamp = new Date().toISOString();

    // Get current git branch if not provided - only auto-detect when we
    // have an explicit repoRoot or an environment override. This avoids
    // leaking the runner's git branch into tests or hosted environments.
    let frameBranch: string;
    if (branch) {
      frameBranch = branch;
    } else if (this.repoRoot || process.env.LEX_DEFAULT_BRANCH) {
      frameBranch = getCurrentBranch();
      // Log branch detection for debugging
      logger.info(`[lex.remember] Auto-detected branch: ${frameBranch}`);
    } else {
      // When no repoRoot is provided and no env override, avoid auto-detecting
      // from the runner's repository; use 'unknown' to indicate no branch context.
      frameBranch = "unknown";
    }

    const frame = {
      id: frameId,
      timestamp,
      branch: frameBranch,
      jira: jira || null,
      module_scope: canonicalModuleScope, // Store canonical IDs only
      summary_caption,
      reference_point,
      status_snapshot,
      keywords: keywords || undefined,
      atlas_frame_id: atlas_frame_id || null,
      image_ids: [] as string[],
    };

    saveFrame(this.db, frame);

    // Process image attachments if provided
    const imageIds: string[] = [];
    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        try {
          // Decode base64 image data
          const imageBuffer = Buffer.from(img.data, "base64");
          const imageId = this.imageManager.storeImage(frameId, imageBuffer, img.mime_type);
          imageIds.push(imageId);
        } catch (error: any) {
          // If image storage fails, clean up the Frame and rethrow
          deleteFrame(this.db, frameId);
          throw new Error(`Failed to store image: ${error.message}`);
        }
      }

      // Update frame with image IDs
      frame.image_ids = imageIds;
      saveFrame(this.db, frame);
    }

    // Generate Atlas Frame for the module scope
    const atlasFrame = generateAtlasFrame(canonicalModuleScope);
    const atlasOutput = formatAtlasFrame(atlasFrame);

    const imageInfo = imageIds.length > 0 ? `🖼️  Images: ${imageIds.length} attached\n` : "";

    return {
      content: [
        {
          type: "text",
          text:
            `✅ Frame stored: ${frameId}\n` +
            `📍 Reference: ${reference_point}\n` +
            `💬 Summary: ${summary_caption}\n` +
            `📦 Modules: ${canonicalModuleScope.join(", ")}\n` +
            `🌿 Branch: ${frameBranch}\n` +
            `${jira ? `🎫 Jira: ${jira}\n` : ""}` +
            imageInfo +
            `📅 Timestamp: ${timestamp}\n` +
            atlasOutput,
        },
      ],
    };
  }

  /**
   * Handle lex.recall tool - search Frames with Atlas Frame
   */
  private handleRecall(args: any): MCPResponse {
    const { reference_point, jira, branch, limit = 10 } = args;

    if (!reference_point && !jira && !branch) {
      throw new Error("At least one search parameter required: reference_point, jira, or branch");
    }

    let frames: Frame[];
    try {
      if (reference_point) {
        // Use FTS5 full-text search for reference_point
        const result = searchFrames(this.db, reference_point);
        frames = result.frames.slice(0, limit);
      } else if (jira) {
        frames = getFramesByJira(this.db, jira).slice(0, limit);
      } else if (branch) {
        frames = getFramesByBranch(this.db, branch).slice(0, limit);
      } else {
        frames = [];
      }
    } catch (error: any) {
      // FTS5 search can fail with special characters (e.g., "zzz-nonexistent-query-zzz")
      // Treat search errors as empty results rather than propagating the error
      if (error.code === "SQLITE_ERROR" || error.message?.includes("no such column")) {
        frames = [];
      } else {
        throw error;
      }
    }

    if (frames.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              "🔍 No matching Frames found.\n" +
              "Try broader search terms or check your query parameters.",
          },
        ],
      };
    }

    // Format results with Atlas Frame for each
    const results = frames
      .map((f: Frame, idx: number) => {
        const nextAction = f.status_snapshot?.next_action || "None specified";
        const blockers = f.status_snapshot?.blockers || [];
        const mergeBlockers = f.status_snapshot?.merge_blockers || [];
        const testsFailing = f.status_snapshot?.tests_failing || [];

        // Generate Atlas Frame for this Frame's modules
        const atlasFrame = generateAtlasFrame(f.module_scope);
        const atlasOutput = formatAtlasFrame(atlasFrame);

        return (
          `\n--- Frame ${idx + 1}/${frames.length} ---\n` +
          `ID: ${f.id}\n` +
          `📍 Reference: ${f.reference_point}\n` +
          `💬 Summary: ${f.summary_caption}\n` +
          `📦 Modules: ${f.module_scope.join(", ")}\n` +
          `🌿 Branch: ${f.branch}\n` +
          `${f.jira ? `🎫 Jira: ${f.jira}\n` : ""}` +
          `📅 Timestamp: ${f.timestamp}\n` +
          `\nStatus:\n` +
          `  ⏭️  Next Action: ${nextAction}\n` +
          `  🚫 Blockers (${blockers.length}): ${blockers.join(", ") || "none"}\n` +
          `  ⛔ Merge Blockers (${mergeBlockers.length}): ${mergeBlockers.join(", ") || "none"}\n` +
          `  ❌ Tests Failing (${testsFailing.length}): ${testsFailing.join(", ") || "none"}\n` +
          `${f.keywords ? `🏷️  Keywords: ${f.keywords.join(", ")}\n` : ""}` +
          `${f.atlas_frame_id ? `🗺️  Atlas: ${f.atlas_frame_id}\n` : ""}` +
          atlasOutput
        );
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `🎯 Found ${frames.length} Frame(s):\n${results}`,
        },
      ],
    };
  }

  /**
   * Handle lex.list_frames tool - list recent Frames
   */
  private handleListFrames(args: any): MCPResponse {
    const { branch, module, limit = 10, since } = args;

    // Get frames based on filters
    let frames: Frame[];
    if (branch) {
      frames = getFramesByBranch(this.db, branch);
    } else {
      frames = getAllFrames(this.db);
    }

    // Filter by module if specified
    if (module) {
      frames = frames.filter((f: Frame) => f.module_scope.includes(module));
    }

    // Filter by timestamp if since is specified
    if (since) {
      const sinceDate = new Date(since);
      frames = frames.filter((f: Frame) => new Date(f.timestamp) >= sinceDate);
    }

    // Apply limit
    frames = frames.slice(0, limit);

    if (frames.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "📋 No Frames found matching criteria.",
          },
        ],
      };
    }

    // Format results with Atlas Frame for each
    const results = frames
      .map((f: Frame, idx: number) => {
        const atlasFrame = generateAtlasFrame(f.module_scope);
        const atlasOutput = formatAtlasFrame(atlasFrame);

        return (
          `\n${idx + 1}. ${f.reference_point}\n` +
          `   ID: ${f.id}\n` +
          `   📦 Modules: ${f.module_scope.join(", ")}\n` +
          `   🌿 Branch: ${f.branch}\n` +
          `   📅 ${f.timestamp}\n` +
          atlasOutput
        );
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `📋 Recent Frames (${frames.length}):\n${results}`,
        },
      ],
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}
