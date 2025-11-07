import { MCPServer } from "./server.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

async function test() {
  const tmpDir = mkdtempSync(join(tmpdir(), "mcp-debug-"));
  const testDbPath = join(tmpDir, "debug-test.db");
  const server = new MCPServer(testDbPath);
  
  try {
    const response = await server.handleRequest({
      method: "tools/call",
      params: {
        name: "lex.recall",
        arguments: {
          reference_point: "zzz-nonexistent-query-zzz",
        },
      },
    });
    
    console.log("Response:", JSON.stringify(response, null, 2));
    console.log("Content exists?", !!response.content);
    console.log("Content:", response.content);
    console.log("Error:", response.error);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    server.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

test();
