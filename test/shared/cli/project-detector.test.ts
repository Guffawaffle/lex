/**
 * Project Detector Tests
 */

import { test } from "node:test";
import assert from "node:assert";
import { detectProject, describeProject } from "../../../src/shared/cli/project-detector.js";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), "lex-detector-test-" + Date.now());

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

test("detectProject: detects Node.js project", () => {
  setupTest();

  try {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({ name: "test", dependencies: {} })
    );

    const result = detectProject(testDir);

    assert.ok(result.type.includes("nodejs"), "Should detect nodejs");
  } finally {
    cleanup();
  }
});

test("detectProject: detects Python project", () => {
  setupTest();

  try {
    writeFileSync(join(testDir, "pyproject.toml"), "[tool.poetry]\nname = 'test'");

    const result = detectProject(testDir);

    assert.ok(result.type.includes("python"), "Should detect python");
  } finally {
    cleanup();
  }
});

test("detectProject: detects Rust project", () => {
  setupTest();

  try {
    writeFileSync(join(testDir, "Cargo.toml"), "[package]\nname = 'test'");

    const result = detectProject(testDir);

    assert.ok(result.type.includes("rust"), "Should detect rust");
  } finally {
    cleanup();
  }
});

test("detectProject: detects Go project", () => {
  setupTest();

  try {
    writeFileSync(join(testDir, "go.mod"), "module test");

    const result = detectProject(testDir);

    assert.ok(result.type.includes("go"), "Should detect go");
  } finally {
    cleanup();
  }
});

test("detectProject: detects React framework", () => {
  setupTest();

  try {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({ name: "test", dependencies: { react: "^18.0.0" } })
    );

    const result = detectProject(testDir);

    assert.ok(result.frameworks.includes("React"), "Should detect React");
  } finally {
    cleanup();
  }
});

test("detectProject: detects TypeScript", () => {
  setupTest();

  try {
    writeFileSync(
      join(testDir, "package.json"),
      JSON.stringify({ name: "test", devDependencies: { typescript: "^5.0.0" } })
    );

    const result = detectProject(testDir);

    assert.ok(result.frameworks.includes("TypeScript"), "Should detect TypeScript");
  } finally {
    cleanup();
  }
});

test("detectProject: detects VS Code", () => {
  setupTest();

  try {
    mkdirSync(join(testDir, ".vscode"));

    const result = detectProject(testDir);

    assert.strictEqual(result.hasVSCode, true, "Should detect VS Code");
  } finally {
    cleanup();
  }
});

test("detectProject: detects Cursor", () => {
  setupTest();

  try {
    mkdirSync(join(testDir, ".cursor"));

    const result = detectProject(testDir);

    assert.strictEqual(result.hasCursor, true, "Should detect Cursor");
  } finally {
    cleanup();
  }
});

test("detectProject: detects Git", () => {
  setupTest();

  try {
    mkdirSync(join(testDir, ".git"));

    const result = detectProject(testDir);

    assert.strictEqual(result.hasGit, true, "Should detect Git");
  } finally {
    cleanup();
  }
});

test("detectProject: handles unknown project type", () => {
  setupTest();

  try {
    // Empty directory

    const result = detectProject(testDir);

    assert.ok(result.type.includes("unknown"), "Should return unknown for empty directory");
  } finally {
    cleanup();
  }
});

test("describeProject: generates readable description for Node.js + React", () => {
  const detection = {
    type: ["nodejs"] as const,
    frameworks: ["TypeScript", "React"],
    hasGit: true,
    hasVSCode: false,
    hasCursor: false,
  };

  const description = describeProject(detection);

  assert.strictEqual(description, "TypeScript, React", "Should describe as TypeScript, React");
});

test("describeProject: generates readable description for Python + FastAPI", () => {
  const detection = {
    type: ["python"] as const,
    frameworks: ["FastAPI"],
    hasGit: true,
    hasVSCode: false,
    hasCursor: false,
  };

  const description = describeProject(detection);

  assert.strictEqual(description, "Python, FastAPI", "Should describe as Python, FastAPI");
});

test("describeProject: handles unknown project", () => {
  const detection = {
    type: ["unknown"] as const,
    frameworks: [],
    hasGit: false,
    hasVSCode: false,
    hasCursor: false,
  };

  const description = describeProject(detection);

  assert.strictEqual(description, "Unknown project type", "Should indicate unknown");
});
