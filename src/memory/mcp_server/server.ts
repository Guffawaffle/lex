import { getLogger } from "@smartergpt/lex/logger";
import { SqliteFrameStore } from "../store/sqlite/index.js";
import type { FrameStore, FrameSearchCriteria } from "../store/frame-store.js";
import { getDbStats } from "../store/queries.js";
import type Database from "better-sqlite3-multiple-ciphers";
// @ts-ignore - importing from compiled dist directories
import { ImageManager } from "../store/images.js";
// @ts-ignore - importing from compiled dist directories
import type { Frame } from "../frames/types.js";
import { MCP_TOOLS } from "./tools.js";
import { MCPError, MCPErrorCode, MCP_ERROR_METADATA, createModuleIdError } from "./errors.js";
import { IdempotencyCache } from "./idempotency.js";
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
// @ts-ignore - importing from compiled dist directories
import { validatePolicySchema } from "../../shared/policy/schema.js";
import { randomUUID } from "crypto";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { AXErrorException, isAXErrorException } from "../../shared/errors/ax-error.js";
// @ts-ignore - importing from compiled dist directories
import {
  buildTimeline,
  filterTimeline,
  renderTimelineText,
  renderModuleScopeEvolution,
  renderBlockerTracking,
  renderTimelineJSON,
  type TimelineOptions,
} from "../renderer/timeline.js";
// @ts-ignore - importing from compiled dist directories
import { compactFrame, compactFrameList } from "../renderer/compact.js";

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
  request_id?: string;
}

interface RecallArgs {
  reference_point?: string;
  jira?: string;
  branch?: string;
  limit?: number;
  format?: "full" | "compact";
  mode?: "all" | "any";
}

interface GetFrameArgs {
  frame_id: string;
  include_atlas?: boolean;
  format?: "full" | "compact";
}

interface ListFramesArgs {
  branch?: string;
  module?: string;
  limit?: number;
  since?: string;
  cursor?: string;
  format?: "full" | "compact";
}

interface PolicyCheckArgs {
  path?: string;
  policyPath?: string;
  strict?: boolean;
}

interface TimelineArgs {
  ticketOrBranch: string;
  since?: string;
  until?: string;
  format?: "text" | "json" | "compact";
}

interface CodeAtlasArgs {
  path?: string;
  foldRadius?: number;
  maxTokens?: number;
}

interface IntrospectArgs {
  format?: "full" | "compact";
}

