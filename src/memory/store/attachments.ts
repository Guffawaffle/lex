/**
 * Attachment Manager
 *
 * Manages external file storage for image attachments with content-hash
 * based deduplication. Images are stored in .smartergpt/lex/attachments/
 * with SHA256 hash filenames.
 *
 * This is part of AX-011 to reduce context bloat by storing images
 * externally and returning references instead of base64 inline data.
 */

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Attachment reference returned by storage operations
 */
export interface AttachmentRef {
  /** Attachment reference ID (att_<short-hash>) */
  ref: string;
  /** MIME type of the attachment */
  mime_type: string;
  /** Size in bytes */
  size_bytes: number;
  /** Relative path from workspace root */
  path: string;
}

/**
 * Attachment Manager - handles external file storage for attachments
 */
export class AttachmentManager {
  private attachmentsDir: string;

  /**
   * Create a new AttachmentManager
   * @param workspaceRoot - Workspace root directory (defaults to cwd)
   */
  constructor(workspaceRoot?: string) {
    const root = workspaceRoot || process.cwd();
    this.attachmentsDir = join(root, ".smartergpt", "lex", "attachments");

    // Ensure attachments directory exists
    if (!existsSync(this.attachmentsDir)) {
      mkdirSync(this.attachmentsDir, { recursive: true });
    }
  }

  /**
   * Store an attachment and return its reference
   * @param data - File data as Buffer
   * @param mimeType - MIME type of the attachment
   * @returns Attachment reference
   */
  storeAttachment(data: Buffer, mimeType: string): AttachmentRef {
    // Compute SHA256 hash of content
    const hash = createHash("sha256").update(data).digest("hex");

    // Determine file extension from MIME type
    const ext = this.getExtensionFromMimeType(mimeType);
    const filename = `${hash}${ext}`;
    const filePath = join(this.attachmentsDir, filename);

    // Write file if it doesn't exist (deduplication)
    if (!existsSync(filePath)) {
      writeFileSync(filePath, data);
    }

    // Generate attachment reference (short hash for readability)
    const shortHash = hash.substring(0, 12);
    const ref = `att_${shortHash}`;

    // Return attachment metadata
    return {
      ref,
      mime_type: mimeType,
      size_bytes: data.length,
      path: join(".smartergpt", "lex", "attachments", filename),
    };
  }

  /**
   * Get attachment data by reference
   * @param ref - Attachment reference (att_<hash>)
   * @param format - Return format (base64 or path)
   * @returns Attachment data or path
   */
  getAttachment(ref: string, format: "base64" | "path" = "base64"): string | null {
    // Find file by reference prefix
    const shortHash = ref.replace(/^att_/, "");
    const files = this.findFilesByPrefix(shortHash);

    if (files.length === 0) {
      return null;
    }

    const filePath = join(this.attachmentsDir, files[0]);

    if (format === "path") {
      return filePath;
    }

    // Return base64-encoded data
    const data = readFileSync(filePath);
    return data.toString("base64");
  }

  /**
   * Get attachment metadata by reference
   * @param ref - Attachment reference (att_<hash>)
   * @returns Attachment reference metadata or null
   */
  getAttachmentRef(ref: string): AttachmentRef | null {
    const shortHash = ref.replace(/^att_/, "");
    const files = this.findFilesByPrefix(shortHash);

    if (files.length === 0) {
      return null;
    }

    const filename = files[0];
    const filePath = join(this.attachmentsDir, filename);
    const data = readFileSync(filePath);
    const ext = filename.substring(filename.lastIndexOf("."));
    const mimeType = this.getMimeTypeFromExtension(ext);

    return {
      ref,
      mime_type: mimeType,
      size_bytes: data.length,
      path: join(".smartergpt", "lex", "attachments", filename),
    };
  }

  /**
   * Find files matching a hash prefix
   * @param prefix - Hash prefix to search for
   * @returns Array of matching filenames
   */
  private findFilesByPrefix(prefix: string): string[] {
    if (!existsSync(this.attachmentsDir)) {
      return [];
    }

    const files = readdirSync(this.attachmentsDir);
    return files.filter((f: string) => f.startsWith(prefix));
  }

  /**
   * Get file extension from MIME type
   * @param mimeType - MIME type
   * @returns File extension (including dot)
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const extensions: Record<string, string> = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
    };
    return extensions[mimeType] || ".bin";
  }

  /**
   * Get MIME type from file extension
   * @param ext - File extension (including dot)
   * @returns MIME type
   */
  private getMimeTypeFromExtension(ext: string): string {
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    return mimeTypes[ext] || "application/octet-stream";
  }
}
