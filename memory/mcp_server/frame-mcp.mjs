#!/usr/bin/env node
// Frame MCP Server Entry Point
// Refactored to use TypeScript implementation from server.ts

import { MCPServer } from "./dist/server.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Repository root is two directories up from this script
const repoRoot = join(__dirname, "../..");

// Configuration
const config = {
  dbPath: process.env.LEX_MEMORY_DB || join(__dirname, "../../lex-memory.db"),
  repoRoot: repoRoot,
};

// Initialize MCP server
let mcpServer;
try {
  mcpServer = new MCPServer(config.dbPath, config.repoRoot);
  if (process.env.LEX_DEBUG) {
    console.error(`[LEX] Memory MCP server initialized: ${config.dbPath}`);
    console.error(`[LEX] Repository root: ${config.repoRoot}`);
  }
} catch (error) {
  console.error(`[LEX] Failed to initialize MCP server: ${error.message}`);
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

    let request;
    try {
      request = JSON.parse(line);
      const response = await mcpServer.handleRequest(request);

      // MCP protocol response format
      if (response.error) {
        // Error response
        console.log(JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          error: response.error
        }));
      } else {
        // Success response - wrap in result
        console.log(JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: response
        }));
      }
    } catch (error) {
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request?.id || null,
          error: {
            message: error.message,
            code: error.code || "PARSE_ERROR",
          },
        })
      );
    }
  }
});// Graceful shutdown
process.on("SIGINT", () => {
  if (mcpServer) {
    mcpServer.close();
  }
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (mcpServer) {
    mcpServer.close();
  }
  process.exit(0);
});

if (process.env.LEX_DEBUG) {
  console.error("[LEX] Memory MCP server ready (stdio mode)");
}
