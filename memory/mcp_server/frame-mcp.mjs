#!/usr/bin/env node
// TODO(merge): This is adapted from LexBrain mcp-stdio.mjs
// Wire into shared/types/FRAME.md schema once unification complete

/**
 * Lex Memory MCP Server (stdio mode)
 *
 * Exposes Frame storage and recall via Model Context Protocol.
 * Runs as a stdio server for Copilot/Claude/etc integration.
 *
 * Frames are stored in SQLite with FTS5 fuzzy recall.
 * No cloud sync. No telemetry. Local-first knowledge.
 */

import { FrameStore } from "../store/framestore.js";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const config = {
  dbPath: process.env.LEX_MEMORY_DB || join(__dirname, "../../lex-memory.db"),
};

// Initialize Frame store
let frameStore;
try {
  frameStore = new FrameStore(config.dbPath);
  if (process.env.LEX_DEBUG) {
    console.error(`[LEX] Memory store initialized: ${config.dbPath}`);
  }
} catch (error) {
  console.error(`[LEX] Failed to initialize memory store: ${error.message}`);
  process.exit(1);
}

// MCP stdio protocol handler
process.stdin.setEncoding("utf8");
let buffer = "";

process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.log(
        JSON.stringify({
          error: {
            message: error.message,
            code: error.code || "INTERNAL_ERROR",
          },
        })
      );
    }
  }
});

async function handleRequest(request) {
  const { method, params } = request;

  // MCP protocol: tools/list
  if (method === "tools/list") {
    return {
      tools: [
        {
          name: "lex.remember",
          description: "Store a Frame (episodic memory snapshot)",
          inputSchema: {
            type: "object",
            required: [
              "reference_point",
              "summary_caption",
              "status_snapshot",
              "module_scope",
            ],
            properties: {
              reference_point: {
                type: "string",
                description:
                  'What you were working on (e.g., "refactoring UserAuth module")',
              },
              summary_caption: {
                type: "string",
                description:
                  'One-line summary of progress (e.g., "Extracted password validation to separate function")',
              },
              status_snapshot: {
                type: "object",
                description:
                  "Current state: {incomplete: [...], complete: [...], blocked: [...]}",
                properties: {
                  incomplete: { type: "array", items: { type: "string" } },
                  complete: { type: "array", items: { type: "string" } },
                  blocked: { type: "array", items: { type: "string" } },
                },
              },
              module_scope: {
                type: "array",
                items: { type: "string" },
                description:
                  'Module IDs from lexmap.policy.json (e.g., ["auth/core", "auth/password"])',
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
                description:
                  'Optional search tags (e.g., ["refactoring", "authentication"])',
              },
              atlas_frame_id: {
                type: "string",
                description: "Reference to Atlas Frame (fold radius snapshot)",
              },
            },
          },
        },
        {
          name: "lex.recall",
          description:
            "Search Frames by reference point, branch, or Jira ticket",
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
      ],
    };
  }

  // MCP protocol: tools/call
  if (method === "tools/call") {
    const { name, arguments: args } = params;

    switch (name) {
      case "lex.remember": {
        // Validate required fields
        const {
          reference_point,
          summary_caption,
          status_snapshot,
          module_scope,
          branch,
          jira,
          keywords,
          atlas_frame_id,
        } = args;

        if (
          !reference_point ||
          !summary_caption ||
          !status_snapshot ||
          !module_scope
        ) {
          throw new Error(
            "Missing required fields: reference_point, summary_caption, status_snapshot, module_scope"
          );
        }

        if (!Array.isArray(module_scope) || module_scope.length === 0) {
          throw new Error(
            "module_scope must be a non-empty array of module IDs"
          );
        }

        // TODO(merge): Validate module_scope against shared/module_ids/ (THE CRITICAL RULE)
        // For now, just store as-is

        // Generate Frame ID
        const frameId = `frame-${Date.now()}-${randomUUID()}`;
        const timestamp = new Date().toISOString();

        // Get current git branch if not provided
        const frameBranch = branch || "main"; // TODO: exec git rev-parse --abbrev-ref HEAD

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
        };

        const inserted = frameStore.insertFrame(frame);

        return {
          content: [
            {
              type: "text",
              text:
                `✅ Frame stored: ${frameId}\n` +
                `📍 Reference: ${reference_point}\n` +
                `📦 Modules: ${module_scope.join(", ")}\n` +
                `🌿 Branch: ${frameBranch}\n` +
                `${jira ? `🎫 Jira: ${jira}\n` : ""}` +
                `📅 Timestamp: ${timestamp}`,
            },
          ],
        };
      }

      case "lex.recall": {
        const { reference_point, jira, branch, limit = 10 } = args;

        if (!reference_point && !jira && !branch) {
          throw new Error(
            "At least one search parameter required: reference_point, jira, or branch"
          );
        }

        const frames = frameStore.searchFrames({
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

        // Format results for readability
        const results = frames
          .map((f, idx) => {
            const incomplete = f.status_snapshot?.incomplete || [];
            const complete = f.status_snapshot?.complete || [];
            const blocked = f.status_snapshot?.blocked || [];

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
              `  ✅ Complete (${complete.length}): ${
                complete.join(", ") || "none"
              }\n` +
              `  ⏳ Incomplete (${incomplete.length}): ${
                incomplete.join(", ") || "none"
              }\n` +
              `  🚫 Blocked (${blocked.length}): ${
                blocked.join(", ") || "none"
              }\n` +
              `${
                f.keywords ? `🏷️  Keywords: ${f.keywords.join(", ")}\n` : ""
              }` +
              `${f.atlas_frame_id ? `🗺️  Atlas: ${f.atlas_frame_id}\n` : ""}`
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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  throw new Error(`Unknown method: ${method}`);
}

// Graceful shutdown
process.on("SIGINT", () => {
  if (frameStore) {
    frameStore.close();
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (frameStore) {
    frameStore.close();
  }
  process.exit(0);
});

if (process.env.LEX_DEBUG) {
  console.error("[LEX] Memory MCP server ready (stdio mode)");
}
