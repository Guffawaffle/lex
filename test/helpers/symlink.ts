import { symlinkSync } from "node:fs";

interface SkippableTestContext {
  skip(message?: string): void;
}

/** Create a test-owned link, or explicitly skip when Windows denies link creation. */
export function createTestSymlinkOrSkip(
  context: SkippableTestContext,
  target: string,
  linkPath: string,
  type: "file" | "dir" = "file"
): boolean {
  try {
    symlinkSync(
      target,
      linkPath,
      process.platform === "win32" && type === "dir" ? "junction" : type
    );
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === "win32" && ["EACCES", "EPERM", "UNKNOWN"].includes(code ?? "")) {
      context.skip(
        `Windows denied test symlink creation (${code}); Linux CI retains full coverage.`
      );
      return false;
    }
    throw error;
  }
}
