import { getLogger } from "@smartergpt/lex/logger";
import { SqliteFrameStore } from "../store/sqlite/index.js";
import type { FrameStore, FrameSearchCriteria } from "../store/frame-store.js";
import { deleteFrame } from "../store/queries.js";
import type Database from "better-sqlite3-multiple-ciphers";
// @ts-ignore - importing from compiled dist directories
import { ImageManager } from "../store/images.js";
// @ts-ignore - importing from compiled dist directories
import type { Frame } from "../frames/types.js";
import { MCP_TOOLS } from "./tools.js";
import { MCPError, MCPErrorCode, createModuleIdError } from "./errors.js";
// @ts-ignore - importing from compiled dist directories
import { generateAtlasFrame, formatAtlasFrame } from "../../shared/atlas/atlas-frame.js";
// @ts-ignore - importing from compiled dist directories
import { validateModuleIds } from "../../shared/module_ids/validator.js";
// @ts-ignore - importing from compiled dist directories
import type { ModuleIdError } from "../../shared/types/validation.js";
// @ts-ignore - importing from compiled dist directories
import { loadPolicy } from "../../shared/policy/loader.js";
// @ts-ignore - importing from compiled dist directories
import type { Policy } from "../../shared/types/policy.js";
// @ts-ignore - importing from compiled dist directories
import { getCurrentBranch } from "../../shared/git/branch.js";
import { randomUUID } from "crypto";
import { join } from "path";
import { existsSync } from "fs";
import { AXErrorException } from "../../shared/errors/ax-error.js";

const logger = getLogger("memory:mcp_server:server");

/**
 * Maximum number of frames to fetch when filtering by jira/branch/module.
 * This is a performance safeguard - the FrameStore interface doesn't have
 * specific jira/branch filter methods, so we fetch a batch and filter in JS.
 * Increase this value if you have very large frame stores.
 */
const MAX_FILTER_FETCH_LIMIT = 1000;

interface RememberArgs {
  reference_point: string;
  summary_caption: string;
  status_snapshot: {
    next_action: string;
    blockers?: string[];
    merge_blockers?: string[];
    tests_failing?: string[];
  };
  module_scope: string[];
  branch?: string;
  jira?: string;
  keywords?: string[];
  atlas_frame_id?: string;
  images?: { data: string; mime_type: string }[];
}

interface RecallArgs {
  reference_point?: string;
  jira?: string;
  branch?: string;
  limit?: number;
}

interface ListFramesArgs {
  branch?: string;
  module?: string;
  limit?: number;
  since?: string;
}

export interface MCPRequest {
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  protocolVersion?: string;
  capabilities?: unknown;
  serverInfo?: {
    name: string;
    version: string;
  };
  tools?: unknown[];
  content?: unknown[];
  error?: {
    message: string;
    code: string;
  };
}

export interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Options for creating an MCPServer instance.
 */
export interface MCPServerOptions {
  /** 
   * FrameStore instance to use for frame persistence. 
   * If not provided, creates a SqliteFrameStore with the given dbPath.
   */
  frameStore?: FrameStore;
  /** Database path. Only used if frameStore is not provided. */
  dbPath?: string;
  /** Repository root path for policy resolution. */
  repoRoot?: string;
}

/**
 * MCP Server - handles protocol requests
 */
export class MCPServer {
  private frameStore: FrameStore;
  private db: Database.Database | null; // Database reference for ImageManager (null when using non-SQLite store)
  private imageManager: ImageManager | null;
  private policy: Policy | null; // Cached policy for validation (null if not available)
  private repoRoot: string | null; // Repository root path

