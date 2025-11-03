/**
 * Tests for Memory Card Renderer
 *
 * Tests visual memory card generation with embedded images.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { MemoryCardRenderer, type FrameData } from "./card.js";
// @ts-ignore - importing from compiled dist
import { FrameStore } from "../../store/dist/framestore.js";
// @ts-ignore - importing from compiled dist
import { ImageManager } from "../../store/dist/images.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Memory Card Renderer", () => {
  let frameStore: FrameStore;
  let imageManager: ImageManager;
  let renderer: MemoryCardRenderer;
  let testDbPath: string;

  function setup() {
    const tmpDir = mkdtempSync(join(tmpdir(), "lex-renderer-test-"));
    testDbPath = join(tmpDir, "test-renderer.db");
    frameStore = new FrameStore(testDbPath);
    imageManager = new ImageManager(frameStore.getDatabase());
    renderer = new MemoryCardRenderer(imageManager);
    return { frameStore, imageManager, renderer, tmpDir };
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

  function createTestFrame(overrides: Partial<FrameData> = {}): FrameData {
    return {
      id: "test-frame-001",
      timestamp: "2025-11-02T10:00:00Z",
      branch: "main",
      module_scope: ["test/module"],
      summary_caption: "Test frame for rendering",
      reference_point: "test reference",
      status_snapshot: {
        next_action: "Test action",
        blockers: ["Blocker 1"],
        merge_blockers: ["Merge blocker 1"],
        tests_failing: ["test_one"],
      },
      keywords: ["test", "render"],
      ...overrides,
    };
  }

  test("renderTextCard generates text representation of Frame", () => {
    const { renderer } = setup();
    try {
      const frame = createTestFrame();
      const textCard = renderer.renderTextCard(frame);

      assert.ok(textCard, "Text card should be generated");
      assert.ok(textCard.includes("MEMORY FRAME"), "Should include title");
      assert.ok(textCard.includes(frame.id), "Should include Frame ID");
      assert.ok(textCard.includes(frame.reference_point), "Should include reference point");
      assert.ok(textCard.includes(frame.summary_caption), "Should include summary");
      assert.ok(textCard.includes(frame.branch), "Should include branch");
      assert.ok(textCard.includes(frame.status_snapshot.next_action), "Should include next action");
    } finally {
      teardown();
    }
  });

  test("renderTextCard includes image count when images present", () => {
    const { renderer } = setup();
    try {
      const frame = createTestFrame({
        image_ids: ["img-1", "img-2", "img-3"],
      });
      const textCard = renderer.renderTextCard(frame);

      assert.ok(textCard.includes("Images: 3"), "Should show image count");
    } finally {
      teardown();
    }
  });

  test("renderTextCard handles Frame without optional fields", () => {
    const { renderer } = setup();
    try {
      const frame = createTestFrame({
        jira: undefined,
        keywords: undefined,
        status_snapshot: {
          next_action: "Test action",
        },
      });
      const textCard = renderer.renderTextCard(frame);

      assert.ok(textCard, "Text card should be generated");
      assert.ok(!textCard.includes("Jira"), "Should not include Jira field");
      assert.ok(!textCard.includes("Keywords"), "Should not include Keywords field");
    } finally {
      teardown();
    }
  });

  test("renderCard generates PNG buffer without images", async () => {
    const { renderer } = setup();
    try {
      const frame = createTestFrame();
      const pngBuffer = await renderer.renderCard(frame);

      assert.ok(pngBuffer, "PNG buffer should be generated");
      assert.ok(Buffer.isBuffer(pngBuffer), "Should be a Buffer");
      assert.ok(pngBuffer.length > 0, "Buffer should have content");

      // Verify PNG magic bytes
      assert.strictEqual(pngBuffer[0], 0x89, "Should start with PNG magic bytes");
      assert.strictEqual(pngBuffer[1], 0x50, "Should have PNG signature");
      assert.strictEqual(pngBuffer[2], 0x4e, "Should have PNG signature");
      assert.strictEqual(pngBuffer[3], 0x47, "Should have PNG signature");
    } finally {
      teardown();
    }
  });

  test("renderCard with custom options changes output", async () => {
    const { renderer } = setup();
    try {
      const frame = createTestFrame();

      const defaultCard = await renderer.renderCard(frame);
      const customCard = await renderer.renderCard(frame, {
        width: 1000,
        fontSize: 18,
        backgroundColor: "#f0f0f0",
      });

      assert.ok(defaultCard.length !== customCard.length, "Different options should produce different output");
    } finally {
      teardown();
    }
  });

  test("renderCard with embedded images - stack layout", async () => {
    const { frameStore, imageManager, renderer } = setup();
    try {
      // Create Frame
      const frame = {
        id: "frame-with-img",
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["test/module"],
        summary_caption: "Frame with image",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };
      frameStore.insertFrame(frame);

      // Create a simple 1x1 PNG image (red pixel)
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
        0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const imageId = imageManager.storeImage(frame.id, pngData, "image/png");

      const frameData: FrameData = {
        ...frame,
        image_ids: [imageId],
      };

      const pngBuffer = await renderer.renderCard(frameData, {
        imageLayout: "stack",
      });

      assert.ok(pngBuffer, "PNG buffer should be generated");
      assert.ok(pngBuffer.length > 0, "Buffer should have content");
    } finally {
      teardown();
    }
  });

  test("renderCard with multiple embedded images - grid layout", async () => {
    const { frameStore, imageManager, renderer } = setup();
    try {
      // Create Frame
      const frame = {
        id: "frame-multi-img",
        timestamp: new Date().toISOString(),
        branch: "main",
        module_scope: ["test/module"],
        summary_caption: "Frame with multiple images",
        reference_point: "test",
        status_snapshot: { next_action: "Test" },
      };
      frameStore.insertFrame(frame);

      // Create simple PNG images
      const pngData = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d,
        0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
        0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const imageId1 = imageManager.storeImage(frame.id, pngData, "image/png");
      const imageId2 = imageManager.storeImage(frame.id, pngData, "image/png");

      const frameData: FrameData = {
        ...frame,
        image_ids: [imageId1, imageId2],
      };

      const pngBuffer = await renderer.renderCard(frameData, {
        imageLayout: "grid",
      });

      assert.ok(pngBuffer, "PNG buffer should be generated with grid layout");
      assert.ok(pngBuffer.length > 0, "Buffer should have content");
    } finally {
      teardown();
    }
  });

  test("renderCard handles missing images gracefully", async () => {
    const { renderer } = setup();
    try {
      const frame = createTestFrame({
        image_ids: ["nonexistent-img-1", "nonexistent-img-2"],
      });

      // Should not throw, just skip missing images
      const pngBuffer = await renderer.renderCard(frame);

      assert.ok(pngBuffer, "PNG buffer should be generated even with missing images");
    } finally {
      teardown();
    }
  });

  test("renderer without ImageManager can still render cards", async () => {
    try {
      const rendererNoImages = new MemoryCardRenderer();
      const frame = createTestFrame();

      const pngBuffer = await rendererNoImages.renderCard(frame);

      assert.ok(pngBuffer, "Should render card without ImageManager");
      assert.ok(Buffer.isBuffer(pngBuffer), "Should be a Buffer");
    } finally {
      // No cleanup needed
    }
  });

  test("renderCard includes all Frame metadata in output", async () => {
    const { renderer } = setup();
    try {
      const frame = createTestFrame({
        jira: "TEST-123",
        keywords: ["important", "urgent"],
        status_snapshot: {
          next_action: "Complete implementation",
          blockers: ["Dependency not ready"],
          merge_blockers: ["CI failing"],
          tests_failing: ["test_feature_x"],
        },
      });

      const pngBuffer = await renderer.renderCard(frame);

      // We can't easily verify the content of the PNG, but we can verify it was generated
      assert.ok(pngBuffer, "PNG should be generated with full metadata");
      assert.ok(pngBuffer.length > 5000, "PNG with metadata should be substantial");
    } finally {
      teardown();
    }
  });
});
