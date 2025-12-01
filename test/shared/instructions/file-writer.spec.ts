/**
 * Tests for the File Writer with Atomic Writes
 */

import { describe, it, before, after } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeProjections,
  type ProjectionResult,
  type WriteOptions,
} from "../../../src/shared/instructions/file-writer.js";

describe("File Writer", () => {
  let tempDir: string;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-writer-test-"));
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("writeProjections", () => {
    describe("create new files", () => {
      it("creates a new file with content", () => {
        const targetPath = path.join(tempDir, "new-file-1", "test.md");
        const content = "# Header\n\nContent here.";
        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.deepEqual(result.written, [targetPath]);
        assert.deepEqual(result.skipped, []);
        assert.deepEqual(result.errors, []);

        // Verify file was created
        assert.ok(fs.existsSync(targetPath), "File should exist");
        assert.equal(fs.readFileSync(targetPath, "utf-8"), content);
      });

      it("creates parent directories as needed", () => {
        const targetPath = path.join(tempDir, "nested", "deeply", "test.md");
        const content = "Nested content";
        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.ok(fs.existsSync(targetPath), "Nested file should exist");
        assert.equal(fs.readFileSync(targetPath, "utf-8"), content);
      });

      it("handles multiple projections", () => {
        const file1 = path.join(tempDir, "multi-1", "a.md");
        const file2 = path.join(tempDir, "multi-2", "b.md");
        const projections: ProjectionResult[] = [
          { path: file1, content: "Content A" },
          { path: file2, content: "Content B" },
        ];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.equal(result.written.length, 2);
        assert.ok(result.written.includes(file1));
        assert.ok(result.written.includes(file2));
        assert.equal(fs.readFileSync(file1, "utf-8"), "Content A");
        assert.equal(fs.readFileSync(file2, "utf-8"), "Content B");
      });
    });

    describe("update existing files", () => {
      it("overwrites existing file with new content", () => {
        const targetPath = path.join(tempDir, "update-1", "test.md");
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, "Old content");

        const newContent = "New content";
        const projections: ProjectionResult[] = [{ path: targetPath, content: newContent }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.deepEqual(result.written, [targetPath]);
        assert.equal(fs.readFileSync(targetPath, "utf-8"), newContent);
      });

      it("skips file when content is unchanged", () => {
        const targetPath = path.join(tempDir, "skip-1", "test.md");
        const content = "Same content";
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content);

        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.deepEqual(result.written, []);
        assert.deepEqual(result.skipped, [targetPath]);
      });
    });

    describe("dry-run mode", () => {
      it("does not create files in dry-run mode", () => {
        const targetPath = path.join(tempDir, "dryrun-1", "test.md");
        const content = "Would create this";
        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: true, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.deepEqual(result.written, [targetPath]);
        assert.ok(!fs.existsSync(targetPath), "File should NOT exist in dry-run");
      });

      it("does not modify existing files in dry-run mode", () => {
        const targetPath = path.join(tempDir, "dryrun-2", "test.md");
        const originalContent = "Original content";
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, originalContent);

        const newContent = "New content";
        const projections: ProjectionResult[] = [{ path: targetPath, content: newContent }];
        const options: WriteOptions = { dryRun: true, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.deepEqual(result.written, [targetPath]);
        // File content should be unchanged
        assert.equal(fs.readFileSync(targetPath, "utf-8"), originalContent);
      });

      it("still skips unchanged files in dry-run mode", () => {
        const targetPath = path.join(tempDir, "dryrun-3", "test.md");
        const content = "Same content";
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content);

        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: true, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.deepEqual(result.written, []);
        assert.deepEqual(result.skipped, [targetPath]);
      });
    });

    describe("backup support", () => {
      it("creates .bak file before overwriting", () => {
        const targetPath = path.join(tempDir, "backup-1", "test.md");
        const backupPath = `${targetPath}.bak`;
        const originalContent = "Original content";
        const newContent = "New content";

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, originalContent);

        const projections: ProjectionResult[] = [{ path: targetPath, content: newContent }];
        const options: WriteOptions = { dryRun: false, backup: true };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.ok(fs.existsSync(backupPath), "Backup file should exist");
        assert.equal(fs.readFileSync(backupPath, "utf-8"), originalContent);
        assert.equal(fs.readFileSync(targetPath, "utf-8"), newContent);
      });

      it("does not create backup for new files", () => {
        const targetPath = path.join(tempDir, "backup-2", "test.md");
        const backupPath = `${targetPath}.bak`;
        const content = "New file content";

        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: false, backup: true };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.ok(fs.existsSync(targetPath), "File should exist");
        assert.ok(!fs.existsSync(backupPath), "Backup should NOT exist for new files");
      });

      it("does not create backup when backup option is false", () => {
        const targetPath = path.join(tempDir, "backup-3", "test.md");
        const backupPath = `${targetPath}.bak`;

        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, "Original");

        const projections: ProjectionResult[] = [{ path: targetPath, content: "Updated" }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.ok(!fs.existsSync(backupPath), "Backup should NOT exist when disabled");
      });
    });

    describe("atomic writes", () => {
      it("does not leave temp files on success", () => {
        const targetPath = path.join(tempDir, "atomic-1", "test.md");
        const content = "Content";

        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);

        // Check for temp files
        const dir = path.dirname(targetPath);
        const files = fs.readdirSync(dir);
        const tempFiles = files.filter((f) => f.endsWith(".tmp"));
        assert.equal(tempFiles.length, 0, "No temp files should remain");
      });

      it("writes correct content atomically", () => {
        const targetPath = path.join(tempDir, "atomic-2", "test.md");
        const content = "Final content that should appear atomically";

        const projections: ProjectionResult[] = [{ path: targetPath, content }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.equal(fs.readFileSync(targetPath, "utf-8"), content);
      });
    });

    describe("error handling", () => {
      it("reports error for invalid path", () => {
        // Use a path inside a file (which will fail)
        const existingFile = path.join(tempDir, "error-1", "existing.md");
        fs.mkdirSync(path.dirname(existingFile), { recursive: true });
        fs.writeFileSync(existingFile, "content");

        const invalidPath = path.join(existingFile, "nested.md");
        const projections: ProjectionResult[] = [{ path: invalidPath, content: "Content" }];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, false);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].path, invalidPath);
        assert.ok(result.errors[0].error.length > 0);
      });

      it("continues writing other files after an error", () => {
        const goodFile = path.join(tempDir, "error-2", "good.md");
        const existingFile = path.join(tempDir, "error-2", "existing.md");
        fs.mkdirSync(path.dirname(existingFile), { recursive: true });
        fs.writeFileSync(existingFile, "content");
        const badFile = path.join(existingFile, "bad.md");

        const projections: ProjectionResult[] = [
          { path: goodFile, content: "Good content" },
          { path: badFile, content: "Bad content" },
        ];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, false);
        assert.deepEqual(result.written, [goodFile]);
        assert.equal(result.errors.length, 1);
        assert.equal(result.errors[0].path, badFile);
        assert.ok(fs.existsSync(goodFile), "Good file should still be written");
      });

      it("handles empty projections array", () => {
        const projections: ProjectionResult[] = [];
        const options: WriteOptions = { dryRun: false, backup: false };

        const result = writeProjections(projections, options);

        assert.equal(result.success, true);
        assert.deepEqual(result.written, []);
        assert.deepEqual(result.skipped, []);
        assert.deepEqual(result.errors, []);
      });
    });
  });
});
