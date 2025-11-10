/**
 * Prompt Loading Utility
 *
 * Loads prompt templates with precedence chain support:
 * 1. LEX_PROMPTS_DIR (explicit environment override)
 * 2. .smartergpt.local/prompts/ (local overlay)
 * 3. .smartergpt/prompts/ (tracked canon)
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";

/**
 * Canon prompt directory (tracked)
 */
const CANON_PROMPTS_DIR = ".smartergpt/prompts";

/**
 * Local overlay directory (untracked)
 */
const LOCAL_PROMPTS_DIR = ".smartergpt.local/prompts";

/**
 * Environment variable for custom prompts directory
 */
const PROMPTS_DIR_ENV = "LEX_PROMPTS_DIR";

/**
 * Find repository root by looking for package.json
 */
function findRepoRoot(startPath: string): string {
  let currentPath = startPath;

  while (currentPath !== dirname(currentPath)) {
    const packageJsonPath = join(currentPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      // Check if this is the lex root package
      if (packageJson.name === "lex") {
        return currentPath;
      }
    }
    currentPath = dirname(currentPath);
  }

  throw new Error('Could not find repository root (looking for package.json with name "lex")');
}

/**
 * Load prompt template with precedence chain
 *
 * @param promptName - Name of the prompt file (e.g., "idea.md", "create-project.md")
 * @returns Prompt content as string
 * @throws Error if prompt file cannot be found in any location
 *
 * Precedence chain:
 * 1. LEX_PROMPTS_DIR environment variable (explicit override)
 * 2. .smartergpt.local/prompts/ (local overlay - untracked)
 * 3. .smartergpt/prompts/ (tracked canon)
 *
 * @example
 * ```typescript
 * const ideaPrompt = loadPrompt('idea.md');
 * console.log(ideaPrompt); // Prompt template content
 * ```
 *
 * @example With environment variable override
 * ```typescript
 * process.env.LEX_PROMPTS_DIR = '/custom/prompts';
 * const prompt = loadPrompt('custom-prompt.md');
 * ```
 *
 * @example Local overlay (create .smartergpt.local/prompts/idea.md to override canon)
 * ```typescript
 * // If .smartergpt.local/prompts/idea.md exists, it takes precedence
 * const prompt = loadPrompt('idea.md');
 * ```
 */
export function loadPrompt(promptName: string): string {
  const envDir = process.env[PROMPTS_DIR_ENV];
  const attemptedPaths: string[] = [];

  try {
    if (envDir) {
      // Priority 1: Environment variable (explicit override)
      const envPath = resolve(envDir, promptName);
      attemptedPaths.push(envPath);

      if (existsSync(envPath)) {
        return readFileSync(envPath, "utf-8");
      }
    }

    // Get repo root for local and canon paths
    const repoRoot = findRepoRoot(process.cwd());

    // Priority 2: Local overlay (.smartergpt.local/prompts/)
    const localPath = join(repoRoot, LOCAL_PROMPTS_DIR, promptName);
    attemptedPaths.push(localPath);

    if (existsSync(localPath)) {
      return readFileSync(localPath, "utf-8");
    }

    // Priority 3: Tracked canon (.smartergpt/prompts/)
    const canonPath = join(repoRoot, CANON_PROMPTS_DIR, promptName);
    attemptedPaths.push(canonPath);

    if (existsSync(canonPath)) {
      return readFileSync(canonPath, "utf-8");
    }

    // No prompt found in any location
    throw new Error(
      `Prompt file '${promptName}' not found. Tried:\n` + attemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
    );
  } catch (error: any) {
    if (error.message.includes("not found")) {
      throw error; // Re-throw our custom error message
    }
    throw new Error(`Failed to load prompt '${promptName}': ${error.message}`);
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
 * console.log(path); // '/repo/.smartergpt/prompts/idea.md'
 * ```
 */
export function getPromptPath(promptName: string): string | null {
  const envDir = process.env[PROMPTS_DIR_ENV];

  try {
    if (envDir) {
      const envPath = resolve(envDir, promptName);
      if (existsSync(envPath)) {
        return envPath;
      }
    }

    const repoRoot = findRepoRoot(process.cwd());

    const localPath = join(repoRoot, LOCAL_PROMPTS_DIR, promptName);
    if (existsSync(localPath)) {
      return localPath;
    }

    const canonPath = join(repoRoot, CANON_PROMPTS_DIR, promptName);
    if (existsSync(canonPath)) {
      return canonPath;
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
  const envDir = process.env[PROMPTS_DIR_ENV];

  try {
    const repoRoot = findRepoRoot(process.cwd());

    // Collect from canon (tracked)
    const canonPath = join(repoRoot, CANON_PROMPTS_DIR);
    if (existsSync(canonPath)) {
      const files = readdirSync(canonPath);
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

    // Collect from env dir (if specified)
    if (envDir && existsSync(envDir)) {
      const files = readdirSync(envDir);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    }

    return Array.from(prompts).sort();
  } catch {
    return [];
  }
}
