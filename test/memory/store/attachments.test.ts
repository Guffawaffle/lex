/**
 * Tests for Attachment Manager
 *
 * Tests external file storage with content-hash deduplication.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { AttachmentManager } from "@app/memory/store/attachments.js";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Attachment Manager", () => {
  let attachmentManager: AttachmentManager;
  let testWorkspaceRoot: string;

  // Setup: create test workspace in temp directory
  function setup() {
    testWorkspaceRoot = mkdtempSync(join(tmpdir(), "lex-attachments-test-"));
    attachmentManager = new AttachmentManager(testWorkspaceRoot);
    return { attachmentManager };
  }

  // Teardown: cleanup test directory
  function teardown() {
    if (testWorkspaceRoot && existsSync(testWorkspaceRoot)) {
      rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  }

  test("storeAttachment stores a PNG image and returns reference", () => {
    const { attachmentManager } = setup();
    try {
      const imageData = Buffer.from("fake-png-data");
      const mimeType = "image/png";

      const ref = attachmentManager.storeAttachment(imageData, mimeType);

      assert.ok(ref.ref, "Should return attachment reference");
      assert.ok(ref.ref.startsWith("att_"), "Reference should have att_ prefix");
      assert.strictEqual(ref.mime_type, mimeType, "MIME type should match");
      assert.strictEqual(ref.size_bytes, imageData.length, "Size should match");
      assert.ok(
        ref.path.includes(".smartergpt/lex/attachments"),
        "Path should be in attachments dir"
      );
    } finally {
      teardown();
    }
  });

  test("storeAttachment deduplicates identical content", () => {
    const { attachmentManager } = setup();
    try {
      const imageData = Buffer.from("fake-png-data");
      const mimeType = "image/png";

      const ref1 = attachmentManager.storeAttachment(imageData, mimeType);
      const ref2 = attachmentManager.storeAttachment(imageData, mimeType);

      assert.strictEqual(ref1.ref, ref2.ref, "Should return same reference for identical content");
      assert.strictEqual(ref1.path, ref2.path, "Should point to same file");
    } finally {
      teardown();
    }
  });

  test("getAttachment retrieves base64-encoded data", () => {
    const { attachmentManager } = setup();
    try {
      const imageData = Buffer.from("fake-png-data");
      const mimeType = "image/png";

      const ref = attachmentManager.storeAttachment(imageData, mimeType);
      const retrieved = attachmentManager.getAttachment(ref.ref, "base64");

      assert.ok(retrieved, "Should retrieve attachment");
      assert.strictEqual(
        retrieved,
        imageData.toString("base64"),
        "Should return base64-encoded data"
      );
    } finally {
      teardown();
    }
  });

  test("getAttachment retrieves file path", () => {
    const { attachmentManager } = setup();
    try {
      const imageData = Buffer.from("fake-png-data");
      const mimeType = "image/png";

      const ref = attachmentManager.storeAttachment(imageData, mimeType);
      const path = attachmentManager.getAttachment(ref.ref, "path");

      assert.ok(path, "Should retrieve path");
      assert.ok(typeof path === "string", "Should return string path");
      assert.ok(existsSync(path!), "File should exist at path");
    } finally {
      teardown();
    }
  });

  test("getAttachment returns null for non-existent reference", () => {
    const { attachmentManager } = setup();
    try {
      const retrieved = attachmentManager.getAttachment("att_nonexistent");
      assert.strictEqual(retrieved, null, "Should return null for non-existent reference");
    } finally {
      teardown();
    }
  });

  test("getAttachmentRef retrieves metadata", () => {
    const { attachmentManager } = setup();
    try {
      const imageData = Buffer.from("fake-jpeg-data");
      const mimeType = "image/jpeg";

      const stored = attachmentManager.storeAttachment(imageData, mimeType);
      const retrieved = attachmentManager.getAttachmentRef(stored.ref);

      assert.ok(retrieved, "Should retrieve metadata");
      assert.strictEqual(retrieved!.ref, stored.ref, "Reference should match");
      assert.strictEqual(retrieved!.mime_type, mimeType, "MIME type should match");
      assert.strictEqual(retrieved!.size_bytes, imageData.length, "Size should match");
    } finally {
      teardown();
    }
  });

  test("handles different image formats", () => {
    const { attachmentManager } = setup();
    try {
      const formats = [
        { data: Buffer.from("png-data"), mime: "image/png", ext: ".png" },
        { data: Buffer.from("jpeg-data"), mime: "image/jpeg", ext: ".jpg" },
        { data: Buffer.from("gif-data"), mime: "image/gif", ext: ".gif" },
        { data: Buffer.from("webp-data"), mime: "image/webp", ext: ".webp" },
        { data: Buffer.from("<svg></svg>"), mime: "image/svg+xml", ext: ".svg" },
      ];

      for (const format of formats) {
        const ref = attachmentManager.storeAttachment(format.data, format.mime);
        assert.ok(ref.path.endsWith(format.ext), `Path should end with ${format.ext}`);
        assert.strictEqual(ref.mime_type, format.mime, "MIME type should match");
      }
    } finally {
      teardown();
    }
  });

  test("different content produces different references", () => {
    const { attachmentManager } = setup();
    try {
      const data1 = Buffer.from("image-1");
      const data2 = Buffer.from("image-2");

      const ref1 = attachmentManager.storeAttachment(data1, "image/png");
      const ref2 = attachmentManager.storeAttachment(data2, "image/png");

      assert.notStrictEqual(
        ref1.ref,
        ref2.ref,
        "Different content should produce different references"
      );
    } finally {
      teardown();
    }
  });
});
