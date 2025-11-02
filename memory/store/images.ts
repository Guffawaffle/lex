/**
 * Image Manager for Frame Attachments
 * 
 * Manages binary image storage in SQLite for Frame visual snapshots.
 * Supports multiple image formats with validation and efficient retrieval.
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

/**
 * Metadata for a stored image
 */
export interface ImageMetadata {
  image_id: string;
  frame_id: string;
  mime_type: string;
  size: number;
  created_at: number;
}

/**
 * Allowed MIME types for image storage
 */
export const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
] as const;

/**
 * Maximum image size in bytes (10MB)
 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * Image Manager - handles binary image storage for Frames
 */
export class ImageManager {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Store an image attachment for a Frame
   * 
   * @param frameId - ID of the Frame to attach the image to
   * @param data - Binary image data as Buffer
   * @param mimeType - MIME type of the image (e.g., "image/png")
   * @returns The generated image_id
   * @throws Error if validation fails
   */
  storeImage(frameId: string, data: Buffer, mimeType: string): string {
    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
      throw new Error(
        `Invalid MIME type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(", ")}`
      );
    }

    // Validate size
    if (data.length > MAX_IMAGE_SIZE) {
      throw new Error(
        `Image size ${data.length} bytes exceeds maximum ${MAX_IMAGE_SIZE} bytes (10MB)`
      );
    }

    // Validate frameId exists
    const frameExists = this.db
      .prepare("SELECT id FROM frames WHERE id = ?")
      .get(frameId);
    
    if (!frameExists) {
      throw new Error(`Frame not found: ${frameId}`);
    }

    // Generate image_id and store
    const imageId = `img-${Date.now()}-${randomUUID()}`;
    const createdAt = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO images (image_id, frame_id, mime_type, data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(imageId, frameId, mimeType, data, createdAt);

    return imageId;
  }

  /**
   * Retrieve an image by its ID
   * 
   * @param imageId - The image_id to retrieve
   * @returns Object containing image data and MIME type, or null if not found
   */
  getImage(imageId: string): { data: Buffer; mimeType: string } | null {
    const stmt = this.db.prepare(`
      SELECT data, mime_type FROM images WHERE image_id = ?
    `);

    const row = stmt.get(imageId) as
      | { data: Buffer; mime_type: string }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      data: row.data,
      mimeType: row.mime_type,
    };
  }

  /**
   * List all images attached to a Frame
   * 
   * @param frameId - The Frame ID to list images for
   * @returns Array of image metadata (without binary data)
   */
  listFrameImages(frameId: string): ImageMetadata[] {
    const stmt = this.db.prepare(`
      SELECT 
        image_id, 
        frame_id, 
        mime_type, 
        LENGTH(data) as size,
        created_at
      FROM images
      WHERE frame_id = ?
      ORDER BY created_at ASC
    `);

    const rows = stmt.all(frameId) as Array<{
      image_id: string;
      frame_id: string;
      mime_type: string;
      size: number;
      created_at: number;
    }>;

    return rows.map((row) => ({
      image_id: row.image_id,
      frame_id: row.frame_id,
      mime_type: row.mime_type,
      size: row.size,
      created_at: row.created_at,
    }));
  }

  /**
   * Delete an image by its ID
   * 
   * @param imageId - The image_id to delete
   * @returns True if image was deleted, false if not found
   */
  deleteImage(imageId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM images WHERE image_id = ?
    `);

    const result = stmt.run(imageId);
    return result.changes > 0;
  }

  /**
   * Get total count of images in storage
   * 
   * @returns Total number of images
   */
  getImageCount(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM images")
      .get() as { count: number };

    return result.count;
  }

  /**
   * Get total size of all images in storage (in bytes)
   * 
   * @returns Total size in bytes
   */
  getTotalImageSize(): number {
    const result = this.db
      .prepare("SELECT SUM(LENGTH(data)) as total FROM images")
      .get() as { total: number | null };

    return result.total || 0;
  }
}
