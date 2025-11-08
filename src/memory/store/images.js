"use strict";
/**
 * Image Manager for Frame Attachments
 *
 * Manages binary image storage in SQLite for Frame visual snapshots.
 * Supports multiple image formats with validation and efficient retrieval.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageManager = exports.MAX_IMAGE_SIZE = exports.ALLOWED_MIME_TYPES = void 0;
var crypto_1 = require("crypto");
/**
 * Allowed MIME types for image storage
 */
exports.ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/svg+xml",
];
/**
 * Maximum image size in bytes (10MB)
 */
exports.MAX_IMAGE_SIZE = 10 * 1024 * 1024;
/**
 * Image Manager - handles binary image storage for Frames
 */
var ImageManager = /** @class */ (function () {
    function ImageManager(db) {
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
    ImageManager.prototype.storeImage = function (frameId, data, mimeType) {
        // Validate MIME type
        if (!exports.ALLOWED_MIME_TYPES.includes(mimeType)) {
            throw new Error("Invalid MIME type: ".concat(mimeType, ". Allowed types: ").concat(exports.ALLOWED_MIME_TYPES.join(", ")));
        }
        // Validate size
        if (data.length > exports.MAX_IMAGE_SIZE) {
            throw new Error("Image size ".concat(data.length, " bytes exceeds maximum ").concat(exports.MAX_IMAGE_SIZE, " bytes (10MB)"));
        }
        // Validate frameId exists
        var frameExists = this.db.prepare("SELECT id FROM frames WHERE id = ?").get(frameId);
        if (!frameExists) {
            throw new Error("Frame not found: ".concat(frameId));
        }
        // Generate image_id and store
        var imageId = "img-".concat(Date.now(), "-").concat((0, crypto_1.randomUUID)());
        var createdAt = Date.now();
        var stmt = this.db.prepare("\n      INSERT INTO images (image_id, frame_id, mime_type, data, created_at)\n      VALUES (?, ?, ?, ?, ?)\n    ");
        stmt.run(imageId, frameId, mimeType, data, createdAt);
        return imageId;
    };
    /**
     * Retrieve an image by its ID
     *
     * @param imageId - The image_id to retrieve
     * @returns Object containing image data and MIME type, or null if not found
     */
    ImageManager.prototype.getImage = function (imageId) {
        var stmt = this.db.prepare("\n      SELECT data, mime_type FROM images WHERE image_id = ?\n    ");
        var row = stmt.get(imageId);
        if (!row) {
            return null;
        }
        return {
            data: row.data,
            mimeType: row.mime_type,
        };
    };
    /**
     * List all images attached to a Frame
     *
     * @param frameId - The Frame ID to list images for
     * @returns Array of image metadata (without binary data)
     */
    ImageManager.prototype.listFrameImages = function (frameId) {
        var stmt = this.db.prepare("\n      SELECT \n        image_id, \n        frame_id, \n        mime_type, \n        LENGTH(data) as size,\n        created_at\n      FROM images\n      WHERE frame_id = ?\n      ORDER BY created_at ASC\n    ");
        var rows = stmt.all(frameId);
        return rows.map(function (row) { return ({
            image_id: row.image_id,
            frame_id: row.frame_id,
            mime_type: row.mime_type,
            size: row.size,
            created_at: row.created_at,
        }); });
    };
    /**
     * Delete an image by its ID
     *
     * @param imageId - The image_id to delete
     * @returns True if image was deleted, false if not found
     */
    ImageManager.prototype.deleteImage = function (imageId) {
        var stmt = this.db.prepare("\n      DELETE FROM images WHERE image_id = ?\n    ");
        var result = stmt.run(imageId);
        return result.changes > 0;
    };
    /**
     * Get total count of images in storage
     *
     * @returns Total number of images
     */
    ImageManager.prototype.getImageCount = function () {
        var result = this.db.prepare("SELECT COUNT(*) as count FROM images").get();
        return result.count;
    };
    /**
     * Get total size of all images in storage (in bytes)
     *
     * @returns Total size in bytes
     */
    ImageManager.prototype.getTotalImageSize = function () {
        var result = this.db.prepare("SELECT SUM(LENGTH(data)) as total FROM images").get();
        return result.total || 0;
    };
    return ImageManager;
}());
exports.ImageManager = ImageManager;
