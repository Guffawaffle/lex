/**
 * End-to-End Integration Tests for Instructions Generation
 *
 * Tests the full flow of instruction generation:
 * 1. Fresh repo with `.github/` → creates copilot-instructions.md
 * 2. Repo with `.cursorrules` → updates with markers
 * 3. Repo with both → updates both
 * 4. Repo with neither → no projections
 * 5. Custom config path → respects lex.yaml
 * 6. Dry-run → no file changes
 * 7. Idempotent → running twice produces same result
 * 8. Human content preserved → content outside markers untouched
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  generateProjections,
  defaultFileReader,
  writeProjections,
  detectAvailableHosts,
  loadCanonicalInstructions,
  LEX_BEGIN,
  LEX_END,
  type ProjectionConfig,
} from "../../src/shared/instructions/index.js";
import { loadLexYaml } from "../../src/shared/config/lex-yaml-loader.js";
import type { LexYaml } from "../../src/shared/config/lex-yaml-schema.js";

describe("Instructions E2E Integration", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lex-instructions-e2e-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Helper to create canonical instruction file at default path
   */
  function createCanonicalFile(content: string, customPath?: string): void {
    const relativePath = customPath ?? ".smartergpt/instructions/lex.md";
    const fullPath = join(testDir, relativePath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content);
  }

  /**
   * Helper to create lex.yaml config file
   */
  function createLexYaml(config: LexYaml, customPath?: string): void {
    const relativePath = customPath ?? "lex.yaml";
    const fullPath = join(testDir, relativePath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    const yaml = `version: ${config.version}
${config.instructions ? `instructions:
  canonical: "${config.instructions.canonical ?? ".smartergpt/instructions/lex.md"}"${
    config.instructions.projections
      ? `
  projections:
    copilot: ${config.instructions.projections.copilot ?? true}
    cursor: ${config.instructions.projections.cursor ?? true}`
      : ""
  }` : ""}`;
    writeFileSync(fullPath, yaml);
  }

  /**
   * Helper to run the full instruction generation pipeline
   */
  function runInstructionGeneration(options: {
    dryRun?: boolean;
    backup?: boolean;
    lexConfig?: LexYaml;
  } = {}): { projections: ReturnType<typeof generateProjections>; writeResult?: ReturnType<typeof writeProjections> } {
    const configResult = options.lexConfig 
      ? { success: true, config: options.lexConfig, path: null, source: "file" as const }
      : loadLexYaml(testDir);
    
    const config = configResult.config ?? { version: 1 };
    
    const projectionConfig: ProjectionConfig = {
      canonical: loadCanonicalInstructions(testDir, config),
      hosts: detectAvailableHosts(testDir),
      config: config,
      readFile: defaultFileReader,
    };

    const projections = generateProjections(projectionConfig);

    if (options.dryRun) {
      // Dry-run: don't write files, just return projections
      return { 
        projections,
        writeResult: writeProjections(
          projections.map(p => ({ path: p.path, content: p.content })),
          { dryRun: true, backup: options.backup ?? false }
        )
      };
    }

    // Write files
    const writeResult = writeProjections(
      projections.filter(p => p.action !== "skip").map(p => ({ path: p.path, content: p.content })),
      { dryRun: false, backup: options.backup ?? false }
    );

    return { projections, writeResult };
  }

  describe("Scenario 1: Fresh repo with .github/ → creates copilot-instructions.md", () => {
    it("should create copilot-instructions.md in fresh repo with .github directory", () => {
      // Setup: Create .github directory and canonical file
      mkdirSync(join(testDir, ".github"), { recursive: true });
      createCanonicalFile("# Test Instructions\n\nThis is the content.");

      // Execute
      const result = runInstructionGeneration();

      // Verify
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      assert.ok(existsSync(copilotPath), "copilot-instructions.md should be created");
      
      const content = readFileSync(copilotPath, "utf-8");
      assert.ok(content.includes(LEX_BEGIN), "Should contain LEX:BEGIN marker");
      assert.ok(content.includes(LEX_END), "Should contain LEX:END marker");
      assert.ok(content.includes("Test Instructions"), "Should contain canonical content");
      
      assert.strictEqual(result.projections.length, 1);
      assert.strictEqual(result.projections[0].host, "copilot");
      assert.strictEqual(result.projections[0].action, "create");
    });
  });

  describe("Scenario 2: Repo with .cursorrules → updates with markers", () => {
    it("should update existing .cursorrules with Lex markers", () => {
      // Setup: Create .cursorrules with existing content
      const existingContent = "# Cursor Rules\n\nCustom rules here.\n";
      writeFileSync(join(testDir, ".cursorrules"), existingContent);
      createCanonicalFile("# Lex Cursor Instructions\n\nAI guidance for this repo.");

      // Execute
      const result = runInstructionGeneration();

      // Verify
      const cursorPath = join(testDir, ".cursorrules");
      const content = readFileSync(cursorPath, "utf-8");
      
      assert.ok(content.includes("Cursor Rules"), "Should preserve original content");
      assert.ok(content.includes("Custom rules here"), "Should preserve custom rules");
      assert.ok(content.includes(LEX_BEGIN), "Should add LEX:BEGIN marker");
      assert.ok(content.includes(LEX_END), "Should add LEX:END marker");
      assert.ok(content.includes("Lex Cursor Instructions"), "Should contain canonical content");
      
      assert.strictEqual(result.projections.length, 1);
      assert.strictEqual(result.projections[0].host, "cursor");
      assert.strictEqual(result.projections[0].action, "update");
    });
  });

  describe("Scenario 3: Repo with both .github/ and .cursorrules → updates both", () => {
    it("should generate projections for both hosts", () => {
      // Setup: Create both hosts
      mkdirSync(join(testDir, ".github"), { recursive: true });
      writeFileSync(join(testDir, ".cursorrules"), "# Cursor\n");
      createCanonicalFile("# Unified Instructions\n\nFor all hosts.");

      // Execute
      const result = runInstructionGeneration();

      // Verify both files exist and contain markers
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      const cursorPath = join(testDir, ".cursorrules");

      assert.ok(existsSync(copilotPath), "copilot-instructions.md should exist");
      assert.ok(existsSync(cursorPath), ".cursorrules should exist");

      const copilotContent = readFileSync(copilotPath, "utf-8");
      const cursorContent = readFileSync(cursorPath, "utf-8");

      assert.ok(copilotContent.includes(LEX_BEGIN), "Copilot should have LEX:BEGIN");
      assert.ok(cursorContent.includes(LEX_BEGIN), "Cursor should have LEX:BEGIN");
      assert.ok(copilotContent.includes("Unified Instructions"), "Copilot should have content");
      assert.ok(cursorContent.includes("Unified Instructions"), "Cursor should have content");

      // Verify projections
      assert.strictEqual(result.projections.length, 2);
      const copilotProj = result.projections.find(p => p.host === "copilot");
      const cursorProj = result.projections.find(p => p.host === "cursor");
      assert.ok(copilotProj, "Should have copilot projection");
      assert.ok(cursorProj, "Should have cursor projection");
    });
  });

  describe("Scenario 4: Repo with neither .github/ nor .cursorrules → no projections", () => {
    it("should return empty projections when no hosts are available", () => {
      // Setup: Create only canonical file, no hosts
      createCanonicalFile("# Orphan Instructions\n\nNo host to project to.");

      // Execute
      const result = runInstructionGeneration();

      // Verify
      assert.strictEqual(result.projections.length, 0, "Should have no projections");
      
      // Ensure no files were created
      assert.ok(!existsSync(join(testDir, ".github", "copilot-instructions.md")), 
        "copilot-instructions.md should not exist");
      assert.ok(!existsSync(join(testDir, ".cursorrules")), 
        ".cursorrules should not exist");
    });

    it("should return empty projections when canonical file is missing", () => {
      // Setup: Create hosts but no canonical file
      mkdirSync(join(testDir, ".github"), { recursive: true });
      writeFileSync(join(testDir, ".cursorrules"), "# Cursor");

      // Execute
      const result = runInstructionGeneration();

      // Verify
      assert.strictEqual(result.projections.length, 0, "Should have no projections without canonical");
    });
  });

  describe("Scenario 5: Custom config path → respects lex.yaml", () => {
    it("should use custom canonical path from lex.yaml", () => {
      // Setup: Create custom canonical path
      const customCanonicalPath = "docs/ai/custom-instructions.md";
      mkdirSync(join(testDir, "docs", "ai"), { recursive: true });
      writeFileSync(join(testDir, customCanonicalPath), "# Custom Location\n\nInstructions from custom path.");
      mkdirSync(join(testDir, ".github"), { recursive: true });
      
      // Create lex.yaml with custom canonical path
      createLexYaml({
        version: 1,
        instructions: {
          canonical: customCanonicalPath,
        },
      });

      // Execute
      const result = runInstructionGeneration();

      // Verify
      assert.strictEqual(result.projections.length, 1);
      assert.ok(result.projections[0].content.includes("Custom Location"), 
        "Should use custom canonical file content");
    });

    it("should respect projection settings from lex.yaml", () => {
      // Setup
      mkdirSync(join(testDir, ".github"), { recursive: true });
      writeFileSync(join(testDir, ".cursorrules"), "# Cursor");
      createCanonicalFile("# Selective Projection\n\nOnly for copilot.");
      
      // Create lex.yaml that disables cursor
      createLexYaml({
        version: 1,
        instructions: {
          canonical: ".smartergpt/instructions/lex.md",
          projections: {
            copilot: true,
            cursor: false,
          },
        },
      });

      // Execute
      const result = runInstructionGeneration();

      // Verify: Only copilot projection
      assert.strictEqual(result.projections.length, 1);
      assert.strictEqual(result.projections[0].host, "copilot");
      
      // .cursorrules should be unchanged
      const cursorContent = readFileSync(join(testDir, ".cursorrules"), "utf-8");
      assert.ok(!cursorContent.includes(LEX_BEGIN), "Cursor should not have LEX markers");
    });
  });

  describe("Scenario 6: Dry-run → no file changes", () => {
    it("should not create files in dry-run mode", () => {
      // Setup
      mkdirSync(join(testDir, ".github"), { recursive: true });
      createCanonicalFile("# Dry Run Test\n\nShould not be written.");

      // Execute with dry-run
      const result = runInstructionGeneration({ dryRun: true });

      // Verify: File should not exist
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      assert.ok(!existsSync(copilotPath), "File should NOT be created in dry-run");
      
      // But projections should still be generated
      assert.strictEqual(result.projections.length, 1);
      assert.ok(result.writeResult);
      assert.strictEqual(result.writeResult.written.length, 1, "Should report as would-be-written");
    });

    it("should not modify existing files in dry-run mode", () => {
      // Setup: Create existing cursorrules
      const originalContent = "# Original Cursor Rules\n\nDo not modify.";
      writeFileSync(join(testDir, ".cursorrules"), originalContent);
      createCanonicalFile("# Would Update\n\nThis would update the file.");

      // Execute with dry-run
      const result = runInstructionGeneration({ dryRun: true });

      // Verify: File should be unchanged
      const cursorContent = readFileSync(join(testDir, ".cursorrules"), "utf-8");
      assert.strictEqual(cursorContent, originalContent, "File should be unchanged in dry-run");
      
      assert.strictEqual(result.projections.length, 1);
      assert.strictEqual(result.projections[0].action, "update");
    });
  });

  describe("Scenario 7: Idempotent → running twice produces same result", () => {
    it("should produce identical results when run multiple times", () => {
      // Setup
      mkdirSync(join(testDir, ".github"), { recursive: true });
      createCanonicalFile("# Idempotent Test\n\nRunning twice should be the same.");

      // Execute first time
      const result1 = runInstructionGeneration();
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      const content1 = readFileSync(copilotPath, "utf-8");

      // Verify first run creates the file
      assert.strictEqual(result1.projections[0].action, "create", 
        "First run should create the file");

      // Execute second time
      const result2 = runInstructionGeneration();
      const content2 = readFileSync(copilotPath, "utf-8");

      // Verify
      assert.strictEqual(content1, content2, "Content should be identical after two runs");
      
      // Second run should skip (no changes needed)
      assert.strictEqual(result2.projections[0].action, "skip", 
        "Second run should skip as content is unchanged");
    });

    it("should skip writing when content is unchanged", () => {
      // Setup
      mkdirSync(join(testDir, ".github"), { recursive: true });
      createCanonicalFile("# Skip Test\n\nShould be skipped on second run.");

      // First run
      runInstructionGeneration();

      // Second run
      const result = runInstructionGeneration();

      // Verify skip action
      assert.strictEqual(result.projections.length, 1);
      assert.strictEqual(result.projections[0].action, "skip");
      
      // writeResult should have nothing written (we filter out skips)
      assert.ok(result.writeResult);
      assert.strictEqual(result.writeResult.written.length, 0);
    });
  });

  describe("Scenario 8: Human content preserved → content outside markers untouched", () => {
    it("should preserve human content before LEX markers", () => {
      // Setup: Create file with human content at the beginning
      const humanHeader = "# My Custom Header\n\nThis is important human-written content.\n\n";
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      mkdirSync(join(testDir, ".github"), { recursive: true });
      writeFileSync(copilotPath, humanHeader + `${LEX_BEGIN}\n# Old Lex Content\n${LEX_END}\n`);
      createCanonicalFile("# New Lex Content\n\nUpdated by lex instructions generate.");

      // Execute
      runInstructionGeneration();

      // Verify
      const content = readFileSync(copilotPath, "utf-8");
      assert.ok(content.includes("My Custom Header"), "Should preserve human header");
      assert.ok(content.includes("important human-written content"), "Should preserve human content");
      assert.ok(content.includes("New Lex Content"), "Should have updated Lex content");
      assert.ok(!content.includes("Old Lex Content"), "Should not have old Lex content");
    });

    it("should preserve human content after LEX markers", () => {
      // Setup: Create file with human content at the end
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      mkdirSync(join(testDir, ".github"), { recursive: true });
      writeFileSync(copilotPath, 
        `${LEX_BEGIN}\n# Old Lex\n${LEX_END}\n\n# Human Footer\n\nCustom rules below.\n`);
      createCanonicalFile("# Updated Lex\n\nNew instructions.");

      // Execute
      runInstructionGeneration();

      // Verify
      const content = readFileSync(copilotPath, "utf-8");
      assert.ok(content.includes("Human Footer"), "Should preserve human footer");
      assert.ok(content.includes("Custom rules below"), "Should preserve custom rules");
      assert.ok(content.includes("Updated Lex"), "Should have new Lex content");
    });

    it("should preserve human content before and after LEX markers", () => {
      // Setup: Create file with human content on both sides
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      mkdirSync(join(testDir, ".github"), { recursive: true });
      const existingContent = [
        "# Header Section",
        "",
        "Important notes before Lex.",
        "",
        LEX_BEGIN,
        "# Old Lex Content",
        LEX_END,
        "",
        "# Footer Section",
        "",
        "More human content here.",
        ""
      ].join("\n");
      writeFileSync(copilotPath, existingContent);
      createCanonicalFile("# Brand New Lex\n\nCompletely new content.");

      // Execute
      runInstructionGeneration();

      // Verify
      const content = readFileSync(copilotPath, "utf-8");
      assert.ok(content.includes("Header Section"), "Should preserve header section");
      assert.ok(content.includes("Important notes before Lex"), "Should preserve intro notes");
      assert.ok(content.includes("Footer Section"), "Should preserve footer section");
      assert.ok(content.includes("More human content here"), "Should preserve trailing content");
      assert.ok(content.includes("Brand New Lex"), "Should have new Lex content");
      assert.ok(!content.includes("Old Lex Content"), "Should not have old Lex content");
    });

    it("should append markers to file without existing markers", () => {
      // Setup: Create file without any LEX markers
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      mkdirSync(join(testDir, ".github"), { recursive: true });
      writeFileSync(copilotPath, "# Existing Manual Instructions\n\nHuman-written content.\n");
      createCanonicalFile("# Appended Lex\n\nThis should be appended.");

      // Execute
      runInstructionGeneration();

      // Verify
      const content = readFileSync(copilotPath, "utf-8");
      assert.ok(content.includes("Existing Manual Instructions"), "Should preserve original content");
      assert.ok(content.includes("Human-written content"), "Should preserve human content");
      assert.ok(content.includes(LEX_BEGIN), "Should add LEX:BEGIN");
      assert.ok(content.includes(LEX_END), "Should add LEX:END");
      assert.ok(content.includes("Appended Lex"), "Should have Lex content");
      
      // Markers should come after original content
      const beginIndex = content.indexOf(LEX_BEGIN);
      const humanContentIndex = content.indexOf("Human-written content");
      assert.ok(beginIndex > humanContentIndex, "Lex markers should be after human content");
    });
  });
});
