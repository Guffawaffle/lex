/**
 * CodeUnit Schema Tests
 *
 * Unit tests for CodeUnit schema validation and parsing
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import {
  CodeUnitSchema,
  CodeUnitKindSchema,
  parseCodeUnit,
  validateCodeUnit,
  type CodeUnit,
  type CodeUnitKind,
} from "../../../src/atlas/schemas/code-unit.js";

describe("CodeUnit Schema Validation", () => {
  const validCodeUnit: CodeUnit = {
    id: "abc123",
    repoId: "repo-1",
    filePath: "src/foo/bar.ts",
    language: "ts",
    kind: "method",
    symbolPath: "src/foo/bar.ts::MyClass.myMethod",
    name: "myMethod",
    span: { startLine: 10, endLine: 20 },
    discoveredAt: "2025-11-26T14:00:00Z",
    schemaVersion: "code-unit-v0",
  };

  test("validates a valid CodeUnit with all required fields", () => {
    const result = CodeUnitSchema.safeParse(validCodeUnit);
    assert.ok(result.success);
    if (result.success) {
      assert.strictEqual(result.data.id, "abc123");
      assert.strictEqual(result.data.kind, "method");
      assert.strictEqual(result.data.schemaVersion, "code-unit-v0");
    }
  });

  test("validates a valid CodeUnit with optional tags", () => {
    const codeUnitWithTags = {
      ...validCodeUnit,
      tags: ["test", "ui", "infra"],
    };
    const result = CodeUnitSchema.safeParse(codeUnitWithTags);
    assert.ok(result.success);
    if (result.success) {
      assert.deepStrictEqual(result.data.tags, ["test", "ui", "infra"]);
    }
  });

  test("validates a valid CodeUnit with optional docComment", () => {
    const codeUnitWithDoc = {
      ...validCodeUnit,
      docComment: "This is a method that does something",
    };
    const result = CodeUnitSchema.safeParse(codeUnitWithDoc);
    assert.ok(result.success);
    if (result.success) {
      assert.strictEqual(result.data.docComment, "This is a method that does something");
    }
  });

  test("rejects CodeUnit with missing required field (id)", () => {
    const invalid = { ...validCodeUnit };
    delete (invalid as Partial<CodeUnit>).id;
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with missing required field (repoId)", () => {
    const invalid = { ...validCodeUnit };
    delete (invalid as Partial<CodeUnit>).repoId;
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with missing required field (filePath)", () => {
    const invalid = { ...validCodeUnit };
    delete (invalid as Partial<CodeUnit>).filePath;
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with missing required field (language)", () => {
    const invalid = { ...validCodeUnit };
    delete (invalid as Partial<CodeUnit>).language;
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with invalid kind", () => {
    const invalid = { ...validCodeUnit, kind: "invalid-kind" };
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with invalid schemaVersion", () => {
    const invalid = { ...validCodeUnit, schemaVersion: "v1" };
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with invalid discoveredAt (non-ISO8601)", () => {
    const invalid = { ...validCodeUnit, discoveredAt: "not-a-date" };
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with invalid span (non-positive startLine)", () => {
    const invalid = {
      ...validCodeUnit,
      span: { startLine: 0, endLine: 20 },
    };
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("rejects CodeUnit with invalid span (negative endLine)", () => {
    const invalid = {
      ...validCodeUnit,
      span: { startLine: 10, endLine: -5 },
    };
    const result = CodeUnitSchema.safeParse(invalid);
    assert.ok(!result.success);
  });

  test("accepts all valid CodeUnitKind values", () => {
    const kinds: CodeUnitKind[] = ["module", "class", "function", "method"];
    kinds.forEach((kind) => {
      const result = CodeUnitKindSchema.safeParse(kind);
      assert.ok(result.success, `Kind '${kind}' should be valid`);
    });
  });
});

describe("parseCodeUnit function", () => {
  const validData = {
    id: "def456",
    repoId: "repo-2",
    filePath: "src/utils.ts",
    language: "ts",
    kind: "function",
    symbolPath: "src/utils.ts::helper",
    name: "helper",
    span: { startLine: 5, endLine: 15 },
    discoveredAt: "2025-11-26T15:00:00Z",
    schemaVersion: "code-unit-v0",
  };

  test("successfully parses valid CodeUnit data", () => {
    const result = parseCodeUnit(validData);
    assert.strictEqual(result.id, "def456");
    assert.strictEqual(result.kind, "function");
    assert.strictEqual(result.name, "helper");
  });

  test("throws on invalid data", () => {
    const invalidData = { ...validData, kind: "invalid" };
    assert.throws(() => parseCodeUnit(invalidData));
  });

  test("parses CodeUnit with optional fields", () => {
    const dataWithOptionals = {
      ...validData,
      tags: ["utility", "helper"],
      docComment: "Helper function",
    };
    const result = parseCodeUnit(dataWithOptionals);
    assert.deepStrictEqual(result.tags, ["utility", "helper"]);
    assert.strictEqual(result.docComment, "Helper function");
  });
});

describe("validateCodeUnit function", () => {
  const validData = {
    id: "ghi789",
    repoId: "repo-3",
    filePath: "src/models/User.ts",
    language: "ts",
    kind: "class",
    symbolPath: "src/models/User.ts::User",
    name: "User",
    span: { startLine: 1, endLine: 100 },
    discoveredAt: "2025-11-26T16:00:00Z",
    schemaVersion: "code-unit-v0",
  };

  test("returns success for valid data", () => {
    const result = validateCodeUnit(validData);
    assert.ok(result.success);
    if (result.success) {
      assert.strictEqual(result.data.id, "ghi789");
      assert.strictEqual(result.data.kind, "class");
    }
  });

  test("returns error for invalid data", () => {
    const invalidData = { ...validData, kind: "invalid-kind" };
    const result = validateCodeUnit(invalidData);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.error);
    }
  });

  test("returns error for missing required fields", () => {
    const invalidData = { id: "test" };
    const result = validateCodeUnit(invalidData);
    assert.ok(!result.success);
    if (!result.success) {
      assert.ok(result.error);
      assert.ok(result.error.issues.length > 0);
    }
  });
});

describe("CodeUnit Kind Validation", () => {
  test("module kind is valid", () => {
    const codeUnit = {
      id: "mod1",
      repoId: "repo-1",
      filePath: "src/index.ts",
      language: "ts",
      kind: "module",
      symbolPath: "src/index.ts",
      name: "index",
      span: { startLine: 1, endLine: 50 },
      discoveredAt: "2025-11-26T14:00:00Z",
      schemaVersion: "code-unit-v0",
    };
    const result = validateCodeUnit(codeUnit);
    assert.ok(result.success);
  });

  test("class kind is valid", () => {
    const codeUnit = {
      id: "class1",
      repoId: "repo-1",
      filePath: "src/Foo.ts",
      language: "ts",
      kind: "class",
      symbolPath: "src/Foo.ts::Foo",
      name: "Foo",
      span: { startLine: 1, endLine: 50 },
      discoveredAt: "2025-11-26T14:00:00Z",
      schemaVersion: "code-unit-v0",
    };
    const result = validateCodeUnit(codeUnit);
    assert.ok(result.success);
  });

  test("function kind is valid", () => {
    const codeUnit = {
      id: "func1",
      repoId: "repo-1",
      filePath: "src/utils.ts",
      language: "ts",
      kind: "function",
      symbolPath: "src/utils.ts::doSomething",
      name: "doSomething",
      span: { startLine: 10, endLine: 20 },
      discoveredAt: "2025-11-26T14:00:00Z",
      schemaVersion: "code-unit-v0",
    };
    const result = validateCodeUnit(codeUnit);
    assert.ok(result.success);
  });

  test("method kind is valid", () => {
    const codeUnit = {
      id: "method1",
      repoId: "repo-1",
      filePath: "src/Foo.ts",
      language: "ts",
      kind: "method",
      symbolPath: "src/Foo.ts::Foo.bar",
      name: "bar",
      span: { startLine: 15, endLine: 25 },
      discoveredAt: "2025-11-26T14:00:00Z",
      schemaVersion: "code-unit-v0",
    };
    const result = validateCodeUnit(codeUnit);
    assert.ok(result.success);
  });
});
