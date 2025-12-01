/**
 * Tests for the Projection Engine
 *
 * Tests cover:
 * - All hosts enabled
 * - Selective disable (copilot or cursor)
 * - Idempotent update
 * - Create vs update action determination
 * - Edge cases
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateProjections,
  defaultFileReader,
  type ProjectionConfig,
} from "../../../src/shared/instructions/projection-engine.js";
import { detectAvailableHosts } from "../../../src/shared/instructions/host-detection.js";
import { loadCanonicalInstructions } from "../../../src/shared/instructions/canonical-loader.js";
import { LEX_BEGIN, LEX_END } from "../../../src/shared/instructions/markers.js";
import { LexYaml } from "../../../src/shared/config/lex-yaml-schema.js";

describe("Projection Engine", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lex-projection-engine-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Helper to create canonical instruction file
   */
  function createCanonicalFile(content: string): void {
    const canonicalDir = join(testDir, ".smartergpt", "instructions");
    mkdirSync(canonicalDir, { recursive: true });
    writeFileSync(join(canonicalDir, "lex.md"), content);
  }

  /**
   * Helper to set up hosts
   */
  function setupHosts(options: { copilot?: boolean; cursor?: boolean }): void {
    if (options.copilot) {
      mkdirSync(join(testDir, ".github"));
    }
    if (options.cursor) {
      writeFileSync(join(testDir, ".cursorrules"), "# Cursor rules");
    }
  }

  describe("All hosts enabled", () => {
    it("should generate projections for both hosts when both are available", () => {
      // Setup
      createCanonicalFile("# Lex Instructions\n\nTest content.");
      setupHosts({ copilot: true, cursor: true });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      // Execute
      const results = generateProjections(config);

      // Verify
      assert.strictEqual(results.length, 2, "Should generate 2 projections");

      const copilotResult = results.find((r) => r.host === "copilot");
      const cursorResult = results.find((r) => r.host === "cursor");

      assert.ok(copilotResult, "Should have copilot projection");
      assert.ok(cursorResult, "Should have cursor projection");

      assert.strictEqual(copilotResult.action, "create", "Copilot should be create action");
      assert.strictEqual(cursorResult.action, "update", "Cursor should be update action (file exists)");

      assert.ok(copilotResult.content.includes(LEX_BEGIN), "Copilot content should have BEGIN marker");
      assert.ok(copilotResult.content.includes(LEX_END), "Copilot content should have END marker");
      assert.ok(copilotResult.content.includes("Test content"), "Copilot content should include canonical content");
    });

    it("should use default projection settings when not specified in config", () => {
      createCanonicalFile("# Default Settings Test");
      setupHosts({ copilot: true, cursor: true });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 }, // No instructions.projections specified
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 2, "Both hosts should be projected by default");
    });
  });

  describe("Selective disable", () => {
    it("should skip copilot when copilot projection is disabled", () => {
      createCanonicalFile("# Cursor Only");
      setupHosts({ copilot: true, cursor: true });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: {
          version: 1,
          instructions: {
            projections: {
              copilot: false,
              cursor: true,
            },
          },
        },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 1, "Should only have one projection");
      assert.strictEqual(results[0].host, "cursor", "Should only project to cursor");
    });

    it("should skip cursor when cursor projection is disabled", () => {
      createCanonicalFile("# Copilot Only");
      setupHosts({ copilot: true, cursor: true });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: {
          version: 1,
          instructions: {
            projections: {
              copilot: true,
              cursor: false,
            },
          },
        },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 1, "Should only have one projection");
      assert.strictEqual(results[0].host, "copilot", "Should only project to copilot");
    });

    it("should return empty array when both projections are disabled", () => {
      createCanonicalFile("# Neither");
      setupHosts({ copilot: true, cursor: true });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: {
          version: 1,
          instructions: {
            projections: {
              copilot: false,
              cursor: false,
            },
          },
        },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 0, "Should have no projections");
    });

    it("should only project to available hosts even when enabled", () => {
      createCanonicalFile("# Only Copilot Available");
      setupHosts({ copilot: true, cursor: false });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 }, // Both enabled by default
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 1, "Should only have one projection");
      assert.strictEqual(results[0].host, "copilot", "Should only project to copilot");
    });
  });

  describe("Idempotent update", () => {
    it("should return skip action when content is unchanged", () => {
      const canonicalContent = "# Idempotent Test\n\nSame content.";
      createCanonicalFile(canonicalContent);
      setupHosts({ copilot: true });

      // First, create the copilot file with the expected content
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      const wrappedContent = `${LEX_BEGIN}\n<!-- This block is auto-generated by \`lex instructions generate\`. Do not edit manually. -->\n\n# Idempotent Test\n\nSame content.\n\n${LEX_END}\n`;
      writeFileSync(copilotPath, wrappedContent);

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 1, "Should have one projection");
      assert.strictEqual(results[0].action, "skip", "Should skip when content unchanged");
    });

    it("should return update action when content has changed", () => {
      const canonicalContent = "# Updated Content";
      createCanonicalFile(canonicalContent);
      setupHosts({ copilot: true });

      // Create copilot file with OLD content
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      const oldContent = `${LEX_BEGIN}\n<!-- old header -->\n\n# Old Content\n\n${LEX_END}\n`;
      writeFileSync(copilotPath, oldContent);

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 1, "Should have one projection");
      assert.strictEqual(results[0].action, "update", "Should update when content changed");
      assert.ok(results[0].content.includes("Updated Content"), "Should contain new content");
    });

    it("should preserve human content outside markers during update", () => {
      const canonicalContent = "# Lex Section";
      createCanonicalFile(canonicalContent);
      setupHosts({ copilot: true });

      // Create copilot file with human content and old lex content
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      const existingContent = `# Human Header\n\nImportant notes.\n\n${LEX_BEGIN}\n# Old Lex\n${LEX_END}\n\n# Human Footer\n`;
      writeFileSync(copilotPath, existingContent);

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results[0].action, "update");
      assert.ok(results[0].content.includes("Human Header"), "Should preserve human header");
      assert.ok(results[0].content.includes("Important notes"), "Should preserve human content");
      assert.ok(results[0].content.includes("Human Footer"), "Should preserve human footer");
      assert.ok(results[0].content.includes("Lex Section"), "Should include new lex content");
    });
  });

  describe("Create vs Update actions", () => {
    it("should return create action for new copilot file", () => {
      createCanonicalFile("# New File");
      setupHosts({ copilot: true });
      // Note: .github exists but copilot-instructions.md does not

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results[0].action, "create");
      assert.ok(results[0].path.endsWith("copilot-instructions.md"));
    });

    it("should return update action for existing cursor file", () => {
      createCanonicalFile("# Update Cursor");
      setupHosts({ cursor: true }); // This creates .cursorrules with content

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results[0].action, "update");
      assert.ok(results[0].path.endsWith(".cursorrules"));
    });
  });

  describe("Edge cases", () => {
    it("should return empty array when canonical file does not exist", () => {
      setupHosts({ copilot: true, cursor: true });
      // Note: No canonical file created

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 0, "Should return empty array without canonical");
    });

    it("should return empty array when no hosts are available", () => {
      createCanonicalFile("# No Hosts");
      // Note: No hosts set up

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 0, "Should return empty array without hosts");
    });

    it("should work without readFile function (assumes files don't exist)", () => {
      createCanonicalFile("# No Reader");
      setupHosts({ copilot: true });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        // readFile not provided
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].action, "create", "Should assume create without reader");
    });

    it("should handle empty canonical content", () => {
      createCanonicalFile("");
      setupHosts({ copilot: true });

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir),
        hosts: detectAvailableHosts(testDir),
        config: { version: 1 },
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      // Empty content means canonical.content is "" which is falsy
      assert.strictEqual(results.length, 0, "Should return empty for empty canonical");
    });

    it("should use custom canonical path from config", () => {
      // Create custom canonical path
      const customDir = join(testDir, "docs", "ai");
      mkdirSync(customDir, { recursive: true });
      writeFileSync(join(customDir, "instructions.md"), "# Custom Path");
      setupHosts({ copilot: true });

      const lexConfig: LexYaml = {
        version: 1,
        instructions: {
          canonical: "docs/ai/instructions.md",
        },
      };

      const config: ProjectionConfig = {
        canonical: loadCanonicalInstructions(testDir, lexConfig),
        hosts: detectAvailableHosts(testDir),
        config: lexConfig,
        readFile: defaultFileReader,
      };

      const results = generateProjections(config);

      assert.strictEqual(results.length, 1);
      assert.ok(results[0].content.includes("Custom Path"));
    });
  });

  describe("defaultFileReader", () => {
    it("should return file content for existing file", () => {
      const testFile = join(testDir, "test.txt");
      writeFileSync(testFile, "test content");

      const content = defaultFileReader(testFile);

      assert.strictEqual(content, "test content");
    });

    it("should return null for non-existent file", () => {
      const content = defaultFileReader(join(testDir, "nonexistent.txt"));

      assert.strictEqual(content, null);
    });
  });
});
