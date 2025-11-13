/**
 * Prompt Loading Utility
 *
 * Loads prompt templates with precedence chain support:
 * 1. LEX_CANON_DIR/prompts (explicit environment override)
 * 2. .smartergpt.local/prompts/ (local overlay)
 * 3. prompts/ (published package location)
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { z } from "zod";

/**
 * Package prompts directory (published location)
 */
const PACKAGE_PROMPTS_DIR = "prompts";

/**
 * Local overlay directory (untracked)
 */
const LOCAL_PROMPTS_DIR = ".smartergpt.local/prompts";

/**
 * Environment variable for canon directory (contains prompts/ and schemas/)
 */
const CANON_DIR_ENV = "LEX_CANON_DIR";

/**
 * Find repository root by looking for package.json
 */
export function findRepoRoot(startPath: string): string {
  let currentPath = resolve(startPath);

  // 0) Optional explicit override (useful in tests/WSL/CI)
  const explicit = process.env.REPO_ROOT ?? process.env.SMARTERGPT_REPO_ROOT;
  if (explicit) {
    const abs = resolve(explicit);
    if (existsSync(join(abs, "package.json"))) {
      return abs;
    }
  }

  // Minimal, safe package.json validator
  const PackageJson = z.object({ name: z.string().min(1).optional() }).loose();

  // Walk upward to filesystem root
  while (true) {
    const pkgPath = join(currentPath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const parsed = PackageJson.parse(JSON.parse(readFileSync(pkgPath, "utf8")));
        const name = parsed.name;
        // Accept both repos (scoped or unscoped)
        if (
          name === "lex" ||
          name === "lex-pr-runner" ||
          name === "@guffawaffle/lex" ||
          name === "@guffawaffle/lex-pr-runner"
        ) {
          return currentPath;
        }
      } catch {
        // ignore and continue walking up
      }
    }

    const parent = dirname(currentPath);
    if (parent === currentPath) break; // reached FS root
    currentPath = parent;
  }

  throw new Error("Could not find repository root (package.json with recognized name).");
}

/**
 * Load prompt template with precedence chain
 *
 * @param promptName - Name of the prompt file (e.g., "idea.md", "create-project.md")
 * @returns Prompt content as string
 * @throws Error if prompt file cannot be found in any location
 *
 * Precedence chain:
 * 1. LEX_CANON_DIR/prompts (explicit environment override)
 * 2. .smartergpt.local/prompts/ (local overlay - untracked)
 * 3. prompts/ (published package location)
 *
 * @example
 * ```typescript
 * const ideaPrompt = loadPrompt('idea.md');
 * console.log(ideaPrompt); // Prompt template content
 * ```
 *
 * @example With environment variable override
 * ```typescript
 * process.env.LEX_CANON_DIR = '/custom/canon';
 * const prompt = loadPrompt('idea.md'); // Loads from /custom/canon/prompts/idea.md
 * ```
 *
 * @example Local overlay (create .smartergpt.local/prompts/idea.md to override)
 * ```typescript
 * // If .smartergpt.local/prompts/idea.md exists, it takes precedence
 * const prompt = loadPrompt('idea.md');
 * ```
 */
export function loadPrompt(promptName: string): string {
  const canonDir = process.env[CANON_DIR_ENV];
  const attemptedPaths: string[] = [];

  try {
    // Priority 1: LEX_CANON_DIR/prompts (explicit override)
    if (canonDir) {
      const canonPath = join(canonDir, "prompts", promptName);
      attemptedPaths.push(canonPath);

      if (existsSync(canonPath)) {
        return readFileSync(canonPath, "utf-8");
      }
    }

    // Get repo root for local and package paths
    const repoRoot = findRepoRoot(process.cwd());

    // Priority 2: Local overlay (.smartergpt.local/prompts/)
    const localPath = join(repoRoot, LOCAL_PROMPTS_DIR, promptName);
    attemptedPaths.push(localPath);

    if (existsSync(localPath)) {
      return readFileSync(localPath, "utf-8");
    }

    // Priority 3: Package prompts directory
    const packagePath = join(repoRoot, PACKAGE_PROMPTS_DIR, promptName);
    attemptedPaths.push(packagePath);

    if (existsSync(packagePath)) {
      return readFileSync(packagePath, "utf-8");
    }

    // No prompt found in any location
    throw new Error(
      `Prompt file '${promptName}' not found. Tried:\n` +
        attemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
    );
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("not found")) {
      throw error; // Re-throw our custom error message
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load prompt '${promptName}': ${message}`);
  }
}

/**
 * Get the path where a prompt would be loaded from (without loading it)
 *
 * @param promptName - Name of the prompt file
 * @returns Resolved path or null if not found
 *
 * @example
 * ```typescript
 * const path = getPromptPath('idea.md');
 * console.log(path); // '/repo/prompts/idea.md'
 * ```
 */
export function getPromptPath(promptName: string): string | null {
  const canonDir = process.env[CANON_DIR_ENV];

  try {
    // Priority 1: LEX_CANON_DIR/prompts
    if (canonDir) {
      const canonPath = join(canonDir, "prompts", promptName);
      if (existsSync(canonPath)) {
        return canonPath;
      }
    }

    const repoRoot = findRepoRoot(process.cwd());

    // Priority 2: Local overlay
    const localPath = join(repoRoot, LOCAL_PROMPTS_DIR, promptName);
    if (existsSync(localPath)) {
      return localPath;
    }

    // Priority 3: Package prompts
    const packagePath = join(repoRoot, PACKAGE_PROMPTS_DIR, promptName);
    if (existsSync(packagePath)) {
      return packagePath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * List all available prompts across all precedence levels
 *
 * @returns Array of unique prompt names (deduplicated)
 *
 * @example
 * ```typescript
 * const prompts = listPrompts();
 * console.log(prompts); // ['idea.md', 'create-project.md', ...]
 * ```
 */
export function listPrompts(): string[] {
  const prompts = new Set<string>();
  const canonDir = process.env[CANON_DIR_ENV];

  try {
    const repoRoot = findRepoRoot(process.cwd());

    // Collect from package prompts
    const packagePath = join(repoRoot, PACKAGE_PROMPTS_DIR);
    if (existsSync(packagePath)) {
      const files = readdirSync(packagePath);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    }

    // Collect from local (overlay)
    const localPath = join(repoRoot, LOCAL_PROMPTS_DIR);
    if (existsSync(localPath)) {
      const files = readdirSync(localPath);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    }

    // Collect from LEX_CANON_DIR/prompts (if specified)
    if (canonDir) {
      const canonPath = join(canonDir, "prompts");
      if (existsSync(canonPath)) {
        const files = readdirSync(canonPath);
        files.forEach((file: string) => {
          if (file.endsWith(".md")) {
            prompts.add(file);
          }
        });
      }
    }

    return Array.from(prompts).sort();
  } catch {
    return [];
  }
}
