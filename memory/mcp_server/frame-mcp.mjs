#!/usr/bin/env node
// Frame MCP Server Entry Point
// Refactored to use TypeScript implementation from server.ts

import { MCPServer } from "./dist/server.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const config = {
  dbPath: process.env.LEX_MEMORY_DB || join(__dirname, "../../lex-memory.db"),
};

// Initialize MCP server
let mcpServer;
try {
  mcpServer = new MCPServer(config.dbPath);
  if (process.env.LEX_DEBUG) {
    console.error(`[LEX] Memory MCP server initialized: ${config.dbPath}`);
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

    try {
      const request = JSON.parse(line);
      const response = await mcpServer.handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.log(
        JSON.stringify({
          error: {
            message: error.message,
            code: error.code || "PARSE_ERROR",
          },
        })
      );
    }
  }
});

// Graceful shutdown
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
