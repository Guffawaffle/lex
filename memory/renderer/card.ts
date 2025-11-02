/**
 * Memory Card Renderer
 * 
 * Generates visual memory cards for Frames with embedded images.
 * Supports PNG output with inline image rendering and multiple image layouts.
 */

import { createCanvas, loadImage, Canvas, Image } from "canvas";
// @ts-ignore - importing type from compiled dist
import type { ImageManager } from "../store/dist/images.js";

/**
 * Frame data for rendering
 */
export interface FrameData {
  id: string;
  timestamp: string;
  branch: string;
  jira?: string;
  module_scope: string[];
  summary_caption: string;
  reference_point: string;
  status_snapshot: {
    next_action: string;
    blockers?: string[];
    merge_blockers?: string[];
    tests_failing?: string[];
  };
  keywords?: string[];
  atlas_frame_id?: string;
  image_ids?: string[];
}

/**
 * Options for memory card rendering
 */
export interface RenderOptions {
  /** Width of the memory card in pixels (default: 800) */
  width?: number;
  /** Height per section in pixels (default: auto-calculated) */
  padding?: number;
  /** Font size for text (default: 14) */
  fontSize?: number;
  /** Background color (default: "#ffffff") */
  backgroundColor?: string;
  /** Text color (default: "#000000") */
  textColor?: string;
  /** Accent color for headers (default: "#0066cc") */
  accentColor?: string;
  /** Maximum width for embedded images (default: 600) */
  maxImageWidth?: number;
  /** Image layout: 'stack' or 'grid' (default: 'stack') */
  imageLayout?: "stack" | "grid";
}

const DEFAULT_OPTIONS: Required<RenderOptions> = {
  width: 800,
  padding: 20,
  fontSize: 14,
  backgroundColor: "#ffffff",
  textColor: "#000000",
  accentColor: "#0066cc",
  maxImageWidth: 600,
  imageLayout: "stack",
};

/**
 * Memory Card Renderer
 */
export class MemoryCardRenderer {
  private imageManager?: ImageManager;

  constructor(imageManager?: ImageManager) {
    this.imageManager = imageManager;
  }

  /**
   * Render a Frame as a PNG memory card
   * 
   * @param frame - Frame data to render
   * @param options - Rendering options
   * @returns PNG image buffer
   */
  async renderCard(
    frame: FrameData,
    options: RenderOptions = {}
  ): Promise<Buffer> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Load images if available
    const images: Image[] = [];
    if (frame.image_ids && frame.image_ids.length > 0 && this.imageManager) {
      for (const imageId of frame.image_ids) {
        const imgData = this.imageManager.getImage(imageId);
        if (imgData) {
          try {
            const img = await loadImage(imgData.data);
            images.push(img);
          } catch (error) {
            console.warn(`Failed to load image ${imageId}:`, error);
          }
        }
      }
    }

    // Calculate canvas height
    const lineHeight = opts.fontSize * 1.5;
    let height = opts.padding * 2;

    // Header section
    height += lineHeight * 2; // Title + timestamp

    // Frame details
    height += lineHeight * 8; // Reference, summary, branch, jira, modules, keywords

    // Status snapshot
    const blockerCount = frame.status_snapshot.blockers?.length || 0;
    const mergeBlockerCount = frame.status_snapshot.merge_blockers?.length || 0;
    const testsFailingCount = frame.status_snapshot.tests_failing?.length || 0;
    height += lineHeight * (4 + blockerCount + mergeBlockerCount + testsFailingCount);

    // Images section
    if (images.length > 0) {
      height += lineHeight; // "Images:" header
      if (opts.imageLayout === "stack") {
        // Stack images vertically
        for (const img of images) {
          const scale = Math.min(1, opts.maxImageWidth / img.width);
          const scaledHeight = img.height * scale;
          height += scaledHeight + opts.padding;
        }
      } else {
        // Grid layout (2 columns)
        const rows = Math.ceil(images.length / 2);
        const maxHeight = Math.max(
          ...images.map((img) => {
            const scale = Math.min(1, (opts.maxImageWidth / 2 - opts.padding) / img.width);
            return img.height * scale;
          })
        );
        height += rows * (maxHeight + opts.padding);
      }
    }

