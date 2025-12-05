/**
 * MCP Tools for Frame Memory
 *
 * Defines the tools exposed via Model Context Protocol for AI assistants.
 * Each tool can search, create, or list Frames with Atlas Frame neighborhoods.
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    required?: string[];
    properties: Record<string, unknown>;
  };
}

/**
 * Tool definitions for MCP protocol
 */
export const MCP_TOOLS: MCPTool[] = [
  {
    name: "lex.remember",
    description: "Store a Frame (episodic memory snapshot)",
    inputSchema: {
      type: "object",
      required: ["reference_point", "summary_caption", "status_snapshot", "module_scope"],
      properties: {
        reference_point: {
          type: "string",
          description: 'What you were working on (e.g., "refactoring UserAuth module")',
        },
        summary_caption: {
          type: "string",
          description:
            'One-line summary of progress (e.g., "Extracted password validation to separate function")',
        },
        status_snapshot: {
          type: "object",
          description:
            "Current state: {next_action: string, blockers?: [], merge_blockers?: [], tests_failing?: []}",
          properties: {
            next_action: { type: "string" },
            blockers: { type: "array", items: { type: "string" } },
            merge_blockers: { type: "array", items: { type: "string" } },
            tests_failing: { type: "array", items: { type: "string" } },
          },
          required: ["next_action"],
        },
        module_scope: {
          type: "array",
          items: { type: "string" },
          description: 'Module IDs from lexmap.policy.json (e.g., ["auth/core", "auth/password"])',
        },
        branch: {
          type: "string",
          description: "Git branch (defaults to current branch)",
        },
        jira: {
          type: "string",
          description: 'Optional Jira/issue ticket (e.g., "PROJ-123")',
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: 'Optional search tags (e.g., ["refactoring", "authentication"])',
        },
        atlas_frame_id: {
          type: "string",
          description: "Reference to Atlas Frame (fold radius snapshot)",
        },
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              data: {
                type: "string",
                description: "Base64-encoded image data",
              },
              mime_type: {
                type: "string",
                description: 'MIME type (e.g., "image/png", "image/jpeg")',
              },
            },
            required: ["data", "mime_type"],
          },
          description: "Optional array of image attachments (base64-encoded with MIME type)",
        },
      },
    },
  },
  {
    name: "lex.recall",
    description:
      "Search Frames by reference point, branch, or Jira ticket. Returns Frame + Atlas Frame neighborhood.",
    inputSchema: {
      type: "object",
      properties: {
        reference_point: {
          type: "string",
          description: "Fuzzy search on what you were working on",
        },
        jira: {
          type: "string",
          description: "Exact match on Jira ticket",
        },
        branch: {
          type: "string",
          description: "Filter by git branch",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 10)",
          default: 10,
        },
      },
    },
  },
  {
    name: "lex.list_frames",
    description:
      "List recent Frames, optionally filtered by branch or module. Returns Frame + Atlas Frame for each result.",
    inputSchema: {
      type: "object",
      properties: {
        branch: {
          type: "string",
          description: "Filter by git branch",
        },
        module: {
          type: "string",
          description: "Filter by module ID in module_scope",
        },
        limit: {
          type: "number",
          description: "Max results to return (default: 10)",
          default: 10,
        },
        since: {
          type: "string",
          description: "ISO 8601 timestamp - only return Frames after this time",
        },
      },
    },
  },
  {
    name: "lex.code_atlas",
    description: "Generate Atlas Frame for code structure analysis. Scans repository files and extracts code units (classes, functions, methods) using static analysis.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to analyze (defaults to current directory)",
        },
        foldRadius: {
          type: "number",
          description: "Fold radius for neighborhood (default: 1)",
        },
        maxTokens: {
          type: "number",
          description: "Maximum tokens for output (not currently implemented)",
        },
      },
    },
  },
];
