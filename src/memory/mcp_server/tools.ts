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
    name: "remember",
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
        request_id: {
          type: "string",
          description:
            "Optional idempotency key. If provided, duplicate calls with the same request_id will return the cached response instead of creating a new frame. Useful for safely retrying tool calls.",
        },
      },
    },
  },
  {
    name: "validate_remember",
    description: "Validate remember input without storing (dry-run validation)",
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
    name: "recall",
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
        format: {
          type: "string",
          enum: ["full", "compact"],
          description: "Output format: 'full' (default) or 'compact' for small-context agents",
          default: "full",
        },
      },
    },
  },
  {
    name: "get_frame",
    description: "Retrieve a specific frame by ID. Use when you know the exact frame ID.",
    inputSchema: {
      type: "object",
      required: ["frame_id"],
      properties: {
        frame_id: {
          type: "string",
          description: "Frame ID to retrieve (e.g., from remember response or passed context)",
        },
        include_atlas: {
          type: "boolean",
          description: "Include Atlas Frame neighborhood in response (default: true)",
          default: true,
        },
        format: {
          type: "string",
          enum: ["full", "compact"],
          description: "Output format: 'full' (default) or 'compact' for small-context agents",
          default: "full",
        },
      },
    },
  },
  {
    name: "list_frames",
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
        cursor: {
          type: "string",
          description:
            "Opaque cursor for pagination - use nextCursor from previous response to get next page",
        },
        format: {
          type: "string",
          enum: ["full", "compact"],
          description: "Output format: 'full' (default) or 'compact' for small-context agents",
          default: "full",
        },
      },
    },
  },
  {
    name: "policy_check",
    description: "Validate code against policy rules from lexmap.policy.json",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to check (defaults to current directory)",
        },
        policyPath: {
          type: "string",
          description: "Path to policy file (defaults to lexmap.policy.json)",
        },
        strict: {
          type: "boolean",
          description: "Fail on warnings (default: false)",
        },
      },
    },
  },
  {
    name: "timeline",
    description: "Show visual timeline of Frame evolution for a ticket or branch",
    inputSchema: {
      type: "object",
      required: ["ticketOrBranch"],
      properties: {
        ticketOrBranch: {
          type: "string",
          description: "Ticket ID or branch name to show timeline for",
        },
        since: {
          type: "string",
          description: "Filter frames since this date (ISO 8601)",
        },
        until: {
          type: "string",
          description: "Filter frames until this date (ISO 8601)",
        },
        format: {
          type: "string",
          enum: ["text", "json", "compact"],
          description:
            "Output format (default: text). 'compact' returns JSON with abbreviated fields for small-context agents.",
          default: "text",
        },
      },
    },
  },
  {
    name: "code_atlas",
    description: "Analyze code structure and dependencies across modules",
    inputSchema: {
      type: "object",
      properties: {
        seedModules: {
          type: "array",
          items: { type: "string" },
          description: "List of module IDs to analyze",
        },
        foldRadius: {
          type: "number",
          description: "Neighborhood depth (default: 1)",
        },
      },
    },
  },
  {
    name: "introspect",
    description:
      "Discover the current state of Lex (available modules, policy, frame count, capabilities, error codes with metadata). Returns error code categories (validation, storage, policy, internal) and retryability hints for autonomous error handling.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["full", "compact"],
          description: "Output format: 'full' (default) or 'compact' for small-context agents",
          default: "full",
        },
      },
    },
  },
  {
    name: "help",
    description:
      "Get usage help for Lex MCP tools including examples, required fields, related tools, and common workflows. Use this to understand how to use Lex tools effectively.",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description:
            "Tool name to get help for (optional - returns all tools if omitted). Valid values: remember, validate_remember, recall, get_frame, list_frames, policy_check, timeline, code_atlas, introspect, help",
        },
        examples: {
          type: "boolean",
          description: "Include executable examples in the response (default: true)",
          default: true,
        },
        format: {
          type: "string",
          enum: ["full", "micro"],
          description: "Output format: 'full' (default) or 'micro' for ultra-compact examples",
          default: "full",
        },
      },
    },
  },
];