  /**
   * Create a new MCPServer instance.
   * 
   * Supports two construction patterns:
   * 1. Legacy: MCPServer(dbPath: string, repoRoot?: string) - creates SqliteFrameStore internally
   * 2. DI: MCPServer(options: MCPServerOptions) - uses provided FrameStore for testing/swapping
   * 
   * @param dbPathOrOptions - Either a database path string (legacy) or MCPServerOptions object
   * @param repoRoot - Repository root path (only used with legacy constructor)
   */
  constructor(dbPathOrOptions: string | MCPServerOptions, repoRoot?: string) {
    // Handle both legacy (dbPath, repoRoot) and new (options object) signatures
    let options: MCPServerOptions;
    if (typeof dbPathOrOptions === "string") {
      // Legacy constructor: MCPServer(dbPath, repoRoot)
      options = { dbPath: dbPathOrOptions, repoRoot };
    } else {
      // New constructor: MCPServer(options)
      options = dbPathOrOptions;
    }

    // Create or use provided FrameStore
    if (options.frameStore) {
      this.frameStore = options.frameStore;
      // For SqliteFrameStore, we can access the db for ImageManager
      if (this.frameStore instanceof SqliteFrameStore) {
        this.db = (this.frameStore as SqliteFrameStore).db;
        this.imageManager = new ImageManager(this.db);
      } else {
        // For non-SQLite stores (e.g., MemoryFrameStore), images are not supported
        this.db = null;
        this.imageManager = null;
      }
    } else if (options.dbPath) {
      // Create SqliteFrameStore with the provided path
      const store = new SqliteFrameStore(options.dbPath);
      this.frameStore = store;
      this.db = store.db;
      this.imageManager = new ImageManager(this.db);
    } else {
      // Create SqliteFrameStore with default path
      const store = new SqliteFrameStore();
      this.frameStore = store;
      this.db = store.db;
      this.imageManager = new ImageManager(this.db);
    }

    this.repoRoot = options.repoRoot || null;

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
        const workingPath = join(this.repoRoot, ".smartergpt/lex/lexmap.policy.json");
        const examplePath = join(this.repoRoot, "policy/policy_spec/lexmap.policy.json");

        if (existsSync(workingPath)) {
          policyPath = workingPath;
        } else if (existsSync(examplePath)) {
          policyPath = examplePath;
        }
        // If neither exists, policyPath remains undefined and loadPolicy will handle it
      }

