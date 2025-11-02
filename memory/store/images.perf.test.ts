/**
 * Performance Tests for Image Storage
 * 
 * Tests image storage and retrieval performance with large datasets.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { FrameStore } from "./framestore.js";
import { ImageManager } from "./images.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Image Manager - Performance", () => {
  let frameStore: FrameStore;
  let imageManager: ImageManager;
  let testDbPath: string;

  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "lex-perf-test-"));
    testDbPath = join(tmpDir, "test-perf.db");
    frameStore = new FrameStore(testDbPath);
    imageManager = new ImageManager(frameStore.getDatabase());
    return { frameStore, imageManager };
  }

  function teardown() {
    if (frameStore) {
      frameStore.close();
    }
    if (testDbPath) {
      try {
        rmSync(testDbPath, { force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  function createTestFrame(id: string) {
    const frame = {
      id,
      timestamp: new Date().toISOString(),
      branch: "main",
      module_scope: ["test/module"],
      summary_caption: "Test frame",
      reference_point: "test reference",
      status_snapshot: {
        next_action: "Test action",
      },
    };
    frameStore.insertFrame(frame);
    return frame;
  }

  test("store and retrieve 100 images efficiently", () => {
    const { frameStore, imageManager } = setup();
    try {
      const imageCount = 100;
      const imageSize = 1024; // 1KB per image
      const imageIds: string[] = [];

      // Create 10 frames with 10 images each
      const startStore = Date.now();
      for (let f = 0; f < 10; f++) {
        const frame = createTestFrame(`frame-${f}`);
        
        for (let i = 0; i < 10; i++) {
          const imageData = Buffer.alloc(imageSize, `img-${f}-${i}`);
          const imageId = imageManager.storeImage(frame.id, imageData, "image/png");
          imageIds.push(imageId);
        }
      }
      const storeTime = Date.now() - startStore;

      console.log(`  Stored ${imageCount} images in ${storeTime}ms (${(storeTime / imageCount).toFixed(2)}ms per image)`);

      // Verify all images were stored
      const totalCount = imageManager.getImageCount();
      assert.strictEqual(totalCount, imageCount, `Should have ${imageCount} images`);

      // Retrieve all images
      const startRetrieve = Date.now();
      for (const imageId of imageIds) {
        const retrieved = imageManager.getImage(imageId);
        assert.ok(retrieved, `Image ${imageId} should be retrievable`);
      }
      const retrieveTime = Date.now() - startRetrieve;

      console.log(`  Retrieved ${imageCount} images in ${retrieveTime}ms (${(retrieveTime / imageCount).toFixed(2)}ms per image)`);

      // Performance assertions
      assert.ok(storeTime < 5000, "Storing 100 images should take less than 5 seconds");
      assert.ok(retrieveTime < 2000, "Retrieving 100 images should take less than 2 seconds");
    } finally {
      teardown();
    }
  });

  test("list images for frames with many attachments", () => {
    const { frameStore, imageManager } = setup();
    try {
      const imagesPerFrame = 20;
      const frameCount = 10;

      // Create frames with many images
      const startSetup = Date.now();
      for (let f = 0; f < frameCount; f++) {
        const frame = createTestFrame(`frame-${f}`);
        
        for (let i = 0; i < imagesPerFrame; i++) {
          const imageData = Buffer.alloc(512, `data-${f}-${i}`);
          imageManager.storeImage(frame.id, imageData, "image/png");
        }
      }
      const setupTime = Date.now() - startSetup;
      console.log(`  Setup ${frameCount} frames with ${imagesPerFrame} images each in ${setupTime}ms`);

      // List images for each frame
      const startList = Date.now();
      for (let f = 0; f < frameCount; f++) {
        const images = imageManager.listFrameImages(`frame-${f}`);
        assert.strictEqual(images.length, imagesPerFrame, `Frame ${f} should have ${imagesPerFrame} images`);
        
        // Verify metadata
        for (const img of images) {
          assert.strictEqual(img.frame_id, `frame-${f}`, "Frame ID should match");
          assert.strictEqual(img.mime_type, "image/png", "MIME type should match");
          assert.ok(img.size > 0, "Size should be positive");
          assert.ok(img.created_at > 0, "Created timestamp should be set");
        }
      }
      const listTime = Date.now() - startList;

      console.log(`  Listed images for ${frameCount} frames in ${listTime}ms (${(listTime / frameCount).toFixed(2)}ms per frame)`);

      // Performance assertion
      assert.ok(listTime < 1000, "Listing images for 10 frames should take less than 1 second");
    } finally {
      teardown();
    }
  });

  test("delete operations with large datasets", () => {
    const { frameStore, imageManager } = setup();
    try {
      const imageCount = 50;
      const frame = createTestFrame("delete-test-frame");
      const imageIds: string[] = [];

      // Store images
      for (let i = 0; i < imageCount; i++) {
        const imageData = Buffer.alloc(256, `data-${i}`);
        const imageId = imageManager.storeImage(frame.id, imageData, "image/png");
        imageIds.push(imageId);
      }

      assert.strictEqual(imageManager.getImageCount(), imageCount, "Should have all images");

      // Delete images individually
      const startDelete = Date.now();
      let deleteCount = 0;
      for (const imageId of imageIds) {
        const deleted = imageManager.deleteImage(imageId);
        if (deleted) deleteCount++;
      }
      const deleteTime = Date.now() - startDelete;

      console.log(`  Deleted ${deleteCount} images in ${deleteTime}ms (${(deleteTime / deleteCount).toFixed(2)}ms per image)`);

      assert.strictEqual(deleteCount, imageCount, "Should have deleted all images");
      assert.strictEqual(imageManager.getImageCount(), 0, "Should have no images left");

      // Performance assertion
      assert.ok(deleteTime < 2000, "Deleting 50 images should take less than 2 seconds");
    } finally {
      teardown();
    }
  });

  test("total storage size calculation with many images", () => {
    const { frameStore, imageManager } = setup();
    try {
      const imageSize = 2048; // 2KB per image
      const imageCount = 100;
      let expectedTotal = 0;

      // Store images of varying sizes
      for (let i = 0; i < imageCount; i++) {
        const frameId = `size-frame-${i}`;
        const frame = createTestFrame(frameId);
        const size = imageSize + (i * 10); // Gradually increasing size
        const imageData = Buffer.alloc(size, `data-${i}`);
        imageManager.storeImage(frame.id, imageData, "image/png");
        expectedTotal += size;
      }

      const actualTotal = imageManager.getTotalImageSize();
      assert.strictEqual(actualTotal, expectedTotal, "Total size should match sum of all images");

      console.log(`  Total storage: ${(actualTotal / 1024 / 1024).toFixed(2)} MB for ${imageCount} images`);
      console.log(`  Average size: ${(actualTotal / imageCount / 1024).toFixed(2)} KB per image`);
    } finally {
      teardown();
    }
  });

  test("cascading delete performance with many images", () => {
    const { frameStore, imageManager } = setup();
    try {
      const framesCount = 5;
      const imagesPerFrame = 20;

      // Create frames with images
      for (let f = 0; f < framesCount; f++) {
        const frame = createTestFrame(`cascade-frame-${f}`);
        
        for (let i = 0; i < imagesPerFrame; i++) {
          const imageData = Buffer.alloc(128, `data-${f}-${i}`);
          imageManager.storeImage(frame.id, imageData, "image/png");
        }
      }

      const totalImages = framesCount * imagesPerFrame;
      assert.strictEqual(imageManager.getImageCount(), totalImages, "Should have all images");

      // Delete frames (should cascade to images)
      const startCascade = Date.now();
      const db = frameStore.getDatabase();
      for (let f = 0; f < framesCount; f++) {
        db.prepare("DELETE FROM frames WHERE id = ?").run(`cascade-frame-${f}`);
      }
      const cascadeTime = Date.now() - startCascade;

      console.log(`  Cascading delete of ${framesCount} frames (${totalImages} images) in ${cascadeTime}ms`);

      // Verify all images were deleted
      assert.strictEqual(imageManager.getImageCount(), 0, "All images should be deleted");

      // Performance assertion
      assert.ok(cascadeTime < 1000, "Cascading delete should take less than 1 second");
    } finally {
      teardown();
    }
  });
});
