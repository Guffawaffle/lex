/**
 * Tests for Image Manager
 *
 * Tests image storage, retrieval, validation, and management operations.
 * Uses Node.js built-in test runner (node:test) - no external dependencies.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { createDatabase } from "@app/memory/store/db.js";
import { saveFrame } from "@app/memory/store/queries.js";
import { ImageManager, MAX_IMAGE_SIZE } from "@app/memory/store/images.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type Database from "better-sqlite3";

describe("Image Manager", () => {
  let db: Database.Database;
  let imageManager: ImageManager;
  let testDbPath: string;

  // Setup: create test database in temp directory
  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "lex-img-test-"));
    testDbPath = join(tmpDir, "test-images.db");
    db = createDatabase(testDbPath);
    imageManager = new ImageManager(db);
    return { db, imageManager };
  }

  // Teardown: close database and cleanup
  function teardown() {
    if (db) {
      db.close();
    }
    if (testDbPath) {
      try {
        rmSync(testDbPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  // Helper to create a test Frame
  function createTestFrame(frameId: string = "test-frame-001") {
    const frame = {
      id: frameId,
      timestamp: new Date().toISOString(),
      branch: "main",
      module_scope: ["test/module"],
      summary_caption: "Test frame",
      reference_point: "test reference",
      status_snapshot: {
        next_action: "Test action",
      },
    };
    saveFrame(db, frame);
    return frame;
  }

  test("storeImage stores a PNG image successfully", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("fake-png-data");
      const mimeType = "image/png";

      const imageId = imageManager.storeImage(frame.id, imageData, mimeType);

      assert.ok(imageId, "Image ID should be returned");
      assert.ok(imageId.startsWith("img-"), "Image ID should have correct prefix");
    } finally {
      teardown();
    }
  });

  test("storeImage stores a JPEG image successfully", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("fake-jpeg-data");
      const mimeType = "image/jpeg";

      const imageId = imageManager.storeImage(frame.id, imageData, mimeType);

      assert.ok(imageId, "Image ID should be returned");
    } finally {
      teardown();
    }
  });

  test("getImage retrieves stored PNG image", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("fake-png-data");
      const mimeType = "image/png";

      const imageId = imageManager.storeImage(frame.id, imageData, mimeType);
      const retrieved = imageManager.getImage(imageId);

      assert.ok(retrieved, "Image should be retrieved");
      assert.strictEqual(retrieved!.mimeType, mimeType, "MIME type should match");
      assert.deepStrictEqual(retrieved!.data, imageData, "Image data should match");
    } finally {
      teardown();
    }
  });

  test("getImage retrieves stored JPEG image", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("fake-jpeg-data");
      const mimeType = "image/jpeg";

      const imageId = imageManager.storeImage(frame.id, imageData, mimeType);
      const retrieved = imageManager.getImage(imageId);

      assert.ok(retrieved, "Image should be retrieved");
      assert.strictEqual(retrieved!.mimeType, mimeType, "MIME type should match");
    } finally {
      teardown();
    }
  });

  test("storeImage rejects image exceeding 10MB size limit", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      // Create buffer larger than 10MB
      const imageData = Buffer.alloc(MAX_IMAGE_SIZE + 1);
      const mimeType = "image/png";

      assert.throws(
        () => imageManager.storeImage(frame.id, imageData, mimeType),
        /exceeds maximum/,
        "Should reject oversized image"
      );
    } finally {
      teardown();
    }
  });

  test("storeImage rejects invalid MIME type", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("fake-data");
      const invalidMimeType = "application/pdf";

      assert.throws(
        () => imageManager.storeImage(frame.id, imageData, invalidMimeType),
        /Invalid MIME type/,
        "Should reject invalid MIME type"
      );
    } finally {
      teardown();
    }
  });

  test("storeImage rejects image for non-existent Frame", () => {
    const { imageManager } = setup();
    try {
      const imageData = Buffer.from("fake-png-data");
      const mimeType = "image/png";

      assert.throws(
        () => imageManager.storeImage("nonexistent-frame", imageData, mimeType),
        /Frame not found/,
        "Should reject image for non-existent frame"
      );
    } finally {
      teardown();
    }
  });

  test("listFrameImages returns all images for a Frame", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData1 = Buffer.from("image-1");
      const imageData2 = Buffer.from("image-2");

      const imageId1 = imageManager.storeImage(frame.id, imageData1, "image/png");
      const imageId2 = imageManager.storeImage(frame.id, imageData2, "image/jpeg");

      const images = imageManager.listFrameImages(frame.id);

      assert.strictEqual(images.length, 2, "Should return 2 images");
      assert.ok(
        images.some((img) => img.image_id === imageId1),
        "Should include first image"
      );
      assert.ok(
        images.some((img) => img.image_id === imageId2),
        "Should include second image"
      );
      assert.strictEqual(images[0].frame_id, frame.id, "Frame ID should match");
      assert.strictEqual(images[0].mime_type, "image/png", "First MIME type should be PNG");
      assert.strictEqual(images[1].mime_type, "image/jpeg", "Second MIME type should be JPEG");
    } finally {
      teardown();
    }
  });

  test("listFrameImages returns empty array for Frame with no images", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const images = imageManager.listFrameImages(frame.id);

      assert.strictEqual(images.length, 0, "Should return empty array");
    } finally {
      teardown();
    }
  });

  test("deleteImage removes image from storage", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("fake-png-data");

      const imageId = imageManager.storeImage(frame.id, imageData, "image/png");

      const deleted = imageManager.deleteImage(imageId);
      assert.strictEqual(deleted, true, "Should return true for successful deletion");

      const retrieved = imageManager.getImage(imageId);
      assert.strictEqual(retrieved, null, "Image should no longer exist");
    } finally {
      teardown();
    }
  });

  test("deleteImage returns false for non-existent image", () => {
    const { imageManager } = setup();
    try {
      const deleted = imageManager.deleteImage("nonexistent-image-id");
      assert.strictEqual(deleted, false, "Should return false for non-existent image");
    } finally {
      teardown();
    }
  });

  test("multiple images per Frame are supported", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageIds: string[] = [];

      // Store 5 images
      for (let i = 0; i < 5; i++) {
        const imageData = Buffer.from(`image-data-${i}`);
        const imageId = imageManager.storeImage(
          frame.id,
          imageData,
          i % 2 === 0 ? "image/png" : "image/jpeg"
        );
        imageIds.push(imageId);
      }

      const images = imageManager.listFrameImages(frame.id);
      assert.strictEqual(images.length, 5, "Should have 5 images");

      // Verify all images can be retrieved
      for (const imageId of imageIds) {
        const retrieved = imageManager.getImage(imageId);
        assert.ok(retrieved, `Image ${imageId} should be retrievable`);
      }
    } finally {
      teardown();
    }
  });

  test("image metadata includes size and created_at", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("test-image-data");

      const beforeTime = Date.now();
      const _imageId = imageManager.storeImage(frame.id, imageData, "image/png");
      const afterTime = Date.now();

      const images = imageManager.listFrameImages(frame.id);
      assert.strictEqual(images.length, 1, "Should have 1 image");

      const metadata = images[0];
      assert.strictEqual(metadata.size, imageData.length, "Size should match");
      assert.ok(
        metadata.created_at >= beforeTime && metadata.created_at <= afterTime,
        "created_at should be within expected range"
      );
    } finally {
      teardown();
    }
  });

  test("getImageCount returns total number of images", () => {
    const { imageManager } = setup();
    try {
      const frame1 = createTestFrame("frame-1");
      const frame2 = createTestFrame("frame-2");

      assert.strictEqual(imageManager.getImageCount(), 0, "Should start with 0 images");

      imageManager.storeImage(frame1.id, Buffer.from("img1"), "image/png");
      assert.strictEqual(imageManager.getImageCount(), 1, "Should have 1 image");

      imageManager.storeImage(frame2.id, Buffer.from("img2"), "image/jpeg");
      assert.strictEqual(imageManager.getImageCount(), 2, "Should have 2 images");
    } finally {
      teardown();
    }
  });

  test("getTotalImageSize returns sum of all image sizes", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();

      const img1 = Buffer.from("image-1"); // 7 bytes
      const img2 = Buffer.from("image-22"); // 8 bytes

      imageManager.storeImage(frame.id, img1, "image/png");
      imageManager.storeImage(frame.id, img2, "image/jpeg");

      const totalSize = imageManager.getTotalImageSize();
      assert.strictEqual(totalSize, img1.length + img2.length, "Total size should match");
    } finally {
      teardown();
    }
  });

  test("SVG images are supported", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const svgData = Buffer.from('<svg><circle r="10"/></svg>');

      const imageId = imageManager.storeImage(frame.id, svgData, "image/svg+xml");
      const retrieved = imageManager.getImage(imageId);

      assert.ok(retrieved, "SVG should be stored and retrieved");
      assert.strictEqual(retrieved!.mimeType, "image/svg+xml", "MIME type should be SVG");
    } finally {
      teardown();
    }
  });

  test("image with exactly 10MB is accepted", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.alloc(MAX_IMAGE_SIZE); // Exactly 10MB

      const imageId = imageManager.storeImage(frame.id, imageData, "image/png");
      assert.ok(imageId, "10MB image should be accepted");
    } finally {
      teardown();
    }
  });

  test("cascading delete removes images when Frame is deleted", () => {
    const { imageManager } = setup();
    try {
      const frame = createTestFrame();
      const imageData = Buffer.from("test-image");

      const imageId = imageManager.storeImage(frame.id, imageData, "image/png");

      // Verify image exists
      let retrieved = imageManager.getImage(imageId);
      assert.ok(retrieved, "Image should exist");

      // Delete the Frame (this should cascade to images via foreign key)
      const deleteStmt = db.prepare("DELETE FROM frames WHERE id = ?");
      deleteStmt.run(frame.id);

      // Verify image was deleted
      retrieved = imageManager.getImage(imageId);
      assert.strictEqual(retrieved, null, "Image should be deleted with Frame");
    } finally {
      teardown();
    }
  });
});