      this.policy = loadPolicy(policyPath);
    } catch (error: unknown) {
      if (process.env.LEX_DEBUG) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[LEX] Policy not available: ${errorMessage}`);
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
          throw new MCPError(MCPErrorCode.INTERNAL_UNKNOWN_METHOD, `Unknown method: ${method}`);
      }
    } catch (error: unknown) {
      // Handle MCPError with structured response
      if (error instanceof MCPError) {
        return error.toResponse();
      }

      // Handle generic errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: {
          message: errorMessage,
          code: MCPErrorCode.INTERNAL_ERROR,
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
    };
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
        return await this.handleRecall(args);

      case "lex.list_frames":
        return await this.handleListFrames(args);

      default:
        throw new MCPError(MCPErrorCode.INTERNAL_UNKNOWN_TOOL, `Unknown tool: ${name}`, {
          requestedTool: name,
          availableTools: ["lex.remember", "lex.recall", "lex.list_frames"],
        });
    }
  }

  /**
   * Handle lex.remember tool - create new Frame
   *
   * Validates module IDs against policy with alias resolution before creating Frame (THE CRITICAL RULE)
   */
  private async handleRemember(args: Record<string, unknown>): Promise<MCPResponse> {
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
    } = args as unknown as RememberArgs;

    // Validate required fields
    if (!reference_point || !summary_caption || !status_snapshot || !module_scope) {
      const missing: string[] = [];
      if (!reference_point) missing.push("reference_point");
      if (!summary_caption) missing.push("summary_caption");
      if (!status_snapshot) missing.push("status_snapshot");
      if (!module_scope) missing.push("module_scope");

      throw new MCPError(
        MCPErrorCode.VALIDATION_REQUIRED_FIELD,
        `Missing required fields: ${missing.join(", ")}`,
        { missingFields: missing }
      );
    }

    if (!Array.isArray(module_scope) || module_scope.length === 0) {
      throw new MCPError(
        MCPErrorCode.VALIDATION_EMPTY_MODULE_SCOPE,
        "module_scope must be a non-empty array of module IDs"
      );
    }

    // Validate status_snapshot structure
    if (!status_snapshot.next_action) {
      throw new MCPError(
        MCPErrorCode.VALIDATION_INVALID_STATUS,
        "status_snapshot.next_action is required"
      );
    }

    // THE CRITICAL RULE: Resolve aliases and validate module IDs against policy (if available)
    let canonicalModuleScope = module_scope;
    if (this.policy) {
      const validationResult = await validateModuleIds(module_scope, this.policy);

      if (!validationResult.valid && validationResult.errors) {
        // Collect invalid IDs and suggestions
        const invalidIds = validationResult.errors.map((e: ModuleIdError) => e.module);
        const suggestions = validationResult.errors
          .flatMap((e: ModuleIdError) => e.suggestions)
          .filter((s, i, arr) => arr.indexOf(s) === i); // dedupe

        throw createModuleIdError(invalidIds, suggestions, Object.keys(this.policy.modules));
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
      jira: jira || undefined,
      module_scope: canonicalModuleScope, // Store canonical IDs only
      summary_caption,
      reference_point,
      status_snapshot,
      keywords: keywords || undefined,
      atlas_frame_id: atlas_frame_id || undefined,
      image_ids: [] as string[],
    };

    await this.frameStore.saveFrame(frame);

    // Process image attachments if provided
    const imageIds: string[] = [];
    if (images && Array.isArray(images) && images.length > 0) {
      if (!this.imageManager || !this.db) {
        throw new MCPError(
          MCPErrorCode.STORAGE_IMAGE_FAILED,
          "Image storage is not available with the current store implementation",
          { frameId }
        );
      }
      for (const img of images) {
        try {
          // Decode base64 image data
          const imageBuffer = Buffer.from(img.data, "base64");
          const imageId = this.imageManager.storeImage(frameId, imageBuffer, img.mime_type);
          imageIds.push(imageId);
        } catch (error: unknown) {
          // If image storage fails, clean up the Frame and rethrow
          deleteFrame(this.db, frameId);
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new MCPError(
            MCPErrorCode.STORAGE_IMAGE_FAILED,
            `Failed to store image: ${errorMessage}`,
            { frameId, mimeType: img.mime_type }
          );
        }
      }

      // Update frame with image IDs
      frame.image_ids = imageIds;
      await this.frameStore.saveFrame(frame);
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
  private async handleRecall(args: Record<string, unknown>): Promise<MCPResponse> {
    const { reference_point, jira, branch, limit = 10 } = args as unknown as RecallArgs;

    if (!reference_point && !jira && !branch) {
      throw new AXErrorException(
        "MCP_RECALL_MISSING_PARAMS",
        "At least one search parameter required: reference_point, jira, or branch",
        [
          "Provide a reference_point to search by text",
          "Provide a jira ticket ID to filter by Jira ticket",
          "Provide a branch name to filter by git branch",
        ],
        { providedParams: { reference_point, jira, branch } }
      );
    }

    let frames: Frame[];
    try {
      // Build search criteria based on provided parameters
      const criteria: FrameSearchCriteria = { limit };

      if (reference_point) {
        // Use FTS5 full-text search for reference_point
        criteria.query = reference_point;
        frames = await this.frameStore.searchFrames(criteria);
      } else if (jira) {
        // For jira/branch filtering, we need to search all and filter
        // The FrameStore interface doesn't have specific jira/branch methods
        // We'll use listFrames and filter in JavaScript
        const allFrames = await this.frameStore.listFrames({ limit: MAX_FILTER_FETCH_LIMIT });
        frames = allFrames.filter((f) => f.jira === jira).slice(0, limit);
      } else if (branch) {
        // For branch filtering, search all and filter
        const allFrames = await this.frameStore.listFrames({ limit: MAX_FILTER_FETCH_LIMIT });
        frames = allFrames.filter((f) => f.branch === branch).slice(0, limit);
      } else {
        frames = [];
      }
    } catch (error: unknown) {
      // FTS5 search can fail with special characters (e.g., "zzz-nonexistent-query-zzz")
      // Treat search errors as empty results rather than propagating the error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      if (err.code === "SQLITE_ERROR" || err.message?.includes("no such column")) {
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
  private async handleListFrames(args: Record<string, unknown>): Promise<MCPResponse> {
    const { branch, module, limit = 10, since } = args as unknown as ListFramesArgs;

    // Get frames using frameStore.listFrames
    // Fetch more than limit to account for filtering
    let frames = await this.frameStore.listFrames({ limit: MAX_FILTER_FETCH_LIMIT });

    // Filter by branch if specified
    if (branch) {
      frames = frames.filter((f: Frame) => f.branch === branch);
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
   * Close the server and release resources.
   * Properly closes the FrameStore on shutdown.
   */
  async close(): Promise<void> {
    await this.frameStore.close();
  }
}