interface GetHintsArgs {
  hintIds: string[];
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
    context?: Record<string, unknown>; // Structured context (from AXError or MCPError metadata)
    nextActions?: string[]; // Recovery suggestions (from AXError)
  };
  // Structured data for tool responses (e.g., frame_id from remember)
  data?: Record<string, unknown>;
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
  private idempotencyCache: IdempotencyCache; // Idempotency cache for mutation tools

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

    // Initialize idempotency cache (24 hour TTL by default)
    this.idempotencyCache = new IdempotencyCache();

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
        return {
          error: {
            code: error.code,
            message: error.message,
            context: error.metadata, // Map metadata to context for consistency
          },
        };
      }

      // Handle AXErrorException with structured response
      if (isAXErrorException(error)) {
        return {
          error: {
            code: error.axError.code,
            message: error.axError.message,
            context: error.axError.context,
            nextActions: error.axError.nextActions,
          },
        };
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
   * Returns tools sorted by name for deterministic ordering
   */
  private handleToolsList(): MCPResponse {
    return {
      tools: [...MCP_TOOLS].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * Handle tools/call request
   */
  private async handleToolsCall(params: ToolCallParams): Promise<MCPResponse> {
    const { name, arguments: args } = params;

    // Log deprecation warnings for old tool names (AX-014)
    const deprecatedNames: Record<string, string> = {
      remember: "frame_create",
      lex_remember: "frame_create",
      validate_remember: "frame_validate",
      lex_validate_remember: "frame_validate",
      recall: "frame_search",
      lex_recall: "frame_search",
      get_frame: "frame_get",
      lex_get_frame: "frame_get",
      list_frames: "frame_list",
      lex_list_frames: "frame_list",
      // Note: lex_policy_check is the v2.0.x prefixed version (deprecated)
      // but policy_check itself is the canonical name (already compliant)
      lex_policy_check: "policy_check",
      timeline: "timeline_show",
      lex_timeline: "timeline_show",
      code_atlas: "atlas_analyze",
      lex_code_atlas: "atlas_analyze",
      introspect: "system_introspect",
      lex_introspect: "system_introspect",
      get_hints: "hints_get",
      lex_help: "help",
    };

    if (deprecatedNames[name]) {
      logger.warn(
        `[MCP] Tool "${name}" is deprecated. Use "${deprecatedNames[name]}" instead. ` +
          `See ADR-0009 for migration guide.`
      );
    }

    switch (name) {
      // Standardized names (AX-014: resource_action pattern)
      case "frame_create":
      // Legacy aliases (deprecated)
      case "remember":
      case "lex_remember":
        return await this.handleRemember(args);

      case "frame_validate":
      case "validate_remember":
      case "lex_validate_remember":
        return await this.handleValidateRemember(args);

      case "frame_search":
      case "recall":
      case "lex_recall":
        return await this.handleRecall(args);

      case "frame_get":
      case "get_frame":
      case "lex_get_frame":
        return await this.handleGetFrame(args);

      case "frame_list":
      case "list_frames":
      case "lex_list_frames":
        return await this.handleListFrames(args);

      case "policy_check":
      case "lex_policy_check":
        return await this.handlePolicyCheck(args);

      case "timeline_show":
      case "timeline":
      case "lex_timeline":
        return await this.handleTimeline(args);

      case "atlas_analyze":
      case "code_atlas":
      case "lex_code_atlas":
        return await this.handleCodeAtlas(args);

      case "system_introspect":
      case "introspect":
      case "lex_introspect":
        return await this.handleIntrospect(args);

      case "help":
      case "lex_help":
        return await this.handleHelp(args);

      case "hints_get":
      case "get_hints":
        return await this.handleGetHints(args);

      case "db_stats":
        return await this.handleDbStats(args);

      case "turncost_calculate":
        return await this.handleTurncostCalculate(args);

      case "contradictions_scan":
        return await this.handleContradictionsScan(args);

      default:
        throw new MCPError(MCPErrorCode.INTERNAL_UNKNOWN_TOOL, `Unknown tool: ${name}`, {
          requestedTool: name,
          availableTools: [
            "frame_create",
            "frame_validate",
            "frame_search",
            "frame_get",
            "frame_list",
            "policy_check",
            "timeline_show",
            "atlas_analyze",
            "system_introspect",
            "help",
            "hints_get",
            "db_stats",
            "turncost_calculate",
            "contradictions_scan",
          ],
        });
    }
  }

  /**
   * Handle mcp_lex_frame_remember tool - create new Frame
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
      request_id,
    } = args as unknown as RememberArgs;

    // Check idempotency cache if request_id is provided
    if (request_id) {
      const cachedResponse = this.idempotencyCache.getCached(request_id);
      if (cachedResponse) {
        logger.info(`[remember] Returning cached response for request_id: ${request_id}`);
        return cachedResponse;
      }
    }

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
      logger.info(`[mcp_lex_frame_remember] Auto-detected branch: ${frameBranch}`);
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
          await this.frameStore.deleteFrame(frameId);
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

    // Build structured response data (AX-002)
    const responseData: Record<string, unknown> = {
      success: true,
      frame_id: frameId,
      created_at: timestamp,
    };

    // Include atlas_frame_id if one was provided or stored
    if (frame.atlas_frame_id) {
      responseData.atlas_frame_id = frame.atlas_frame_id;
    }

    const response: MCPResponse = {
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
      data: responseData,
    };

    // Cache the response if request_id was provided
    if (request_id) {
      this.idempotencyCache.setCached(request_id, response);
    }

    return response;
  }

  /**
   * Handle validate_remember tool - validate Frame input without storage (dry-run)
   *
   * Performs the same validation as handleRemember but returns a structured validation result
   * without creating or storing a Frame. This enables agents to verify inputs incrementally.
   */
  private async handleValidateRemember(args: Record<string, unknown>): Promise<MCPResponse> {
    const {
      reference_point,
      summary_caption,
      status_snapshot,
      module_scope,
      branch: _branch,
      jira,
      keywords: _keywords,
      atlas_frame_id: _atlas_frame_id,
      images,
    } = args as unknown as RememberArgs;

    const errors: Array<{ field: string; code: string; message: string; suggestions?: string[] }> =
      [];
    const warnings: Array<{ field: string; message: string }> = [];

    // Validate required fields
    if (!reference_point) {
      errors.push({
        field: "reference_point",
        code: MCPErrorCode.VALIDATION_REQUIRED_FIELD,
        message: "reference_point is required",
      });
    }
    if (!summary_caption) {
      errors.push({
        field: "summary_caption",
        code: MCPErrorCode.VALIDATION_REQUIRED_FIELD,
        message: "summary_caption is required",
      });
    }
    if (!status_snapshot) {
      errors.push({
        field: "status_snapshot",
        code: MCPErrorCode.VALIDATION_REQUIRED_FIELD,
        message: "status_snapshot is required",
      });
    } else if (!status_snapshot.next_action) {
      errors.push({
        field: "status_snapshot.next_action",
        code: MCPErrorCode.VALIDATION_INVALID_STATUS,
        message: "status_snapshot.next_action is required",
      });
    }
    if (!module_scope) {
      errors.push({
        field: "module_scope",
        code: MCPErrorCode.VALIDATION_REQUIRED_FIELD,
        message: "module_scope is required",
      });
    } else if (!Array.isArray(module_scope) || module_scope.length === 0) {
      errors.push({
        field: "module_scope",
        code: MCPErrorCode.VALIDATION_EMPTY_MODULE_SCOPE,
        message: "module_scope must be a non-empty array of module IDs",
      });
    }

    // Check for Jira ID format (warning only, not blocking)
    if (jira && typeof jira === "string") {
      // Basic check: should look like PROJECT-123 or similar
      if (!/^[A-Z][A-Z0-9]+-\d+$/i.test(jira)) {
        warnings.push({
          field: "jira",
          message: `Jira ID format not recognized. Expected format: PROJECT-123 (got: "${jira}")`,
        });
      }
    }

    // Validate module IDs against policy (if available and module_scope is valid)
    if (this.policy && module_scope && Array.isArray(module_scope) && module_scope.length > 0) {
      try {
        const validationResult = await validateModuleIds(module_scope, this.policy);

        if (!validationResult.valid && validationResult.errors) {
          // Convert ModuleIdError to our error format
          for (const err of validationResult.errors) {
            errors.push({
              field: "module_scope",
              code: MCPErrorCode.VALIDATION_INVALID_MODULE_ID,
              message: err.message,
              suggestions: err.suggestions,
            });
          }
        }
      } catch (error: unknown) {
        // If module validation fails unexpectedly, add it as an error
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          field: "module_scope",
          code: MCPErrorCode.VALIDATION_INVALID_MODULE_ID,
          message: `Module validation failed: ${errorMessage}`,
        });
      }
    } else if (!this.policy && module_scope && Array.isArray(module_scope)) {
      // No policy loaded - add a warning
      warnings.push({
        field: "module_scope",
        message: "Policy not loaded - module IDs cannot be validated",
      });
    }

    // Check image format (basic validation without decoding)
    if (images && Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.data || typeof img.data !== "string") {
          errors.push({
            field: `images[${i}].data`,
            code: MCPErrorCode.VALIDATION_INVALID_IMAGE,
            message: "Image data must be a base64-encoded string",
          });
        }
        if (!img.mime_type || typeof img.mime_type !== "string") {
          errors.push({
            field: `images[${i}].mime_type`,
            code: MCPErrorCode.VALIDATION_INVALID_IMAGE,
            message: "Image mime_type is required",
          });
        } else if (
          !["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"].includes(
            img.mime_type
          )
        ) {
          warnings.push({
            field: `images[${i}].mime_type`,
            message: `Uncommon MIME type: ${img.mime_type}. Supported types: image/png, image/jpeg, image/jpg, image/gif, image/webp`,
          });
        }
      }
    }

    // Build response
    const valid = errors.length === 0;

    if (valid) {
      // Success response with warnings if any
      let text = "✅ Validation passed - input is valid for remember\n";
      if (warnings.length > 0) {
        text += "\n⚠️  Warnings:\n";
        for (const warning of warnings) {
          text += `  - ${warning.field}: ${warning.message}\n`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } else {
      // Error response with structured errors
      let text = "❌ Validation failed\n\n";
      text += "Errors:\n";
      for (const error of errors) {
        text += `  - ${error.field}: ${error.message}\n`;
        if (error.suggestions && error.suggestions.length > 0) {
          text += `    Suggestions: ${error.suggestions.join(", ")}\n`;
        }
      }

      if (warnings.length > 0) {
        text += "\nWarnings:\n";
        for (const warning of warnings) {
          text += `  - ${warning.field}: ${warning.message}\n`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    }
  }

  /**
   * Handle mcp_lex_frame_recall tool - search Frames with Atlas Frame
   */
  private async handleRecall(args: Record<string, unknown>): Promise<MCPResponse> {
    const {
      reference_point,
      jira,
      branch,
      limit = 10,
      format = "full",
      mode = "all",
    } = args as unknown as RecallArgs;

    // Track search timing for metadata (AX #578)
    const searchStart = Date.now();

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
    let matchStrategy: string;
    try {
      // Build search criteria based on provided parameters
      const criteria: FrameSearchCriteria = { limit };

      if (reference_point) {
        // Use FTS5 full-text search for reference_point
        criteria.query = reference_point;
        criteria.mode = mode;
        frames = await this.frameStore.searchFrames(criteria);
        matchStrategy = mode === "any" ? "fts:or" : "fts";
      } else if (jira) {
        // For jira/branch filtering, we need to search all and filter
        // The FrameStore interface doesn't have specific jira/branch methods
        // We'll use listFrames and filter in JavaScript
        const result = await this.frameStore.listFrames({ limit: MAX_FILTER_FETCH_LIMIT });
        frames = result.frames.filter((f) => f.jira === jira).slice(0, limit);
        matchStrategy = "filter:jira";
      } else if (branch) {
        // For branch filtering, search all and filter
        const result = await this.frameStore.listFrames({ limit: MAX_FILTER_FETCH_LIMIT });
        frames = result.frames.filter((f) => f.branch === branch).slice(0, limit);
        matchStrategy = "filter:branch";
      } else {
        frames = [];
        matchStrategy = "none";
      }
    } catch (error: unknown) {
      // FTS5 search can fail with special characters (e.g., "zzz-nonexistent-query-zzz")
      // Treat search errors as empty results rather than propagating the error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = error as any;
      if (err.code === "SQLITE_ERROR" || err.message?.includes("no such column")) {
        frames = [];
        matchStrategy = "fts";
      } else {
        throw error;
      }
    }

    // Calculate search timing and get total frame count (AX #578)
    const searchTimeMs = Date.now() - searchStart;
    const totalFrames = await this.getFrameCount();

    // Build search metadata (AX #578)
    const meta = {
      query: {
        reference_point: reference_point || null,
        jira: jira || null,
        branch: branch || null,
        limit,
      },
      searchTimeMs,
      totalFrames,
      matchStrategy,
      matchCount: frames.length,
      status: frames.length > 0 ? "success" : "no_matches",
    };

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
        data: { meta },
      };
    }

    // Handle compact format
    if (format === "compact") {
      const compactResult = compactFrameList(frames);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(compactResult, null, 2),
          },
        ],
        data: {
          frames: compactResult.frames,
          count: compactResult.count,
          ...(compactResult._truncated && { _truncated: true }),
          meta,
        },
      };
    }

    // Format results with Atlas Frame for each (full format)
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
      data: { meta },
    };
  }

  /**
   * Handle get_frame tool - retrieve a specific frame by ID
   */
  private async handleGetFrame(args: Record<string, unknown>): Promise<MCPResponse> {
    const { frame_id, include_atlas = true, format = "full" } = args as unknown as GetFrameArgs;

    // Validate required field
    if (!frame_id) {
      throw new MCPError(
        MCPErrorCode.VALIDATION_REQUIRED_FIELD,
        "Missing required field: frame_id",
        { missingFields: ["frame_id"] }
      );
    }

    // Retrieve the frame by ID
    const frame = await this.frameStore.getFrameById(frame_id);

    if (!frame) {
      throw new MCPError(MCPErrorCode.STORAGE_FRAME_NOT_FOUND, `Frame not found: ${frame_id}`, {
        frameId: frame_id,
      });
    }

    // Handle compact format
    if (format === "compact") {
      const compactResult = compactFrame(frame);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(compactResult, null, 2),
          },
        ],
        data: compactResult as unknown as Record<string, unknown>,
      };
    }

    // Format the frame data (full format)
    const nextAction = frame.status_snapshot?.next_action || "None specified";
    const blockers = frame.status_snapshot?.blockers || [];
    const mergeBlockers = frame.status_snapshot?.merge_blockers || [];
    const testsFailing = frame.status_snapshot?.tests_failing || [];

    let result =
      `✅ Frame retrieved: ${frame.id}\n` +
      `📍 Reference: ${frame.reference_point}\n` +
      `💬 Summary: ${frame.summary_caption}\n` +
      `📦 Modules: ${frame.module_scope.join(", ")}\n` +
      `🌿 Branch: ${frame.branch}\n` +
      `${frame.jira ? `🎫 Jira: ${frame.jira}\n` : ""}` +
      `📅 Timestamp: ${frame.timestamp}\n` +
      `\nStatus:\n` +
      `  ⏭️  Next Action: ${nextAction}\n` +
      `  🚫 Blockers (${blockers.length}): ${blockers.join(", ") || "none"}\n` +
      `  ⛔ Merge Blockers (${mergeBlockers.length}): ${mergeBlockers.join(", ") || "none"}\n` +
      `  ❌ Tests Failing (${testsFailing.length}): ${testsFailing.join(", ") || "none"}\n` +
      `${frame.keywords ? `🏷️  Keywords: ${frame.keywords.join(", ")}\n` : ""}` +
      `${frame.atlas_frame_id ? `🗺️  Atlas: ${frame.atlas_frame_id}\n` : ""}`;

    // Include Atlas Frame if requested
    if (include_atlas) {
      const atlasFrame = generateAtlasFrame(frame.module_scope);
      const atlasOutput = formatAtlasFrame(atlasFrame);
      result += `\n${atlasOutput}`;
    }

    return {
      content: [
        {
          type: "text",
          text: result,
        },
      ],
      data: {
        frame_id: frame.id,
        timestamp: frame.timestamp,
      },
    };
  }

  /**
   * Handle mcp_lex_frame_list tool - list recent Frames
   */
  private async handleListFrames(args: Record<string, unknown>): Promise<MCPResponse> {
    const {
      branch,
      module,
      limit = 10,
      since,
      cursor,
      format = "full",
    } = args as unknown as ListFramesArgs;

    // Get frames using frameStore.listFrames with new pagination API
    // Note: When filters are applied (branch, module, since), we need to fetch more
    // frames than the limit to account for filtering. However, cursor pagination
    // doesn't work well with post-fetch filtering. For now, we'll fetch a large
    // batch when filters are present.
    const needsFiltering = branch || module || since;
    const fetchLimit = needsFiltering ? MAX_FILTER_FETCH_LIMIT : limit;

    const result = await this.frameStore.listFrames({
      limit: fetchLimit,
      cursor: cursor,
    });

    let frames = result.frames;

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

    // Apply limit after filtering (if we fetched more due to filters)
    if (needsFiltering) {
      frames = frames.slice(0, limit);
    }

    if (frames.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "📋 No Frames found matching criteria.",
          },
        ],
        data: {
          page: {
            limit: result.page.limit,
            nextCursor: null,
            hasMore: false,
          },
          order: result.order,
        },
      };
    }

    // Handle compact format
    if (format === "compact") {
      const compactResult = compactFrameList(frames);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(compactResult, null, 2),
          },
        ],
        data: {
          frames: compactResult.frames,
          count: compactResult.count,
          ...(compactResult._truncated && { _truncated: true }),
          page: needsFiltering
            ? {
                limit: result.page.limit,
                nextCursor: null,
                hasMore: false,
              }
            : result.page,
          order: result.order,
        },
      };
    }

    // Format results with Atlas Frame for each (full format)
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

    // Add pagination info to the output
    let paginationInfo = `\n\n📄 Pagination:\n`;
    paginationInfo += `   Limit: ${result.page.limit}\n`;
    paginationInfo += `   Has More: ${result.page.hasMore}\n`;
    if (result.page.nextCursor) {
      paginationInfo += `   Next Cursor: ${result.page.nextCursor}\n`;
    }
    paginationInfo += `   Order: ${result.order.by} ${result.order.direction}`;

    return {
      content: [
        {
          type: "text",
          text: `📋 Recent Frames (${frames.length}):\n${results}${paginationInfo}`,
        },
      ],
      data: {
        // Note: Cursor pagination is disabled when filters (branch, module, since) are applied
        // because post-fetch filtering makes it impossible to generate accurate nextCursor values.
        // In this case, all matching results are fetched and sliced client-side.
        page: needsFiltering
          ? {
              limit: result.page.limit,
              nextCursor: null,
              hasMore: false,
            }
          : result.page,
        order: result.order,
      },
    };
  }

  /**
   * Handle mcp_lex_policy_check tool - validate policy file
   */
  private async handlePolicyCheck(args: Record<string, unknown>): Promise<MCPResponse> {
    const { path: checkPath, policyPath, strict = false } = args as unknown as PolicyCheckArgs;

    try {
      // Resolve policy path - if checkPath is provided, resolve policyPath relative to it
      let resolvedPolicyPath: string | undefined = policyPath;
      if (checkPath && policyPath) {
        const { resolve, isAbsolute } = await import("path");
        if (!isAbsolute(policyPath)) {
          resolvedPolicyPath = resolve(checkPath, policyPath);
        }
      }

      // Load policy file
      const policy: Policy = loadPolicy(resolvedPolicyPath);

      // Validate schema
      const validation = validatePolicySchema(policy);

      // Prepare result
      const valid = strict
        ? validation.valid && validation.warnings.length === 0
        : validation.valid;

      // Format output
      let output = "";

      if (valid) {
        output += `✅ Policy valid: ${validation.moduleCount} modules defined\n`;
      } else {
        output += `❌ Policy invalid: ${validation.errors.length} error(s) found\n`;
      }

      // Add errors
      if (validation.errors.length > 0) {
        output += "\nErrors:\n";
        for (const error of validation.errors) {
          output += `  ❌ ${error.path}: ${error.message}\n`;
        }
      }

      // Add warnings
      if (validation.warnings.length > 0) {
        output += "\nWarnings:\n";
        for (const warning of validation.warnings) {
          output += `  ⚠️  ${warning.path}: ${warning.message}\n`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: output,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // If it's already an MCPError, rethrow it
      if (error instanceof MCPError) {
        throw error;
      }

      // Check if it's a file not found error
      if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
        throw new MCPError(
          MCPErrorCode.POLICY_NOT_FOUND,
          `Policy file not found: ${errorMessage}`,
          { policyPath }
        );
      }

      // Otherwise, it's an invalid policy
      throw new MCPError(MCPErrorCode.POLICY_INVALID, `Policy validation failed: ${errorMessage}`, {
        policyPath,
      });
    }
  }

  /**
   * Handle mcp_lex_frame_timeline tool - show timeline of Frame evolution
   */
  private async handleTimeline(args: Record<string, unknown>): Promise<MCPResponse> {
    const { ticketOrBranch, since, until, format = "text" } = args as unknown as TimelineArgs;

    // Validate required parameter
    if (!ticketOrBranch) {
      throw new MCPError(
        MCPErrorCode.VALIDATION_REQUIRED_FIELD,
        "Missing required field: ticketOrBranch",
        { missingFields: ["ticketOrBranch"] }
      );
    }

    try {
      // Get all frames and filter by Jira ticket or branch
      const listResult = await this.frameStore.listFrames();

      let frames: Frame[] = [];
      let title: string;

      // Try to find frames by Jira ticket first
      const framesByJira = listResult.frames.filter((f) => f.jira === ticketOrBranch);
      if (framesByJira.length > 0) {
        frames = framesByJira;
        title = `${ticketOrBranch}: Timeline`;
      } else {
        // Try by branch name
        const framesByBranch = listResult.frames.filter((f) => f.branch === ticketOrBranch);
        if (framesByBranch.length > 0) {
          frames = framesByBranch;
          title = `Branch ${ticketOrBranch}: Timeline`;
        } else {
          // No frames found
          title = `${ticketOrBranch}: Timeline`;
        }
      }

      if (frames.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                `🔍 No frames found for: "${ticketOrBranch}"\n\n` +
                "Try using a Jira ticket ID (e.g., TICKET-123) or a branch name.\n" +
                "Run 'mcp_lex_frame_remember' to create a frame first.",
            },
          ],
        };
      }

      // Build timeline
      let timelineData = buildTimeline(frames);

      // Apply filters
      const timelineOptions: TimelineOptions = {
        format: format as "text" | "json",
      };

      if (since) {
        timelineOptions.since = new Date(since);
      }

      if (until) {
        timelineOptions.until = new Date(until);
      }

      if (timelineOptions.since || timelineOptions.until) {
        timelineData = filterTimeline(timelineData, timelineOptions);

        if (timelineData.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  "🔍 No frames found in the specified date range.\n\n" +
                  "Try widening the date range or remove date filters.",
              },
            ],
          };
        }
      }

      // Render timeline based on format
      let result: string;

      switch (format) {
        case "compact": {
          // Compact format: return compact frames with timeline metadata
          const compactResult = compactFrameList(frames);
          const timelineMetadata = {
            title,
            count: frames.length,
            firstTimestamp: frames[frames.length - 1]?.timestamp,
            lastTimestamp: frames[0]?.timestamp,
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    frames: compactResult.frames,
                    count: compactResult.count,
                    ...(compactResult._truncated && { _truncated: true }),
                    timeline: timelineMetadata,
                  },
                  null,
                  2
                ),
              },
            ],
            data: {
              frames: compactResult.frames,
              count: compactResult.count,
              ...(compactResult._truncated && { _truncated: true }),
              timeline: timelineMetadata,
            },
          };
        }
        case "json":
          result = renderTimelineJSON(timelineData);
          break;
        case "text":
        default:
          result = renderTimelineText(timelineData, title);
          result += renderModuleScopeEvolution(timelineData);
          result += renderBlockerTracking(timelineData);
          break;
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MCPError(
        MCPErrorCode.INTERNAL_ERROR,
        `Failed to generate timeline: ${errorMessage}`,
        { ticketOrBranch, error: errorMessage }
      );
    }
  }

  /**
   * Handle mcp_lex_atlas_analyze tool - analyze code structure and dependencies
   */
  private async handleCodeAtlas(args: Record<string, unknown>): Promise<MCPResponse> {
    const {
      path: requestPath,
      foldRadius: _foldRadius,
      maxTokens: _maxTokens,
    } = args as unknown as CodeAtlasArgs;

    // Use provided path or current directory
    const repoPath = requestPath || this.repoRoot || process.cwd();

    try {
      // Import spawnSync to run the CLI
      const { spawnSync } = await import("child_process");

      // Run the code-atlas CLI command
      const result = spawnSync("npx", ["lex", "code-atlas", "--repo", repoPath, "--json"], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (result.error) {
        throw new MCPError(
          MCPErrorCode.INTERNAL_ERROR,
          `Failed to execute code-atlas: ${result.error.message}`,
          { path: repoPath }
        );
      }

      if (result.status !== 0) {
        const errorMsg = result.stderr || result.stdout || "Code atlas generation failed";
        throw new MCPError(
          MCPErrorCode.INTERNAL_ERROR,
          `Code atlas generation failed: ${errorMsg}`,
          { path: repoPath }
        );
      }

      // Parse the JSON output
      let output;
      try {
        output = JSON.parse(result.stdout);
      } catch (parseError) {
        throw new MCPError(
          MCPErrorCode.INTERNAL_ERROR,
          `Failed to parse code-atlas output: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
          { path: repoPath }
        );
      }

      const { run, units } = output;

      // Format the output for MCP response
      const summary =
        `🗺️  Code Atlas Generated\n` +
        `📍 Repository: ${run.repoId}\n` +
        `📁 Files scanned: ${run.filesScanned.length}${
          run.truncated ? ` (truncated from ${run.filesRequested.length})` : ""
        }\n` +
        `🔍 Units extracted: ${run.unitsEmitted}\n` +
        `⚙️  Strategy: ${run.strategy}\n` +
        `📅 Created: ${run.createdAt}\n\n`;

      // Group units by file for better readability
      const unitsByFile = new Map<string, typeof units>();
      for (const unit of units) {
        const existing = unitsByFile.get(unit.filePath) || [];
        existing.push(unit);
        unitsByFile.set(unit.filePath, existing);
      }

      let unitsOutput = "📦 Extracted Units:\n";
      let fileCount = 0;
      for (const [filePath, fileUnits] of unitsByFile) {
        fileCount++;
        unitsOutput += `\n${fileCount}. ${filePath} (${fileUnits.length} units)\n`;
        for (const unit of fileUnits) {
          unitsOutput += `   - ${unit.kind}: ${unit.name} (lines ${unit.span.startLine}-${unit.span.endLine})\n`;
        }
        // Limit output to avoid overwhelming the response
        if (fileCount >= 20) {
          const remainingFiles = unitsByFile.size - fileCount;
          if (remainingFiles > 0) {
            unitsOutput += `\n... and ${remainingFiles} more files\n`;
          }
          break;
        }
      }

      // Include raw data as JSON for programmatic access
      const jsonOutput = `\n📄 Full Output (JSON):\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``;

      return {
        content: [
          {
            type: "text",
            text: summary + unitsOutput + jsonOutput,
          },
        ],
      };
    } catch (error: unknown) {
      // Handle errors from code atlas generation
      if (error instanceof MCPError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MCPError(
        MCPErrorCode.INTERNAL_ERROR,
        `Failed to generate code atlas: ${errorMessage}`,
        { path: requestPath, error: errorMessage }
      );
    }
  }

  /**
   * Handle introspect tool - discover current Lex state
   */
  private async handleIntrospect(args: Record<string, unknown>): Promise<MCPResponse> {
    const { format = "full" } = args as unknown as IntrospectArgs;

    try {
      // Get version from package.json
      // Navigate up from dist/memory/mcp_server/server.js to package.json
      const packageJsonPath = join(process.cwd(), "package.json");
      let version = "unknown";
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
        version = packageJson.version || "unknown";
      } catch {
        // If we can't read package.json, version stays "unknown"
      }

      // Get policy information
      const policyData: { modules: string[]; moduleCount: number } | null = this.policy
        ? {
            modules: Object.keys(this.policy.modules).sort(),
            moduleCount: Object.keys(this.policy.modules).length,
          }
        : null;

      // Get state information
      const result = await this.frameStore.listFrames({ limit: 1 });
      const frameCount = await this.getFrameCount();
      const latestFrame = result.frames.length > 0 ? result.frames[0].timestamp : null;

      // Get current branch (if available)
      let currentBranch = "unknown";
      try {
        if (this.repoRoot || process.env.LEX_DEFAULT_BRANCH) {
          currentBranch = getCurrentBranch();
        }
      } catch {
        // If we can't get branch, keep "unknown"
      }

      // Capabilities
      const capabilities = {
        // SQLite database with better-sqlite3-multiple-ciphers supports encryption
        // (though encryption may not be active for all databases)
        encryption: this.db !== null,
        images: this.imageManager !== null,
      };

      // Error codes - get all MCPErrorCode values and sort for deterministic ordering
      const errorCodes = Object.values(MCPErrorCode).sort();

      // Build error code metadata map for introspection
      const errorCodeMetadata: Record<string, { category: string; retryable: boolean }> = {};
      for (const code of errorCodes) {
        errorCodeMetadata[code] = MCP_ERROR_METADATA[code as MCPErrorCode];
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
          // Abbreviate error codes and re-sort (abbreviation changes alphabetical order)
          errs: errorCodes.map((code) => this.abbreviateErrorCode(code)).sort(),
        };

        // Add capability abbreviations in deterministic order
        if (capabilities.encryption) compactResponse.caps.push("enc");
        if (capabilities.images) compactResponse.caps.push("img");
        compactResponse.caps.sort();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(compactResponse, null, 2),
            },
          ],
          data: compactResponse,
        };
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

        // Format human-readable output
        let text = `🔍 Lex Introspection\n\n`;
        text += `📐 Schema Version: ${schemaVersion}\n`;
        text += `📦 Version: ${version}\n\n`;

        if (policyData) {
          text += `📋 Policy:\n`;
          text += `  Modules: ${policyData.moduleCount}\n`;
          text += `  Module IDs: ${policyData.modules.join(", ")}\n\n`;
        } else {
          text += `📋 Policy: Not loaded\n\n`;
        }

        text += `📊 State:\n`;
        text += `  Frames: ${frameCount}\n`;
        text += `  Latest Frame: ${latestFrame || "none"}\n`;
        text += `  Branch: ${currentBranch}\n\n`;

        text += `⚙️  Capabilities:\n`;
        text += `  Encryption: ${capabilities.encryption ? "✅" : "❌"}\n`;
        text += `  Images: ${capabilities.images ? "✅" : "❌"}\n\n`;

        text += `🚨 Error Codes (${errorCodes.length}):\n`;
        // Group by category for better readability
        const byCategory: Record<string, string[]> = {
          validation: [],
          storage: [],
          policy: [],
          internal: [],
        };
        for (const code of errorCodes) {
          const metadata = errorCodeMetadata[code];
          byCategory[metadata.category].push(code);
        }
        for (const [category, codes] of Object.entries(byCategory)) {
          if (codes.length > 0) {
            const retryableCount = codes.filter((c) => errorCodeMetadata[c].retryable).length;
            text += `  ${category.toUpperCase()} (${codes.length}, ${retryableCount} retryable):\n`;
            text += `    ${codes.join(", ")}\n`;
          }
        }

        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
          data: fullResponse,
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new MCPError(MCPErrorCode.INTERNAL_ERROR, `Failed to introspect: ${errorMessage}`, {
        error: errorMessage,
      });
    }
  }

  /**
   * Abbreviate error code for compact format
   * Uses a deterministic mapping to avoid collisions
   * Example: VALIDATION_REQUIRED_FIELD -> VAL_REQ_FIE
   */
  private abbreviateErrorCode(code: string): string {
    const parts = code.split("_");
    if (parts.length === 1) return code.substring(0, 3).toUpperCase();
    if (parts.length === 2) {
      // Two parts: use first 3 of each
      return `${parts[0].substring(0, 3)}_${parts[1].substring(0, 3)}`.toUpperCase();
    }
    // Three or more parts: use first, second, and last for consistency
    const first = parts[0].substring(0, 3).toUpperCase();
    const second = parts[1].substring(0, 3).toUpperCase();
    const last = parts[parts.length - 1].substring(0, 3).toUpperCase();
    return `${first}_${second}_${last}`;
  }

  /**
   * Handle help tool - self-documentation for Lex MCP tools (AX #577)
   *
   * Returns structured help including:
   * - Tool descriptions and required fields
   * - Executable examples
   * - Related tools for common workflows
   * - Common workflow patterns
   * - Naming convention guidance (AX-014)
   */
  private async handleHelp(args: Record<string, unknown>): Promise<MCPResponse> {
    const {
      tool,
      examples = true,
      format = "full",
    } = args as {
      tool?: string;
      examples?: boolean;
      format?: string;
    };

    // Define tool help data (using standardized names per ADR-0009)
    const toolHelp: Record<
      string,
      {
        description: string;
        requiredFields: string[];
        optionalFields: string[];
        examples: Array<{ description: string; input: Record<string, unknown> }>;
        microExamples?: Record<string, { in: string; out: string }>;
        relatedTools: string[];
        workflows: string[];
        deprecatedAliases?: string[];
      }
    > = {
      frame_create: {
        description:
          "Store a Frame (episodic memory snapshot) capturing your current work context.",
        requiredFields: ["reference_point", "summary_caption", "status_snapshot", "module_scope"],
        optionalFields: ["branch", "jira", "keywords", "atlas_frame_id", "images"],
        examples: [
          {
            description: "Store work session for authentication refactoring",
            input: {
              reference_point: "Refactoring UserAuth module",
              summary_caption: "Extracted password validation to separate function",
              status_snapshot: {
                next_action: "Add unit tests for new function",
                blockers: [],
                tests_failing: [],
              },
              module_scope: ["memory/store"],
              jira: "AUTH-123",
              keywords: ["refactoring", "authentication"],
            },
          },
          {
            description: "Store debugging session with blockers",
            input: {
              reference_point: "Debugging memory leak in Frame store",
              summary_caption: "Identified leak in SQLite connection pool",
              status_snapshot: {
                next_action: "Review connection cleanup logic",
                blockers: ["Need access to production logs"],
                merge_blockers: ["Waiting for security review"],
              },
              module_scope: ["memory/store", "memory/frames"],
            },
          },
        ],
        microExamples: {
          "store-work": {
            in: "{ref:'Refactoring auth',cap:'Extracted validation',status:{next:'Add tests'},mods:['memory/store']}",
            out: "{ok:true,id:'frame_abc123'}",
          },
          "with-blocker": {
            in: "{ref:'Debug leak',cap:'Found in pool',status:{next:'Review cleanup',blockers:['Need prod logs']},mods:['memory/store']}",
            out: "{ok:true,id:'frame_xyz789'}",
          },
        },
        relatedTools: ["frame_search", "frame_list", "frame_validate"],
        workflows: ["store-then-recall", "timeline-tracking", "validate-before-store"],
        deprecatedAliases: ["remember"],
      },
      frame_validate: {
        description:
          "Validate frame input without storing (dry-run). Use to check inputs before committing.",
        requiredFields: ["reference_point", "summary_caption", "status_snapshot", "module_scope"],
        optionalFields: ["branch", "jira", "keywords", "atlas_frame_id", "images"],
        examples: [
          {
            description: "Validate input before storing",
            input: {
              reference_point: "Test reference",
              summary_caption: "Test summary",
              status_snapshot: { next_action: "Continue testing" },
              module_scope: ["memory/store"],
            },
          },
        ],
        microExamples: {
          validate: {
            in: "{ref:'Test ref',cap:'Test summary',status:{next:'Continue testing'},mods:['memory/store']}",
            out: "{ok:true,valid:true}",
          },
        },
        relatedTools: ["frame_create"],
        workflows: ["validate-before-store"],
        deprecatedAliases: ["validate_remember"],
      },
      frame_search: {
        description:
          "Search Frames by reference point, branch, or Jira ticket. Returns matching Frames with Atlas neighborhoods.",
        requiredFields: [],
        optionalFields: ["reference_point", "jira", "branch", "limit"],
        examples: [
          {
            description: "Search by topic",
            input: { reference_point: "authentication refactoring" },
          },
          {
            description: "Filter by Jira ticket",
            input: { jira: "AUTH-123" },
          },
          {
            description: "Filter by branch with limit",
            input: { branch: "feature/auth-refactor", limit: 5 },
          },
        ],
        microExamples: {
          "by-topic": {
            in: "{ref:'authentication refactoring'}",
            out: "{frames:[{id:'f1',ref:'Refactoring auth',cap:'Done'}]}",
          },
          "by-jira": {
            in: "{jira:'AUTH-123'}",
            out: "{frames:[{id:'f2',jira:'AUTH-123'}]}",
          },
          "by-branch": {
            in: "{branch:'feature/auth',limit:5}",
            out: "{frames:[{id:'f3',branch:'feature/auth'}]}",
          },
        },
        relatedTools: ["frame_create", "frame_list", "frame_get"],
        workflows: ["store-then-recall", "context-recovery"],
        deprecatedAliases: ["recall"],
      },
      frame_get: {
        description:
          "Retrieve a specific frame by ID. Use when you know the exact frame ID from a previous response.",
        requiredFields: ["frame_id"],
        optionalFields: ["include_atlas"],
        examples: [
          {
            description: "Get frame by ID",
            input: { frame_id: "frame-abc123" },
          },
          {
            description: "Get frame without Atlas neighborhood",
            input: { frame_id: "frame-abc123", include_atlas: false },
          },
        ],
        microExamples: {
          "get-by-id": {
            in: "{frame_id:'frame-abc123'}",
            out: "{frame:{id:'frame-abc123',ref:'Auth work',cap:'Done'}}",
          },
          "no-atlas": {
            in: "{frame_id:'frame-abc123',include_atlas:false}",
            out: "{frame:{id:'frame-abc123',ref:'Auth work'}}",
          },
        },
        relatedTools: ["frame_search", "frame_list"],
        workflows: ["direct-frame-access"],
        deprecatedAliases: ["get_frame"],
      },
      frame_list: {
        description:
          "List recent Frames, optionally filtered by branch or module. Good for getting an overview.",
        requiredFields: [],
        optionalFields: ["branch", "module", "limit", "since"],
        examples: [
          {
            description: "List recent frames",
            input: { limit: 10 },
          },
          {
            description: "List frames for a specific branch",
            input: { branch: "main", limit: 5 },
          },
          {
            description: "List frames since a date",
            input: { since: "2024-01-01T00:00:00Z" },
          },
        ],
        microExamples: {
          recent: {
            in: "{limit:10}",
            out: "{frames:[{id:'f1',ref:'Recent work'}]}",
          },
          "by-branch": {
            in: "{branch:'main',limit:5}",
            out: "{frames:[{id:'f2',branch:'main'}]}",
          },
          "by-date": {
            in: "{since:'2024-01-01T00:00:00Z'}",
            out: "{frames:[{id:'f3',created:'2024-01-15'}]}",
          },
        },
        relatedTools: ["frame_search", "timeline_show"],
        workflows: ["timeline-tracking", "context-recovery"],
        deprecatedAliases: ["list_frames"],
      },
      policy_check: {
        description:
          "Validate code against policy rules from lexmap.policy.json. Checks module boundaries and dependencies.",
        requiredFields: [],
        optionalFields: ["path", "policyPath", "strict"],
        examples: [
          {
            description: "Check current directory",
            input: {},
          },
          {
            description: "Check specific path with strict mode",
            input: { path: "./src", strict: true },
          },
        ],
        microExamples: {
          "check-current": {
            in: "{}",
            out: "{ok:true,violations:[]}",
          },
          "check-path": {
            in: "{path:'./src',strict:true}",
            out: "{ok:true,violations:[]}",
          },
        },
        relatedTools: ["system_introspect", "atlas_analyze"],
        workflows: ["pre-commit-check", "ci-validation"],
        deprecatedAliases: [],
      },
      timeline_show: {
        description:
          "Show visual timeline of Frame evolution for a ticket or branch. Great for understanding work history.",
        requiredFields: ["ticketOrBranch"],
        optionalFields: ["since", "until", "format"],
        examples: [
          {
            description: "Show timeline for a Jira ticket",
            input: { ticketOrBranch: "AUTH-123" },
          },
          {
            description: "Show timeline for a branch with date range",
            input: {
              ticketOrBranch: "feature/auth-refactor",
              since: "2024-01-01T00:00:00Z",
              format: "json",
            },
          },
        ],
        microExamples: {
          "by-jira": {
            in: "{ticketOrBranch:'AUTH-123'}",
            out: "{timeline:[{at:'2024-01-15',ref:'Started'}]}",
          },
          "by-branch": {
            in: "{ticketOrBranch:'feature/auth',since:'2024-01-01T00:00:00Z',format:'json'}",
            out: "{timeline:[{at:'2024-01-15',status:'In progress'}]}",
          },
        },
        relatedTools: ["frame_list", "frame_search"],
        workflows: ["timeline-tracking", "context-recovery"],
        deprecatedAliases: ["timeline"],
      },
      atlas_analyze: {
        description:
          "Analyze code structure and dependencies across modules. Visualizes the dependency graph.",
        requiredFields: [],
        optionalFields: ["seedModules", "foldRadius"],
        examples: [
          {
            description: "Analyze memory module dependencies",
            input: { seedModules: ["memory/store"], foldRadius: 2 },
          },
          {
            description: "Analyze multiple modules",
            input: { seedModules: ["memory/store", "memory/mcp"], foldRadius: 1 },
          },
        ],
        microExamples: {
          "single-module": {
            in: "{seedModules:['memory/store'],foldRadius:2}",
            out: "{graph:{nodes:['memory/store'],edges:[]}}",
          },
          "multi-module": {
            in: "{seedModules:['memory/store','memory/mcp'],foldRadius:1}",
            out: "{graph:{nodes:['memory/store','memory/mcp']}}",
          },
        },
        relatedTools: ["policy_check", "system_introspect"],
        workflows: ["dependency-analysis", "refactoring-planning"],
        deprecatedAliases: ["code_atlas"],
      },
      system_introspect: {
        description:
          "Discover the current state of Lex including available modules, policy, frame count, and error codes.",
        requiredFields: [],
        optionalFields: ["format"],
        examples: [
          {
            description: "Get full introspection",
            input: {},
          },
          {
            description: "Get compact format for small-context agents",
            input: { format: "compact" },
          },
        ],
        microExamples: {
          full: {
            in: "{}",
            out: "{modules:['memory','policy'],frameCount:42}",
          },
          compact: {
            in: "{format:'compact'}",
            out: "{mods:['memory','policy'],frames:42}",
          },
        },
        relatedTools: ["help", "policy_check"],
        workflows: ["initial-discovery", "error-handling"],
        deprecatedAliases: ["introspect"],
      },
      help: {
        description:
          "Get usage help for Lex MCP tools including examples, required fields, and workflows.",
        requiredFields: [],
        optionalFields: ["tool", "examples", "format"],
        examples: [
          {
            description: "Get help for all tools",
            input: {},
          },
          {
            description: "Get help for a specific tool",
            input: { tool: "frame_create" },
          },
          {
            description: "Get help without examples",
            input: { tool: "frame_search", examples: false },
          },
        ],
        microExamples: {
          "all-tools": {
            in: "{}",
            out: "{tools:{frame_create:{desc:'Store frame'}}}",
          },
          "single-tool": {
            in: "{tool:'frame_create'}",
            out: "{tool:'frame_create',desc:'Store frame'}",
          },
          "no-examples": {
            in: "{tool:'frame_search',examples:false}",
            out: "{tool:'frame_search',desc:'Search frames'}",
          },
          micro: {
            in: "{tool:'frame_create',format:'micro'}",
            out: "{microExamples:{'store-work':{in:'...',out:'...'}}}",
          },
        },
        relatedTools: ["system_introspect"],
        workflows: ["initial-discovery"],
        deprecatedAliases: [],
      },
      hints_get: {
        description: "Retrieve hint details by hint ID for error recovery guidance.",
        requiredFields: ["hintIds"],
        optionalFields: [],
        examples: [
          {
            description: "Get hints by IDs",
            input: { hintIds: ["hint_mod_invalid_001"] },
          },
        ],
        microExamples: {
          "get-hints": {
            in: "{hintIds:['hint_mod_invalid_001']}",
            out: "{hints:{'hint_mod_invalid_001':{text:'...',actions:[...]}}}",
          },
        },
        relatedTools: ["system_introspect"],
        workflows: ["error-handling"],
        deprecatedAliases: ["get_hints"],
      },
    };

    // Define workflow descriptions (updated tool names)
    const workflows: Record<
      string,
      {
        description: string;
        steps: string[];
        tools: string[];
      }
    > = {
      "store-then-recall": {
        description: "Store work context and retrieve it later",
        steps: [
          "Use `frame_create` to store your current work context",
          "Use `frame_search` with reference_point to find it later",
          "Optionally use `frame_get` if you have the exact frame ID",
        ],
        tools: ["frame_create", "frame_search", "frame_get"],
      },
      "timeline-tracking": {
        description: "Track work evolution over time for a ticket or branch",
        steps: [
          "Use `frame_create` regularly to capture work progress",
          "Use `timeline_show` to visualize the evolution",
          "Use `frame_list` to see recent work",
        ],
        tools: ["frame_create", "timeline_show", "frame_list"],
      },
      "validate-before-store": {
        description: "Validate inputs before committing to storage",
        steps: [
          "Use `frame_validate` to check your inputs",
          "Fix any validation errors",
          "Use `frame_create` to store the validated frame",
        ],
        tools: ["frame_validate", "frame_create"],
      },
      "context-recovery": {
        description: "Recover context when resuming work",
        steps: [
          "Use `frame_search` to search for relevant frames",
          "Use `timeline_show` to see work history",
          "Use `frame_get` to get detailed frame content",
        ],
        tools: ["frame_search", "timeline_show", "frame_get"],
      },
      "initial-discovery": {
        description: "Discover Lex capabilities when starting",
        steps: [
          "Use `help` to understand available tools",
          "Use `system_introspect` to see system state and available modules",
          "Use `frame_search` or `frame_list` to see existing memory",
        ],
        tools: ["help", "system_introspect", "frame_search", "frame_list"],
      },
      "dependency-analysis": {
        description: "Understand code structure and dependencies",
        steps: [
          "Use `system_introspect` to see available modules",
          "Use `atlas_analyze` to visualize dependencies",
          "Use `policy_check` to validate boundaries",
        ],
        tools: ["system_introspect", "atlas_analyze", "policy_check"],
      },
      "pre-commit-check": {
        description: "Validate code before committing",
        steps: [
          "Use `policy_check` to validate module boundaries",
          "Fix any policy violations",
          "Use `frame_create` to capture the work context",
        ],
        tools: ["policy_check", "frame_create"],
      },
    };

    // Build response based on requested tool
    if (tool) {
      // Get help for a specific tool
      const helpData = toolHelp[tool];
      if (!helpData) {
        throw new MCPError(MCPErrorCode.VALIDATION_INVALID_FORMAT, `Unknown tool: ${tool}`, {
          requestedTool: tool,
          availableTools: Object.keys(toolHelp),
        });
      }

      const response: Record<string, unknown> = {
        tool,
        description: helpData.description,
        requiredFields: helpData.requiredFields,
        optionalFields: helpData.optionalFields,
        relatedTools: helpData.relatedTools,
        workflows: helpData.workflows.map((w) => ({
          name: w,
          description: workflows[w]?.description || w,
        })),
      };

      if (examples) {
        if (format === "micro" && helpData.microExamples) {
          response.microExamples = helpData.microExamples;
        } else {
          response.examples = helpData.examples;
        }
      }

      // Format text output
      const textOutput = [`# ${tool}`, "", helpData.description, ""];

      // Add deprecated alias notice if applicable (AX-014)
      if (helpData.deprecatedAliases && helpData.deprecatedAliases.length > 0) {
        textOutput.push(
          "## Deprecated Aliases",
          helpData.deprecatedAliases
            .map((alias) => `  - \`${alias}\` (use \`${tool}\` instead)`)
            .join("\n"),
          "",
          "See ADR-0009 for the naming convention migration guide.",
          ""
        );
      }

      textOutput.push(
        "## Required Fields",
        helpData.requiredFields.length > 0
          ? helpData.requiredFields.map((f) => `  - ${f}`).join("\n")
          : "  (none)",
        "",
        "## Optional Fields",
        helpData.optionalFields.length > 0
          ? helpData.optionalFields.map((f) => `  - ${f}`).join("\n")
          : "  (none)",
        "",
        "## Related Tools",
        helpData.relatedTools.map((t) => `  - ${t}`).join("\n"),
        "",
        "## Workflows",
        helpData.workflows.map((w) => `  - ${w}: ${workflows[w]?.description || ""}`).join("\n")
      );

      if (examples) {
        if (format === "micro" && helpData.microExamples) {
          textOutput.push(
            "",
            "## Micro Examples",
            ...Object.entries(helpData.microExamples)
              .map(([name, example]) => [
                `**${name}**`,
                `  in:  ${example.in}`,
                `  out: ${example.out}`,
              ])
              .flat()
          );
        } else if (helpData.examples.length > 0) {
          textOutput.push(
            "",
            "## Examples",
            ...helpData.examples
              .map((ex, i) => [
                `### Example ${i + 1}: ${ex.description}`,
                "```json",
                JSON.stringify(ex.input, null, 2),
                "```",
              ])
              .flat()
          );
        }
      }

      return {
        content: [
          {
            type: "text",
            text: textOutput.join("\n"),
          },
        ],
        data: response,
      };
    } else {
      // Get help for all tools
      const response: Record<string, unknown> = {
        tools: Object.fromEntries(
          Object.entries(toolHelp).map(([name, data]) => {
            const toolData: Record<string, unknown> = {
              description: data.description,
              requiredFields: data.requiredFields,
              relatedTools: data.relatedTools,
            };
            if (examples && data.examples.length > 0) {
              toolData.examples = data.examples;
            }
            return [name, toolData];
          })
        ),
        workflows: Object.fromEntries(
          Object.entries(workflows).map(([name, data]) => [
            name,
            { description: data.description, tools: data.tools },
          ])
        ),
      };

      // Format text output
      const textOutput = [
        "# Lex MCP Tools Help",
        "",
        "## Naming Convention (ADR-0009)",
        "",
        "All tools follow the **resource_action** pattern for predictability:",
        "  - `frame_create` (create a frame)",
        "  - `frame_search` (search frames)",
        "  - `frame_list` (list frames)",
        "  - `frame_get` (get a specific frame)",
        "",
        "Old names (remember, recall, etc.) are deprecated but still work.",
        "You'll see deprecation warnings when using old names.",
        "",
        "## Available Tools",
        ...Object.entries(toolHelp).map(
          ([name, data]) => `  - **${name}**: ${data.description.split(".")[0]}`
        ),
        "",
        "## Common Workflows",
        ...Object.entries(workflows).map(([name, data]) => `  - **${name}**: ${data.description}`),
        "",
        'Use `help(tool: "<name>")` for detailed help on a specific tool.',
      ];

      return {
        content: [
          {
            type: "text",
            text: textOutput.join("\n"),
          },
        ],
        data: response,
      };
    }
  }

  /**
   * Get total frame count from database.
   * Uses FrameStore.getFrameCount() interface method.
   */
  private async getFrameCount(): Promise<number> {
    try {
      return await this.frameStore.getFrameCount();
    } catch {
      return 0;
    }
  }

  /**
   * Handle get_hints tool - retrieve hint details by hint IDs
   *
   * Per AX-012, provides cacheable advice snippets for error recovery.
   * Agents can fetch hints once and cache them to minimize token usage.
   */
  private async handleGetHints(args: Record<string, unknown>): Promise<MCPResponse> {
    const typedArgs = args as Partial<GetHintsArgs>;
    const { hintIds } = typedArgs;

    if (!hintIds || !Array.isArray(hintIds)) {
      throw new MCPError(MCPErrorCode.VALIDATION_REQUIRED_FIELD, "hintIds array is required", {
        field: "hintIds",
      });
    }

    if (hintIds.length === 0) {
      throw new MCPError(MCPErrorCode.VALIDATION_INVALID_FORMAT, "hintIds array cannot be empty", {
        field: "hintIds",
      });
    }

    // Import hint registry utilities
    const { getHints } = await import("../../shared/errors/hint-registry.js");

    const hints = getHints(hintIds);

    // Check which hints were not found
    const notFound = hintIds.filter((id) => !(id in hints));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              hints,
              ...(notFound.length > 0 && { notFound }),
            },
            null,
            2
          ),
        },
      ],
      data: {
        hints,
        ...(notFound.length > 0 && { notFound }),
      },
    };
  }

  /**
   * Handle db_stats tool - get database statistics
   */
  private async handleDbStats(args: Record<string, unknown>): Promise<MCPResponse> {
    const { detailed = false } = args as { detailed?: boolean };

    const { existsSync, statSync } = await import("fs");

    // Use the injected database, not the global singleton
    const db = this.db;
    if (!db) {
      throw new MCPError(
        MCPErrorCode.STORAGE_READ_FAILED,
        "No database connection available. Ensure the server was initialized with a SQLite store."
      );
    }

    // Get path from the actual database connection (better-sqlite3 exposes .name)
    const dbPath = db.name;

    // Check if database exists
    if (!existsSync(dbPath)) {
      throw new MCPError(
        MCPErrorCode.STORAGE_READ_FAILED,
        "Database not found. Run 'lex init' to create it.",
        {
          dbPath,
        }
      );
    }

    // Get file size
    const stats = statSync(dbPath);
    const sizeBytes = stats.size;
    const sizeMB = parseFloat((sizeBytes / (1024 * 1024)).toFixed(2));

    // Use curated query function for DB stats
    const dbStats = getDbStats(db, detailed);

    const result: Record<string, unknown> = {
      database: {
        path: dbPath,
        sizeBytes,
        sizeMB,
      },
      frames: {
        total: dbStats.totalFrames,
        thisWeek: dbStats.thisWeek,
        thisMonth: dbStats.thisMonth,
        dateRange: {
          oldest: dbStats.oldestDate,
          newest: dbStats.newestDate,
        },
      },
    };

    // Add module distribution if detailed and available
    if (dbStats.moduleDistribution) {
      result.moduleDistribution = dbStats.moduleDistribution;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      data: result,
    };
  }

  /**
   * Handle turncost_calculate tool - calculate turn cost metrics
   */
  private async handleTurncostCalculate(args: Record<string, unknown>): Promise<MCPResponse> {
    const { period = "24h" } = args as { period?: string };

    // Parse period to ISO timestamp
    let sinceTimestamp: string;

    if (period.match(/^\d{4}-\d{2}-\d{2}T/)) {
      // Already an ISO timestamp
      sinceTimestamp = period;
    } else {
      // Parse duration strings (e.g., "24h", "7d", "30d")
      const match = period.match(/^(\d+)(h|d|w|m)$/);
      if (!match) {
        throw new MCPError(
          MCPErrorCode.VALIDATION_INVALID_FORMAT,
          `Invalid period format: ${period}. Use format like "24h", "7d", "30d" or ISO 8601 timestamp`,
          { field: "period", provided: period }
        );
      }

      const value = parseInt(match[1], 10);
      const unit = match[2];
      const now = new Date();

      switch (unit) {
        case "h":
          now.setHours(now.getHours() - value);
          break;
        case "d":
          now.setDate(now.getDate() - value);
          break;
        case "w":
          now.setDate(now.getDate() - value * 7);
          break;
        case "m":
          now.setMonth(now.getMonth() - value);
          break;
      }

      sinceTimestamp = now.toISOString();
    }

    // Use the injected database, not the global singleton
    const { getTurnCostMetrics } = await import("../store/queries.js");

    const db = this.db;
    if (!db) {
      throw new MCPError(
        MCPErrorCode.STORAGE_READ_FAILED,
        "No database connection available. Ensure the server was initialized with a SQLite store."
      );
    }
    const metrics = getTurnCostMetrics(db, sinceTimestamp);

    const result = {
      period,
      since: sinceTimestamp,
      turnCost: {
        frames: metrics.frameCount,
        estimatedTokens: metrics.estimatedTokens,
        prompts: metrics.prompts,
      },
      derived: {
        avgTokensPerFrame:
          metrics.frameCount > 0 ? Math.round(metrics.estimatedTokens / metrics.frameCount) : 0,
      },
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      data: result,
    };
  }

  /**
   * Handle contradictions_scan tool - scan for frame contradictions
   */
  private async handleContradictionsScan(args: Record<string, unknown>): Promise<MCPResponse> {
    const { module, limit = 10000 } = args as { module?: string; limit?: number };

    // Get frames from store
    const result = await this.frameStore.listFrames({ limit });
    const frames = result.frames;

    if (frames.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { contradictions: [], totalFrames: 0, moduleFilter: module },
              null,
              2
            ),
          },
        ],
        data: { contradictions: [], totalFrames: 0, moduleFilter: module },
      };
    }

    // Import contradiction scanning
    const { scanForContradictions } = await import("../contradictions.js");

    const contradictions = scanForContradictions(frames, module);

    const scanResult = {
      totalFrames: frames.length,
      moduleFilter: module || null,
      contradictionsFound: contradictions.length,
      contradictions: contradictions.map((c) => {
        const frameA = frames.find((f) => f.id === c.frameA);
        const frameB = frames.find((f) => f.id === c.frameB);
        return {
          frameA: {
            id: frameA?.id,
            timestamp: frameA?.timestamp,
            summary: frameA?.summary_caption,
            modules: frameA?.module_scope,
          },
          frameB: {
            id: frameB?.id,
            timestamp: frameB?.timestamp,
            summary: frameB?.summary_caption,
            modules: frameB?.module_scope,
          },
          signal: c.signal,
          moduleOverlap: c.moduleOverlap,
        };
      }),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(scanResult, null, 2) }],
      data: scanResult,
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
