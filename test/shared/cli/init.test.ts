/**
 * Init Command Tests - Test policy generation from directory structure
 */

import { afterEach, test } from "node:test";
import assert from "node:assert";
import { init, resolveInitStoreBackend } from "../../../src/shared/cli/init.js";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-init-test-" + Date.now());
const originalStore = process.env.LEX_STORE;
const originalDatabaseUrl = process.env.LEX_DATABASE_URL;

afterEach(() => {
  if (originalStore === undefined) delete process.env.LEX_STORE;
  else process.env.LEX_STORE = originalStore;
  if (originalDatabaseUrl === undefined) delete process.env.LEX_DATABASE_URL;
  else process.env.LEX_DATABASE_URL = originalDatabaseUrl;
});

function setupTest() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
  mkdirSync(testDir, { recursive: true });
}

function cleanup() {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

test("init: creates workspace without policy flag", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    const result = await init({ json: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.ok(existsSync(join(testDir, ".smartergpt")), "Should create .smartergpt directory");
    assert.ok(existsSync(join(testDir, ".smartergpt/prompts")), "Should create prompts directory");
    assert.ok(
      existsSync(join(testDir, ".smartergpt/lex/lexmap.policy.json")),
      "Should create policy file"
    );
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: with --policy flag generates seed policy from src/ directory", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create source directories with TypeScript files
    mkdirSync(join(testDir, "src/memory/store"), { recursive: true });
    mkdirSync(join(testDir, "src/shared/cli"), { recursive: true });
    mkdirSync(join(testDir, "src/policy/check"), { recursive: true });

    writeFileSync(join(testDir, "src/memory/store/index.ts"), "export const test = 'test';");
    writeFileSync(join(testDir, "src/shared/cli/index.ts"), "export const cli = 'cli';");
    writeFileSync(join(testDir, "src/policy/check/index.ts"), "export const check = 'check';");

    const result = await init({ policy: true, json: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.strictEqual(result.modulesDiscovered, 3, "Should discover 3 modules");

    const policyPath = join(testDir, ".smartergpt/lex/lexmap.policy.json");
    assert.ok(existsSync(policyPath), "Should create policy file");

    const policyContent = JSON.parse(readFileSync(policyPath, "utf-8"));

    assert.strictEqual(policyContent.schemaVersion, "1.0.0", "Should have correct schema version");
    assert.ok(policyContent.modules["memory/store"], "Should have memory/store module");
    assert.ok(policyContent.modules["shared/cli"], "Should have shared/cli module");
    assert.ok(policyContent.modules["policy/check"], "Should have policy/check module");

    // Check module structure
    assert.strictEqual(
      policyContent.modules["memory/store"].description,
      "Auto-detected from src/memory/store/",
      "Should have correct description"
    );
    assert.deepStrictEqual(
      policyContent.modules["memory/store"].match,
      ["src/memory/store/**"],
      "Should have correct match pattern"
    );
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --policy generates minimal policy when no src/ directory exists", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    const result = await init({ policy: true, json: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.strictEqual(result.modulesDiscovered, 0, "Should discover 0 modules");

    const policyPath = join(testDir, ".smartergpt/lex/lexmap.policy.json");
    assert.ok(existsSync(policyPath), "Should create policy file");

    const policyContent = JSON.parse(readFileSync(policyPath, "utf-8"));

    assert.strictEqual(policyContent.schemaVersion, "1.0.0", "Should have correct schema version");
    assert.deepStrictEqual(policyContent.modules, {}, "Should have empty modules object");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --policy skips directories without TypeScript/JavaScript files", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create directories with and without code files
    mkdirSync(join(testDir, "src/memory/store"), { recursive: true });
    mkdirSync(join(testDir, "src/docs"), { recursive: true });
    mkdirSync(join(testDir, "src/config"), { recursive: true });

    writeFileSync(join(testDir, "src/memory/store/index.ts"), "export const test = 'test';");
    writeFileSync(join(testDir, "src/docs/README.md"), "# Docs"); // No code file
    writeFileSync(join(testDir, "src/config/config.json"), "{}"); // No code file

    const result = await init({ policy: true, json: true });

    assert.strictEqual(result.modulesDiscovered, 1, "Should discover only 1 module (memory/store)");

    const policyPath = join(testDir, ".smartergpt/lex/lexmap.policy.json");
    const policyContent = JSON.parse(readFileSync(policyPath, "utf-8"));

    assert.ok(policyContent.modules["memory/store"], "Should have memory/store module");
    assert.ok(!policyContent.modules["docs"], "Should not have docs module");
    assert.ok(!policyContent.modules["config"], "Should not have config module");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --policy non-destructive (preserves policy if it exists)", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create source directory
    mkdirSync(join(testDir, "src/memory/store"), { recursive: true });
    writeFileSync(join(testDir, "src/memory/store/index.ts"), "export const test = 'test';");

    // First init
    await init({ policy: true, json: true });

    // Second init should be an idempotent no-op
    const result = await init({ policy: true, json: true });

    assert.strictEqual(result.success, true, "Should succeed without changing existing files");
    assert.deepStrictEqual(result.filesCreated, [], "Should not rewrite the existing policy");
    assert.match(result.message, /no changes needed/, "Should report an idempotent no-op");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --policy --force overwrites existing policy", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create initial source directory
    mkdirSync(join(testDir, "src/memory/store"), { recursive: true });
    writeFileSync(join(testDir, "src/memory/store/index.ts"), "export const test = 'test';");

    // First init
    await init({ policy: true, json: true });

    // Add more modules
    mkdirSync(join(testDir, "src/shared/cli"), { recursive: true });
    writeFileSync(join(testDir, "src/shared/cli/index.ts"), "export const cli = 'cli';");

    // Force reinit
    const result = await init({ policy: true, force: true, json: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.strictEqual(result.modulesDiscovered, 2, "Should discover 2 modules");

    const policyPath = join(testDir, ".smartergpt/lex/lexmap.policy.json");
    const policyContent = JSON.parse(readFileSync(policyPath, "utf-8"));

    assert.ok(policyContent.modules["memory/store"], "Should have memory/store module");
    assert.ok(policyContent.modules["shared/cli"], "Should have shared/cli module");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --policy supports JavaScript files", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create source directory with JavaScript files
    mkdirSync(join(testDir, "src/utils"), { recursive: true });
    writeFileSync(join(testDir, "src/utils/index.js"), "export const test = 'test';");

    const result = await init({ policy: true, json: true });

    assert.strictEqual(result.modulesDiscovered, 1, "Should discover 1 module");

    const policyPath = join(testDir, ".smartergpt/lex/lexmap.policy.json");
    const policyContent = JSON.parse(readFileSync(policyPath, "utf-8"));

    assert.ok(policyContent.modules["utils"], "Should have utils module");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --policy skips node_modules and dist directories", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create source directories including ones that should be skipped
    mkdirSync(join(testDir, "src/memory/store"), { recursive: true });
    mkdirSync(join(testDir, "src/node_modules/something"), { recursive: true });
    mkdirSync(join(testDir, "src/dist/output"), { recursive: true });

    writeFileSync(join(testDir, "src/memory/store/index.ts"), "export const test = 'test';");
    writeFileSync(join(testDir, "src/node_modules/something/index.ts"), "export const nm = 'nm';");
    writeFileSync(join(testDir, "src/dist/output/index.ts"), "export const dist = 'dist';");

    const result = await init({ policy: true, json: true });

    assert.strictEqual(result.modulesDiscovered, 1, "Should discover only 1 module");

    const policyPath = join(testDir, ".smartergpt/lex/lexmap.policy.json");
    const policyContent = JSON.parse(readFileSync(policyPath, "utf-8"));

    assert.ok(policyContent.modules["memory/store"], "Should have memory/store module");
    assert.ok(!policyContent.modules["node_modules/something"], "Should not have node_modules");
    assert.ok(!policyContent.modules["dist/output"], "Should not have dist");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --policy generates sorted module list", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create modules in random order
    mkdirSync(join(testDir, "src/zebra"), { recursive: true });
    mkdirSync(join(testDir, "src/apple"), { recursive: true });
    mkdirSync(join(testDir, "src/middle"), { recursive: true });

    writeFileSync(join(testDir, "src/zebra/index.ts"), "export const z = 'z';");
    writeFileSync(join(testDir, "src/apple/index.ts"), "export const a = 'a';");
    writeFileSync(join(testDir, "src/middle/index.ts"), "export const m = 'm';");

    const result = await init({ policy: true, json: true });

    assert.strictEqual(result.modulesDiscovered, 3, "Should discover 3 modules");

    const policyPath = join(testDir, ".smartergpt/lex/lexmap.policy.json");
    const policyContent = JSON.parse(readFileSync(policyPath, "utf-8"));

    const moduleIds = Object.keys(policyContent.modules);

    // Check that modules are sorted alphabetically
    assert.deepStrictEqual(moduleIds, ["apple", "middle", "zebra"], "Modules should be sorted");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

// ============ Instructions Bootstrap Tests ============

test("init: creates instructions file by default", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    const result = await init({ json: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.strictEqual(result.instructionsCreated, true, "Should report instructions created");

    const instructionsPath = join(testDir, ".smartergpt/instructions/lex.md");
    assert.ok(existsSync(instructionsPath), "Should create instructions file");

    // Verify file is in filesCreated
    assert.ok(
      result.filesCreated.some((f) => f.includes("instructions/lex.md")),
      "Should include instructions file in filesCreated"
    );

    // Verify content is from the canonical template
    const content = readFileSync(instructionsPath, "utf-8");
    assert.ok(
      content.includes("Lex Instructions"),
      "Should contain canonical instructions content"
    );
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: preserves existing instructions file unless --force is used", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create existing workspace with custom instructions file
    mkdirSync(join(testDir, ".smartergpt/instructions"), { recursive: true });
    writeFileSync(join(testDir, ".smartergpt/instructions/lex.md"), "# Custom Instructions");

    // Init should repair other missing bootstrap files without replacing this one
    const result = await init({ json: true });

    assert.strictEqual(result.success, true, "Should complete the partial workspace");

    // Verify custom content is preserved
    const content = readFileSync(join(testDir, ".smartergpt/instructions/lex.md"), "utf-8");
    assert.strictEqual(content, "# Custom Instructions", "Should preserve custom instructions");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --force overwrites existing instructions file", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create existing instructions file with custom content
    mkdirSync(join(testDir, ".smartergpt/instructions"), { recursive: true });
    writeFileSync(join(testDir, ".smartergpt/instructions/lex.md"), "# Custom Instructions");

    const result = await init({ force: true, json: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.strictEqual(result.instructionsCreated, true, "Should report instructions created");

    // Verify content is replaced with canonical template
    const content = readFileSync(join(testDir, ".smartergpt/instructions/lex.md"), "utf-8");
    assert.ok(content.includes("Lex Instructions"), "Should replace with canonical instructions");
    assert.ok(!content.includes("Custom Instructions"), "Should not contain custom content");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --no-instructions skips instructions creation", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    const result = await init({ instructions: false, json: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.strictEqual(result.instructionsCreated, false, "Should not create instructions");

    // Verify instructions file was not created
    assert.ok(
      !existsSync(join(testDir, ".smartergpt/instructions/lex.md")),
      "Should not create instructions file"
    );

    // Verify no instructions file in filesCreated
    assert.ok(
      !result.filesCreated.some((f) => f.includes("instructions/lex.md")),
      "Should not include instructions file in filesCreated"
    );
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: creates instructions directory even if template is missing", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // This test verifies the directory is created (template should exist in the package)
    const result = await init({ json: true });

    assert.strictEqual(result.success, true, "Should succeed");

    // Verify instructions directory exists
    assert.ok(
      existsSync(join(testDir, ".smartergpt/instructions")),
      "Should create instructions directory"
    );
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

// ============ Enhanced Init Tests (Zero-to-Value) ============

test("init: detects Node.js project and creates IDE files", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create package.json to simulate Node.js project
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({
        name: "test-project",
        dependencies: { react: "^18.0.0", typescript: "^5.0.0" },
      })
    );

    const result = await init({ json: true, yes: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.strictEqual(
      result.projectType,
      "TypeScript, React",
      "Should detect TypeScript and React"
    );

    // Should create .github/copilot-instructions.md
    assert.ok(
      existsSync(join(testDir, ".github/copilot-instructions.md")),
      "Should create copilot instructions"
    );

    // Should create lex.yaml
    assert.ok(existsSync(join(testDir, "lex.yaml")), "Should create lex.yaml");

    // Verify copilot instructions has LEX markers
    const copilotContent = readFileSync(join(testDir, ".github/copilot-instructions.md"), "utf-8");
    assert.ok(copilotContent.includes("<!-- LEX:BEGIN -->"), "Should have LEX:BEGIN marker");
    assert.ok(copilotContent.includes("<!-- LEX:END -->"), "Should have LEX:END marker");
    assert.ok(copilotContent.includes("lex remember"), "Should include lex commands");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: detects Python project", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create pyproject.toml to simulate Python project
    writeFileSync(
      join(testDir, "pyproject.toml"),
      `[tool.poetry]
name = "test-app"
dependencies.fastapi = "^0.100.0"
`
    );

    const result = await init({ json: true, yes: true });

    assert.strictEqual(result.success, true, "Should succeed");
    assert.ok(result.projectType?.includes("Python"), "Should detect Python");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: creates lex.yaml with sensible defaults", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    const result = await init({ json: true, yes: true });

    assert.strictEqual(result.success, true, "Should succeed");

    const lexYamlPath = join(testDir, "lex.yaml");
    assert.ok(existsSync(lexYamlPath), "Should create lex.yaml");

    const content = readFileSync(lexYamlPath, "utf-8");
    assert.ok(content.includes("version: 1"), "Should have version");
    assert.ok(content.includes("instructions:"), "Should have instructions config");
    assert.ok(content.includes("canonical:"), "Should have canonical path");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: PostgreSQL bootstrap repairs a partial workspace without creating SQLite", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);
    process.env.LEX_STORE = "postgres";
    process.env.LEX_DATABASE_URL = "postgresql://lex:contract-secret@127.0.0.1:5432/lex";

    mkdirSync(join(testDir, ".smartergpt"), { recursive: true });
    writeFileSync(join(testDir, ".smartergpt/existing.txt"), "preserve me");

    const first = await init({ store: "postgres", json: true, yes: true, mcp: true });

    assert.strictEqual(first.success, true, "Should complete the partial workspace");
    assert.strictEqual(first.storeBackend, "postgres");
    assert.strictEqual(first.storeSource, "--store");
    assert.strictEqual(first.databaseInitialized, false);
    assert.ok(
      existsSync(join(testDir, ".smartergpt/lex/lexmap.policy.json")),
      "Should create a readable workspace policy"
    );
    assert.ok(existsSync(join(testDir, "lex.yaml")), "Should create workspace config");
    assert.ok(
      !existsSync(join(testDir, ".smartergpt/lex/memory.db")),
      "Must not create a SQLite database"
    );
    assert.strictEqual(
      readFileSync(join(testDir, ".smartergpt/existing.txt"), "utf-8"),
      "preserve me",
      "Should preserve existing workspace content"
    );
    assert.ok(!JSON.stringify(first).includes("contract-secret"), "Must not expose credentials");

    const mcpConfig = JSON.parse(readFileSync(join(testDir, ".vscode/mcp.json"), "utf-8"));
    assert.strictEqual(mcpConfig.servers.lex.env.LEX_STORE, "postgres");
    assert.ok(
      !("LEX_DATABASE_URL" in mcpConfig.servers.lex.env),
      "Generated MCP config must not copy database credentials"
    );

    const second = await init({ store: "postgres", json: true, yes: true, mcp: true });
    assert.strictEqual(second.success, true, "Repeated PostgreSQL init should succeed");
    assert.deepStrictEqual(second.filesCreated, [], "Repeated init should be a no-op");
    assert.ok(
      !existsSync(join(testDir, ".smartergpt/lex/memory.db")),
      "Repeated init must remain SQLite-free"
    );
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: backend resolution detects PostgreSQL URL without reading or returning it", () => {
  const environment = {
    LEX_DATABASE_URL: "postgresql://lex:contract-secret@127.0.0.1:5432/lex",
  } as NodeJS.ProcessEnv;

  const result = resolveInitStoreBackend(undefined, environment);

  assert.deepStrictEqual(result, { backend: "postgres", source: "LEX_DATABASE_URL" });
  assert.ok(!JSON.stringify(result).includes("contract-secret"));
});

test("init: explicit SQLite selection overrides PostgreSQL environment hints", () => {
  const environment = {
    LEX_STORE: "postgres",
    LEX_DATABASE_URL: "postgresql://lex@127.0.0.1:5432/lex",
  } as NodeJS.ProcessEnv;

  assert.deepStrictEqual(resolveInitStoreBackend("sqlite", environment), {
    backend: "sqlite",
    source: "--store",
  });
});

test("init: rejects an invalid backend before creating workspace files", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);
    const result = await init({ store: "mysql", json: true, yes: true });

    assert.strictEqual(result.success, false);
    assert.match(result.message, /Expected sqlite or postgres/);
    assert.ok(!existsSync(join(testDir, ".smartergpt")), "Should not create a partial workspace");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: is idempotent (running twice is a successful no-op)", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // First init
    const result1 = await init({ json: true, yes: true });
    assert.strictEqual(result1.success, true, "First init should succeed");

    // Second init (without --force) should succeed without rewriting files
    const result2 = await init({ json: true, yes: true });
    assert.strictEqual(result2.success, true, "Second init should succeed");
    assert.deepStrictEqual(result2.filesCreated, [], "Second init should not rewrite files");
    assert.match(result2.message, /no changes needed/, "Should report an idempotent no-op");

    // Verify files are intact
    assert.ok(
      existsSync(join(testDir, ".github/copilot-instructions.md")),
      "Files should still exist"
    );
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: --force allows reinitializing", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // First init
    await init({ json: true, yes: true });

    // Modify a file
    const copilotPath = join(testDir, ".github/copilot-instructions.md");
    writeFileSync(copilotPath, "# Custom content");

    // Second init with --force
    const result = await init({ json: true, yes: true, force: true });
    assert.strictEqual(result.success, true, "Should succeed with --force");

    // Verify file was overwritten
    const content = readFileSync(copilotPath, "utf-8");
    assert.ok(content.includes("LEX:BEGIN"), "Should restore LEX markers");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});

test("init: creates .cursorrules when Cursor is detected", async () => {
  setupTest();
  const originalCwd = process.cwd();

  try {
    process.chdir(testDir);

    // Create .cursor directory to simulate Cursor IDE
    mkdirSync(join(testDir, ".cursor"), { recursive: true });

    const result = await init({ json: true, yes: true });

    assert.strictEqual(result.success, true, "Should succeed");

    // Should create .cursorrules
    assert.ok(existsSync(join(testDir, ".cursorrules")), "Should create .cursorrules");

    // Verify .cursorrules has LEX markers
    const cursorContent = readFileSync(join(testDir, ".cursorrules"), "utf-8");
    assert.ok(cursorContent.includes("<!-- LEX:BEGIN -->"), "Should have LEX:BEGIN marker");
    assert.ok(cursorContent.includes("<!-- LEX:END -->"), "Should have LEX:END marker");
  } finally {
    process.chdir(originalCwd);
    cleanup();
  }
});
