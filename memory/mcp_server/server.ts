/**
 * Lex Memory MCP Server
 *
 * Handles MCP protocol requests for Frame storage and recall.
 * Integrates with FrameStore (SQLite + FTS5) and Atlas Frame generation.
 */

// @ts-ignore - importing from compiled dist directories
import { FrameStore } from "../../store/dist/framestore.js";
// @ts-ignore - importing from compiled dist directories
import { ImageManager } from "../../store/dist/images.js";
import { MCP_TOOLS } from "./tools.js";
// @ts-ignore - importing from compiled dist directories
import { generateAtlasFrame, formatAtlasFrame } from "../../../shared/atlas/dist/atlas-frame.js";
// @ts-ignore - importing from compiled dist directories
import { validateModuleIds } from "../../../shared/module_ids/dist/module_ids/validator.js";
// @ts-ignore - importing from compiled dist directories
import { loadPolicy } from "../../../shared/policy/dist/policy/loader.js";
// @ts-ignore - importing from compiled dist directories
import { getCurrentBranch } from "../../../shared/git/dist/branch.js";
import { randomUUID } from "crypto";

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
  private frameStore: FrameStore;
  private imageManager: ImageManager;
  private policy: any; // Cached policy for validation

  constructor(dbPath: string) {
    this.frameStore = new FrameStore(dbPath);
    this.imageManager = new ImageManager(this.frameStore.getDatabase());
    // Load policy once at initialization for better performance
    this.policy = loadPolicy();
  }

  /**
   * Handle incoming MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params } = request;

    try {
      switch (method) {
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
        return this.handleRemember(args);

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
   * Validates module IDs against policy before creating Frame (THE CRITICAL RULE)
   */
  private handleRemember(args: any): MCPResponse {
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

    // THE CRITICAL RULE: Validate module IDs against policy
    const validationResult = validateModuleIds(module_scope, this.policy);

    if (!validationResult.valid && validationResult.errors) {
      // Format error message with suggestions
      const errorMessages = validationResult.errors.map(error => {
        const suggestions = error.suggestions.length > 0
          ? `\n  Did you mean: ${error.suggestions.join(', ')}?`
          : '';
        return `  • ${error.message}${suggestions}`;
      });

      throw new Error(
        `Invalid module IDs in module_scope:\n${errorMessages.join('\n')}\n\n` +
        `Module IDs must match those defined in lexmap.policy.json.\n` +
        `Available modules: ${Object.keys(this.policy.modules).join(', ')}`
      );
    }

    // Generate Frame ID and timestamp
    const frameId = `frame-${Date.now()}-${randomUUID()}`;
    const timestamp = new Date().toISOString();

    // Get current git branch if not provided - auto-detect using git
    const frameBranch = branch || getCurrentBranch();

    // Log branch detection for debugging
    if (!branch) {
      console.log(`[lex.remember] Auto-detected branch: ${frameBranch}`);
    }

    const frame = {
      id: frameId,
      timestamp,
      branch: frameBranch,
      jira: jira || null,
      module_scope,
      summary_caption,
      reference_point,
      status_snapshot,
      keywords: keywords || undefined,
      atlas_frame_id: atlas_frame_id || null,
      image_ids: [] as string[],
    };

    this.frameStore.insertFrame(frame);

    // Process image attachments if provided
    const imageIds: string[] = [];
    if (images && Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        try {
          // Decode base64 image data
          const imageBuffer = Buffer.from(img.data, "base64");
          const imageId = this.imageManager.storeImage(
            frameId,
            imageBuffer,
            img.mime_type
          );
          imageIds.push(imageId);
        } catch (error: any) {
          // If image storage fails, clean up the Frame and rethrow
          this.frameStore.deleteFrame(frameId);
          throw new Error(`Failed to store image: ${error.message}`);
        }
      }

      // Update frame with image IDs
      frame.image_ids = imageIds;
      this.frameStore.insertFrame(frame);
    }

    // Generate Atlas Frame for the module scope
    const atlasFrame = generateAtlasFrame(module_scope);
    const atlasOutput = formatAtlasFrame(atlasFrame);

    const imageInfo = imageIds.length > 0
      ? `🖼️  Images: ${imageIds.length} attached\n`
      : "";

    return {
      content: [
        {
          type: "text",
          text:
            `✅ Frame stored: ${frameId}\n` +
            `📍 Reference: ${reference_point}\n` +
            `💬 Summary: ${summary_caption}\n` +
            `📦 Modules: ${module_scope.join(", ")}\n` +
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
      throw new Error(
        "At least one search parameter required: reference_point, jira, or branch"
      );
    }

    const frames = this.frameStore.searchFrames({
      reference_point,
      jira,
      branch,
      limit,
    });

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
      .map((f, idx) => {
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

    // Build search query
    const query: any = { limit };

    if (branch) {
      query.branch = branch;
    }

    // Search frames (if no filters, searchFrames returns recent frames)
    let frames = this.frameStore.searchFrames(query);

    // Filter by module if specified
    if (module) {
      frames = frames.filter((f) => f.module_scope.includes(module));
    }

    // Filter by timestamp if since is specified
    if (since) {
      const sinceDate = new Date(since);
      frames = frames.filter((f) => new Date(f.timestamp) >= sinceDate);
    }

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
      .map((f, idx) => {
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
    this.frameStore.close();
  }
}
