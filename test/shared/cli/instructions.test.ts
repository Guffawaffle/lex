/**
 * Instructions Generate Command Tests
 *
 * Tests for lex instructions generate command
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const lexBin = join(process.cwd(), "dist", "shared", "cli", "lex.js");

describe("lex instructions generate", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lex-instructions-test-"));
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
   * Helper to create lex.yaml config
   */
  function createLexYaml(config: string): void {
    writeFileSync(join(testDir, "lex.yaml"), config);
  }

  /**
   * Helper to set up hosts
   */
  function setupHosts(options: { copilot?: boolean; cursor?: boolean }): void {
    if (options.copilot) {
      mkdirSync(join(testDir, ".github"), { recursive: true });
    }
    if (options.cursor) {
      writeFileSync(join(testDir, ".cursorrules"), "# Cursor rules");
    }
  }

  /**
   * Helper to run the CLI command
   */
  function runCli(args: string[]): { stdout: string; exitCode: number } {
    try {
      const stdout = execFileSync(process.execPath, [lexBin, ...args], {
        encoding: "utf-8",
        cwd: testDir,
        env: {
          ...process.env,
          LEX_LOG_LEVEL: "silent",
        },
      });
      return { stdout, exitCode: 0 };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; status?: number };
      // Combine stdout and stderr to capture all output
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      return {
        stdout: output,
        exitCode: err.status ?? 1,
      };
    }
  }

  describe("happy path", () => {
    it("should generate copilot instructions with dry-run", () => {
      createCanonicalFile("# Lex Instructions\n\nTest content.");
      setupHosts({ copilot: true });

      const result = runCli(["instructions", "generate", "--dry-run"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /Would write/, "Should indicate dry-run");
      assert.match(result.stdout, /copilot-instructions\.md/, "Should mention copilot file");
    });

    it("should generate copilot instructions (actual write)", () => {
      createCanonicalFile("# Lex Instructions\n\nTest content.");
      setupHosts({ copilot: true });

      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /Wrote/, "Should indicate file written");

      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      assert.ok(existsSync(copilotPath), "Copilot file should exist");

      const content = readFileSync(copilotPath, "utf-8");
      assert.match(content, /<!-- LEX:BEGIN -->/, "Should have BEGIN marker");
      assert.match(content, /<!-- LEX:END -->/, "Should have END marker");
      assert.match(content, /Test content/, "Should contain canonical content");
    });

    it("should generate both copilot and cursor instructions", () => {
      createCanonicalFile("# Lex Instructions\n\nMulti-host test.");
      setupHosts({ copilot: true, cursor: true });

      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /Generated 2 file/, "Should generate 2 files");
    });
  });

  describe("JSON output", () => {
    it("should output valid JSON with --json flag", () => {
      createCanonicalFile("# JSON Test");
      setupHosts({ copilot: true });

      const result = runCli(["--json", "instructions", "generate", "--dry-run"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");

      const json = JSON.parse(result.stdout);
      assert.ok(Array.isArray(json.generated), "Should have generated array");
      assert.ok(Array.isArray(json.skipped), "Should have skipped array");
      assert.ok(Array.isArray(json.errors), "Should have errors array");
      assert.ok(json.summary, "Should have summary object");
      assert.strictEqual(json.summary.generated, 1, "Should have 1 generated");
    });

    it("should include file paths in JSON output", () => {
      createCanonicalFile("# Path Test");
      setupHosts({ copilot: true });

      const result = runCli(["--json", "instructions", "generate", "--dry-run"]);

      const json = JSON.parse(result.stdout);
      assert.strictEqual(json.generated.length, 1);
      assert.match(json.generated[0].path, /copilot-instructions\.md$/);
    });
  });

  describe("verbose output", () => {
    it("should show config loading with --verbose", () => {
      createCanonicalFile("# Verbose Test");
      createLexYaml("version: 1\ninstructions:\n  canonical: .smartergpt/instructions/lex.md");
      setupHosts({ copilot: true });

      const result = runCli(["instructions", "generate", "--dry-run", "--verbose"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /Loaded config from/, "Should show config loading");
      assert.match(result.stdout, /Loaded canonical instructions/, "Should show canonical loading");
      assert.match(result.stdout, /Detected Copilot host/, "Should show host detection");
    });
  });

  describe("error handling", () => {
    it("should fail when canonical file is missing", () => {
      setupHosts({ copilot: true });
      // Note: No canonical file created

      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 1, "Should exit with 1");
      assert.match(result.stdout, /not found/i, "Should indicate file not found");
    });

    it("should output error in JSON format", () => {
      setupHosts({ copilot: true });
      // Note: No canonical file created

      const result = runCli(["--json", "instructions", "generate"]);

      assert.strictEqual(result.exitCode, 1, "Should exit with 1");

      const json = JSON.parse(result.stdout);
      assert.strictEqual(json.errors.length, 1, "Should have 1 error");
      assert.strictEqual(json.summary.errors, 1, "Summary should show 1 error");
    });

    it("should exit 0 when no hosts are available", () => {
      createCanonicalFile("# No Hosts Test");
      // Note: No hosts set up

      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /No projections to generate/, "Should indicate no hosts");
    });
  });

  describe("idempotency", () => {
    it("should skip unchanged files on second run", () => {
      createCanonicalFile("# Idempotent Test");
      setupHosts({ copilot: true });

      // First run
      runCli(["instructions", "generate"]);

      // Second run
      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /skipped 1/, "Should skip the file");
    });

    it("should update file when canonical content changes", () => {
      setupHosts({ copilot: true });

      // First run
      createCanonicalFile("# Original Content");
      runCli(["instructions", "generate"]);

      // Change canonical content
      createCanonicalFile("# Updated Content");

      // Second run
      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /Generated 1/, "Should update the file");

      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      const content = readFileSync(copilotPath, "utf-8");
      assert.match(content, /Updated Content/, "Should contain updated content");
    });
  });

  describe("config options", () => {
    it("should respect custom canonical path from lex.yaml", () => {
      // Create custom canonical file
      const customDir = join(testDir, "docs", "ai");
      mkdirSync(customDir, { recursive: true });
      writeFileSync(join(customDir, "instructions.md"), "# Custom Path Content");

      // Create config with custom path
      createLexYaml(
        "version: 1\ninstructions:\n  canonical: docs/ai/instructions.md\n  projections:\n    copilot: true\n    cursor: false"
      );
      setupHosts({ copilot: true, cursor: true });

      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");

      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      const content = readFileSync(copilotPath, "utf-8");
      assert.match(content, /Custom Path Content/, "Should use custom canonical path");
    });

    it("should respect projection settings from lex.yaml", () => {
      createCanonicalFile("# Projections Test");

      // Only enable copilot
      createLexYaml(
        "version: 1\ninstructions:\n  projections:\n    copilot: true\n    cursor: false"
      );
      setupHosts({ copilot: true, cursor: true });

      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /Generated 1/, "Should generate only 1 file");
    });
  });

  describe("marker preservation", () => {
    it("should preserve human content outside markers", () => {
      createCanonicalFile("# Lex Section");
      setupHosts({ copilot: true });

      // Create existing copilot file with human content
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      writeFileSync(
        copilotPath,
        "# Human Header\n\nImportant notes.\n\n<!-- LEX:BEGIN -->\n# Old Lex\n<!-- LEX:END -->\n\n# Human Footer\n"
      );

      const result = runCli(["instructions", "generate"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");

      const content = readFileSync(copilotPath, "utf-8");
      assert.match(content, /Human Header/, "Should preserve human header");
      assert.match(content, /Important notes/, "Should preserve human content");
      assert.match(content, /Human Footer/, "Should preserve human footer");
      assert.match(content, /Lex Section/, "Should update lex content");
    });
  });
});

