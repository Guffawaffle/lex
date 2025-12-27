/**
 * Tests for Persona storage (Migration V10)
 *
 * Tests CRUD operations for managed persona definitions.
 *
 * @see https://github.com/Guffawaffle/lex/issues/616
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { unlinkSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  getDb,
  closeDb,
  savePersona,
  getPersona,
  listPersonas,
  deletePersona,
  upsertPersona,
  getPersonaChecksum,
} from "@app/memory/store/index.js";
import type { PersonaRecord } from "@app/memory/store/index.js";

// Test database path
const TEST_DB_PATH = join(tmpdir(), `test-personas-${Date.now()}.db`);

// Sample test personas
const testPersona1 = {
  id: "quality-first_engineering",
  version: "1.0.0",
  manifest_yaml: `
id: quality-first_engineering
name: Quality First Engineering
description: Prioritizes thoroughness, testing, and correctness
principles:
  - text: Always run tests before committing
    severity: must
  - text: Code review is mandatory
    severity: should
`,
  source: "user" as const,
};

const testPersona2 = {
  id: "momentum-first_product",
  version: "1.0.0",
  manifest_yaml: `
id: momentum-first_product
name: Momentum First Product
description: Prioritizes velocity, shipping, and iteration
principles:
  - text: Ship early and iterate
    severity: must
  - text: Perfect is the enemy of done
    severity: should
`,
  source: "bundled" as const,
};

describe("Persona Storage Tests", () => {
  let db: ReturnType<typeof getDb>;

  before(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = getDb(TEST_DB_PATH);
  });

  after(() => {
    closeDb();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  describe("savePersona and getPersona", () => {
    test("should save and retrieve a persona", () => {
      // Save
      savePersona(
        db,
        testPersona1.id,
        testPersona1.manifest_yaml,
        testPersona1.version,
        testPersona1.source
      );

      // Retrieve
      const retrieved = getPersona(db, testPersona1.id);

      assert.ok(retrieved, "Persona should be retrieved");
      assert.strictEqual(retrieved.id, testPersona1.id);
      assert.strictEqual(retrieved.version, testPersona1.version);
      assert.strictEqual(retrieved.manifest_yaml, testPersona1.manifest_yaml);
      assert.strictEqual(retrieved.source, testPersona1.source);
      assert.ok(retrieved.created_at, "Should have created_at timestamp");
      assert.ok(retrieved.updated_at, "Should have updated_at timestamp");
      assert.ok(retrieved.checksum, "Should have checksum");
    });

    test("should return null for non-existent persona", () => {
      const retrieved = getPersona(db, "non-existent-persona");
      assert.strictEqual(retrieved, null);
    });

    test("should fail to save duplicate persona", () => {
      // First save should work (already saved)
      // Second save with same ID should fail
      assert.throws(() => {
        savePersona(db, testPersona1.id, "new content", "2.0.0");
      }, /UNIQUE constraint failed|SQLITE_CONSTRAINT/);
    });
  });

  describe("listPersonas", () => {
    before(() => {
      // Add second persona
      savePersona(
        db,
        testPersona2.id,
        testPersona2.manifest_yaml,
        testPersona2.version,
        testPersona2.source
      );
    });

    test("should list all personas", () => {
      const personas = listPersonas(db);
      assert.ok(personas.length >= 2, "Should have at least 2 personas");

      const ids = personas.map((p) => p.id);
      assert.ok(ids.includes(testPersona1.id));
      assert.ok(ids.includes(testPersona2.id));
    });

    test("should filter by source", () => {
      const userPersonas = listPersonas(db, { source: "user" });
      const bundledPersonas = listPersonas(db, { source: "bundled" });

      assert.ok(
        userPersonas.every((p) => p.source === "user"),
        "All should be user personas"
      );
      assert.ok(
        bundledPersonas.every((p) => p.source === "bundled"),
        "All should be bundled personas"
      );

      // Our test data has one of each
      assert.ok(
        userPersonas.some((p) => p.id === testPersona1.id),
        "User personas should include testPersona1"
      );
      assert.ok(
        bundledPersonas.some((p) => p.id === testPersona2.id),
        "Bundled personas should include testPersona2"
      );
    });

    test("should return empty array for non-matching filter", () => {
      const projectPersonas = listPersonas(db, { source: "project" });
      assert.ok(Array.isArray(projectPersonas));
      assert.strictEqual(projectPersonas.length, 0);
    });
  });

  describe("deletePersona", () => {
    test("should delete an existing persona", () => {
      // Create a persona to delete
      const tempId = "temp-persona-to-delete";
      savePersona(db, tempId, "temp content", "1.0.0");

      // Verify it exists
      assert.ok(getPersona(db, tempId), "Persona should exist before delete");

      // Delete
      const deleted = deletePersona(db, tempId);
      assert.strictEqual(deleted, true);

      // Verify it's gone
      assert.strictEqual(getPersona(db, tempId), null);
    });

    test("should return false for non-existent persona", () => {
      const deleted = deletePersona(db, "non-existent");
      assert.strictEqual(deleted, false);
    });
  });

  describe("upsertPersona", () => {
    test("should insert new persona", () => {
      const newId = "upsert-test-new";
      upsertPersona(db, newId, "new content", "1.0.0", "project");

      const retrieved = getPersona(db, newId);
      assert.ok(retrieved);
      assert.strictEqual(retrieved.id, newId);
      assert.strictEqual(retrieved.version, "1.0.0");
      assert.strictEqual(retrieved.source, "project");
    });

    test("should update existing persona", () => {
      const id = "upsert-test-update";
      savePersona(db, id, "original content", "1.0.0");

      const original = getPersona(db, id);
      assert.ok(original);
      assert.strictEqual(original.manifest_yaml, "original content");

      // Wait a bit to ensure updated_at differs
      const originalChecksum = original.checksum;

      // Upsert with new content
      upsertPersona(db, id, "updated content", "2.0.0", "user");

      const updated = getPersona(db, id);
      assert.ok(updated);
      assert.strictEqual(updated.manifest_yaml, "updated content");
      assert.strictEqual(updated.version, "2.0.0");
      assert.notStrictEqual(updated.checksum, originalChecksum);
    });
  });

  describe("getPersonaChecksum", () => {
    test("should return checksum for existing persona", () => {
      const checksum = getPersonaChecksum(db, testPersona1.id);
      assert.ok(checksum);
      assert.strictEqual(typeof checksum, "string");
      assert.strictEqual(checksum.length, 64); // SHA256 hex is 64 chars
    });

    test("should return null for non-existent persona", () => {
      const checksum = getPersonaChecksum(db, "non-existent");
      assert.strictEqual(checksum, null);
    });
  });

  describe("checksum consistency", () => {
    test("should produce same checksum for same content", () => {
      const id1 = "checksum-test-1";
      const id2 = "checksum-test-2";
      const content = "identical content for checksum test";

      savePersona(db, id1, content, "1.0.0");
      savePersona(db, id2, content, "1.0.0");

      const checksum1 = getPersonaChecksum(db, id1);
      const checksum2 = getPersonaChecksum(db, id2);

      assert.strictEqual(checksum1, checksum2);
    });

    test("should produce different checksums for different content", () => {
      const id1 = "checksum-diff-1";
      const id2 = "checksum-diff-2";

      savePersona(db, id1, "content A", "1.0.0");
      savePersona(db, id2, "content B", "1.0.0");

      const checksum1 = getPersonaChecksum(db, id1);
      const checksum2 = getPersonaChecksum(db, id2);

      assert.notStrictEqual(checksum1, checksum2);
    });
  });
});