    // Create canvas
    const canvas = createCanvas(opts.width, height);
    const ctx = canvas.getContext("2d");

    // Fill background
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, opts.width, height);

    // Draw content
    ctx.fillStyle = opts.textColor;
    ctx.font = `${opts.fontSize}px sans-serif`;

    let y = opts.padding + opts.fontSize;

    // Header
    ctx.fillStyle = opts.accentColor;
    ctx.font = `bold ${opts.fontSize * 1.5}px sans-serif`;
    ctx.fillText("Memory Frame", opts.padding, y);
    y += lineHeight * 1.5;

    ctx.fillStyle = opts.textColor;
    ctx.font = `${opts.fontSize}px sans-serif`;
    ctx.fillText(`ID: ${frame.id}`, opts.padding, y);
    y += lineHeight;
    ctx.fillText(`Timestamp: ${frame.timestamp}`, opts.padding, y);
    y += lineHeight * 1.5;

    // Frame details
    ctx.fillStyle = opts.accentColor;
    ctx.font = `bold ${opts.fontSize}px sans-serif`;
    ctx.fillText("Details:", opts.padding, y);
    y += lineHeight;

    ctx.fillStyle = opts.textColor;
    ctx.font = `${opts.fontSize}px sans-serif`;
    ctx.fillText(`📍 Reference: ${frame.reference_point}`, opts.padding * 2, y);
    y += lineHeight;
    ctx.fillText(`💬 Summary: ${frame.summary_caption}`, opts.padding * 2, y);
    y += lineHeight;
    ctx.fillText(`🌿 Branch: ${frame.branch}`, opts.padding * 2, y);
    y += lineHeight;

    if (frame.jira) {
      ctx.fillText(`🎫 Jira: ${frame.jira}`, opts.padding * 2, y);
      y += lineHeight;
    }

    ctx.fillText(`📦 Modules: ${frame.module_scope.join(", ")}`, opts.padding * 2, y);
    y += lineHeight;

    if (frame.keywords && frame.keywords.length > 0) {
      ctx.fillText(`🏷️  Keywords: ${frame.keywords.join(", ")}`, opts.padding * 2, y);
      y += lineHeight;
    }

    y += lineHeight * 0.5;

    // Status snapshot
    ctx.fillStyle = opts.accentColor;
    ctx.font = `bold ${opts.fontSize}px sans-serif`;
    ctx.fillText("Status:", opts.padding, y);
    y += lineHeight;

    ctx.fillStyle = opts.textColor;
    ctx.font = `${opts.fontSize}px sans-serif`;
    ctx.fillText(`⏭️  Next Action: ${frame.status_snapshot.next_action}`, opts.padding * 2, y);
    y += lineHeight;

    if (frame.status_snapshot.blockers && frame.status_snapshot.blockers.length > 0) {
      ctx.fillText(`🚫 Blockers:`, opts.padding * 2, y);
      y += lineHeight;
      for (const blocker of frame.status_snapshot.blockers) {
        ctx.fillText(`   • ${blocker}`, opts.padding * 3, y);
        y += lineHeight;
      }
    }

    if (frame.status_snapshot.merge_blockers && frame.status_snapshot.merge_blockers.length > 0) {
      ctx.fillText(`⛔ Merge Blockers:`, opts.padding * 2, y);
      y += lineHeight;
      for (const blocker of frame.status_snapshot.merge_blockers) {
        ctx.fillText(`   • ${blocker}`, opts.padding * 3, y);
        y += lineHeight;
      }
    }

    if (frame.status_snapshot.tests_failing && frame.status_snapshot.tests_failing.length > 0) {
      ctx.fillText(`❌ Tests Failing:`, opts.padding * 2, y);
      y += lineHeight;
      for (const test of frame.status_snapshot.tests_failing) {
        ctx.fillText(`   • ${test}`, opts.padding * 3, y);
        y += lineHeight;
      }
    }

    // Render images
    if (images.length > 0) {
      y += lineHeight * 0.5;
      ctx.fillStyle = opts.accentColor;
      ctx.font = `bold ${opts.fontSize}px sans-serif`;
      ctx.fillText(`Images (${images.length}):`, opts.padding, y);
      y += lineHeight;

      if (opts.imageLayout === "stack") {
        // Stack images vertically
        for (const img of images) {
          const scale = Math.min(1, opts.maxImageWidth / img.width);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          const x = opts.padding + (opts.maxImageWidth - scaledWidth) / 2;

          ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          y += scaledHeight + opts.padding;
        }
      } else {
        // Grid layout (2 columns)
        const imgWidth = (opts.maxImageWidth - opts.padding) / 2;
        let col = 0;
        let rowY = y;
        let maxRowHeight = 0;

        for (const img of images) {
          const scale = Math.min(1, imgWidth / img.width);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          const x = opts.padding + col * (imgWidth + opts.padding);

          ctx.drawImage(img, x, rowY, scaledWidth, scaledHeight);

          maxRowHeight = Math.max(maxRowHeight, scaledHeight);
          col++;

          if (col >= 2) {
            col = 0;
            rowY += maxRowHeight + opts.padding;
            maxRowHeight = 0;
          }
        }

        y = rowY + maxRowHeight;
      }
    }

    // Return PNG buffer
    return canvas.toBuffer("image/png");
  }

  /**
   * Render a simple text-based memory card (no images)
   * Useful for testing without canvas dependency
   * 
   * @param frame - Frame data to render
   * @returns Text representation
   */
  renderTextCard(frame: FrameData): string {
    const lines: string[] = [];

    lines.push("╔═══════════════════════════════════════════════════════════════╗");
    lines.push("║                      MEMORY FRAME                            ║");
    lines.push("╠═══════════════════════════════════════════════════════════════╣");
    lines.push(`║ ID: ${frame.id.padEnd(57)}║`);
    lines.push(`║ Timestamp: ${frame.timestamp.padEnd(50)}║`);
    lines.push("╠═══════════════════════════════════════════════════════════════╣");
    lines.push(`║ 📍 Reference: ${frame.reference_point.padEnd(47)}║`);
    lines.push(`║ 💬 Summary: ${frame.summary_caption.padEnd(49)}║`);
    lines.push(`║ 🌿 Branch: ${frame.branch.padEnd(50)}║`);

    if (frame.jira) {
      lines.push(`║ 🎫 Jira: ${frame.jira.padEnd(52)}║`);
    }

    lines.push(`║ 📦 Modules: ${frame.module_scope.join(", ").substring(0, 47).padEnd(47)}║`);

    if (frame.keywords && frame.keywords.length > 0) {
      lines.push(`║ 🏷️  Keywords: ${frame.keywords.join(", ").substring(0, 45).padEnd(45)}║`);
    }

    lines.push("╠═══════════════════════════════════════════════════════════════╣");
    lines.push(`║ ⏭️  Next Action: ${frame.status_snapshot.next_action.substring(0, 43).padEnd(43)}║`);

    if (frame.status_snapshot.blockers && frame.status_snapshot.blockers.length > 0) {
      lines.push(`║ 🚫 Blockers: ${frame.status_snapshot.blockers.length.toString().padEnd(47)}║`);
    }

    if (frame.status_snapshot.merge_blockers && frame.status_snapshot.merge_blockers.length > 0) {
      lines.push(`║ ⛔ Merge Blockers: ${frame.status_snapshot.merge_blockers.length.toString().padEnd(42)}║`);
    }

    if (frame.status_snapshot.tests_failing && frame.status_snapshot.tests_failing.length > 0) {
      lines.push(`║ ❌ Tests Failing: ${frame.status_snapshot.tests_failing.length.toString().padEnd(43)}║`);
    }

    if (frame.image_ids && frame.image_ids.length > 0) {
      lines.push("╠═══════════════════════════════════════════════════════════════╣");
      lines.push(`║ 🖼️  Images: ${frame.image_ids.length.toString().padEnd(50)}║`);
    }

    lines.push("╚═══════════════════════════════════════════════════════════════╝");

    return lines.join("\n");
  }
}
