/**
 * Image Manager for Frame Attachments
 *
 * Manages binary image storage in SQLite for Frame visual snapshots.
 * Supports multiple image formats with validation and efficient retrieval.
 */
import Database from "better-sqlite3-multiple-ciphers";
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
export declare const ALLOWED_MIME_TYPES: readonly [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
];
/**
 * Maximum image size in bytes (10MB)
 */
export declare const MAX_IMAGE_SIZE: number;
/**
 * Image Manager - handles binary image storage for Frames
 */
export declare class ImageManager {
  private db;
  constructor(db: Database.Database);
  /**
   * Store an image attachment for a Frame
   *
   * @param frameId - ID of the Frame to attach the image to
   * @param data - Binary image data as Buffer
   * @param mimeType - MIME type of the image (e.g., "image/png")
   * @returns The generated image_id
   * @throws Error if validation fails
   */
  storeImage(frameId: string, data: Buffer, mimeType: string): string;
  /**
   * Retrieve an image by its ID
   *
   * @param imageId - The image_id to retrieve
   * @returns Object containing image data and MIME type, or null if not found
   */
  getImage(imageId: string): {
    data: Buffer;
    mimeType: string;
  } | null;
  /**
   * List all images attached to a Frame
   *
   * @param frameId - The Frame ID to list images for
   * @returns Array of image metadata (without binary data)
   */
  listFrameImages(frameId: string): ImageMetadata[];
  /**
   * Delete an image by its ID
   *
   * @param imageId - The image_id to delete
   * @returns True if image was deleted, false if not found
   */
  deleteImage(imageId: string): boolean;
  /**
   * Get total count of images in storage
   *
   * @returns Total number of images
   */
  getImageCount(): number;
  /**
   * Get total size of all images in storage (in bytes)
   *
   * @returns Total size in bytes
   */
  getTotalImageSize(): number;
}