describe("lex instructions init", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lex-instructions-init-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Helper to run the CLI command
   */
  function runCli(args: string[]): { stdout: string; exitCode: number } {
    try {
      const stdout = execFileSync(process.execPath, [lexBin, ...args], {
        encoding: "utf-8",
        cwd: testDir,
        env: {
          ...process.env,
          LEX_LOG_LEVEL: "silent",
        },
      });
      return { stdout, exitCode: 0 };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; status?: number };
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      return {
        stdout: output,
        exitCode: err.status ?? 1,
      };
    }
  }

  describe("happy path", () => {
    it("should create all files on fresh directory", () => {
      const result = runCli(["instructions", "init"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");

      // Check canonical file
      const canonicalPath = join(testDir, ".smartergpt", "instructions", "lex.md");
      assert.ok(existsSync(canonicalPath), "Should create canonical file");
      const canonicalContent = readFileSync(canonicalPath, "utf-8");
      assert.match(canonicalContent, /canonical source/, "Should have template content");

      // Check lex.yaml
      const lexYamlPath = join(testDir, "lex.yaml");
      assert.ok(existsSync(lexYamlPath), "Should create lex.yaml");
      const yamlContent = readFileSync(lexYamlPath, "utf-8");
      assert.match(
        yamlContent,
        /canonical:.*\.smartergpt\/instructions\/lex\.md/,
        "Should reference canonical"
      );
      assert.match(yamlContent, /copilot: true/, "Should enable copilot");
      assert.match(yamlContent, /cursor: true/, "Should enable cursor");

      // Check target files
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      assert.ok(existsSync(copilotPath), "Should create copilot file");
      const copilotContent = readFileSync(copilotPath, "utf-8");
      assert.match(copilotContent, /LEX:BEGIN/, "Should have LEX markers");

      const cursorPath = join(testDir, ".cursorrules");
      assert.ok(existsSync(cursorPath), "Should create cursor file");
    });

    it("should create only specified targets with --targets", () => {
      const result = runCli(["instructions", "init", "--targets", "copilot"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");

      // Copilot should exist
      const copilotPath = join(testDir, ".github", "copilot-instructions.md");
      assert.ok(existsSync(copilotPath), "Should create copilot file");

      // Cursor should NOT exist
      const cursorPath = join(testDir, ".cursorrules");
      assert.ok(!existsSync(cursorPath), "Should NOT create cursor file");

      // lex.yaml should only mention copilot
      const yamlContent = readFileSync(join(testDir, "lex.yaml"), "utf-8");
      assert.match(yamlContent, /copilot: true/, "Should enable copilot");
      assert.ok(!yamlContent.includes("cursor"), "Should not mention cursor");
    });
  });

  describe("abort behavior", () => {
    it("should abort if files exist without --force", () => {
      // Create canonical file first
      const canonicalDir = join(testDir, ".smartergpt", "instructions");
      mkdirSync(canonicalDir, { recursive: true });
      writeFileSync(join(canonicalDir, "lex.md"), "# Existing");

      const result = runCli(["instructions", "init"]);

      assert.strictEqual(result.exitCode, 1, "Should exit with 1");
      assert.match(result.stdout, /already exist/, "Should mention existing files");
      assert.match(result.stdout, /--force/, "Should suggest --force");
    });

    it("should overwrite with --force", () => {
      // Create canonical file first
      const canonicalDir = join(testDir, ".smartergpt", "instructions");
      mkdirSync(canonicalDir, { recursive: true });
      writeFileSync(join(canonicalDir, "lex.md"), "# Old Content");

      const result = runCli(["instructions", "init", "--force"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");

      // Check content was replaced
      const canonicalContent = readFileSync(join(canonicalDir, "lex.md"), "utf-8");
      assert.match(canonicalContent, /canonical source/, "Should have new template content");
      assert.ok(!canonicalContent.includes("Old Content"), "Should not have old content");
    });
  });

  describe("error handling", () => {
    it("should reject invalid targets", () => {
      const result = runCli(["instructions", "init", "--targets", "invalid"]);

      assert.strictEqual(result.exitCode, 1, "Should exit with 1");
      assert.match(result.stdout, /Invalid target/, "Should show error for invalid target");
    });
  });

  describe("JSON output", () => {
    it("should output JSON with --json flag", () => {
      const result = runCli(["--json", "instructions", "init"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");

      // Extract JSON from output (may have log lines)
      const jsonMatch = result.stdout.match(/\{[\s\S]*"success"[\s\S]*\}/);
      assert.ok(jsonMatch, "Should contain JSON output");

      const parsed = JSON.parse(jsonMatch[0]);
      assert.strictEqual(parsed.success, true, "Should have success: true");
      assert.ok(Array.isArray(parsed.created), "Should have created array");
      assert.ok(parsed.created.length > 0, "Should have created files");
    });
  });
});

describe("lex instructions", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "lex-instructions-help-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  /**
   * Helper to run the CLI command
   */
  function runCli(args: string[]): { stdout: string; exitCode: number } {
    try {
      const stdout = execFileSync(process.execPath, [lexBin, ...args], {
        encoding: "utf-8",
        cwd: testDir,
        env: {
          ...process.env,
          LEX_LOG_LEVEL: "silent",
        },
      });
      return { stdout, exitCode: 0 };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; status?: number };
      const output = (err.stdout ?? "") + (err.stderr ?? "");
      return {
        stdout: output,
        exitCode: err.status ?? 1,
      };
    }
  }

  describe("help command", () => {
    it("should display help for instructions command", () => {
      const result = runCli(["instructions", "--help"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /Manage AI assistant instructions/, "Should show description");
      assert.match(result.stdout, /init/, "Should mention init subcommand");
      assert.match(result.stdout, /generate/, "Should mention generate subcommand");
    });

    it("should display help for instructions generate command", () => {
      const result = runCli(["instructions", "generate", "--help"]);

      assert.strictEqual(result.exitCode, 0, "Should exit with 0");
      assert.match(result.stdout, /--dry-run/, "Should show dry-run option");
      assert.match(result.stdout, /--verbose/, "Should show verbose option");
      assert.match(result.stdout, /--project-root/, "Should show project-root option");
    });
  });
});
