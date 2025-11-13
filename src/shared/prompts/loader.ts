/**
 * Prompt Loading Utility
 *
 * Loads prompt templates with precedence chain support:
 * 1. LEX_PROMPTS_DIR (explicit environment override)
 * 2. .smartergpt.local/prompts/ (local overlay)
 * 3. Package canon (resolved from package installation)
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { expandTokens } from "../tokens/expand.js";
import type { TokenContext } from "../tokens/expand.js";

/**
 * Resolve package asset path for both dev and installed contexts
 *
 * @param type - Asset type ('prompts' or 'schemas')
 * @param name - Asset name/filename
 * @returns Resolved absolute path to the asset
 */
function resolvePackageAsset(type: "prompts" | "schemas", name: string): string {
  // When installed: node_modules/lex/prompts/ or node_modules/lex/schemas/
  // When local dev: <repo>/prompts/ or <repo>/schemas/
  const currentFile = fileURLToPath(import.meta.url);
  let pkgRoot = dirname(currentFile);
  
  // Walk up until we find package.json or reach a dist/ or src/ boundary
  // In dist: /home/runner/work/lex/lex/dist/shared/prompts/loader.js -> /home/runner/work/lex/lex
  // In src:  /home/runner/work/lex/lex/src/shared/prompts/loader.ts -> /home/runner/work/lex/lex
  while (pkgRoot !== dirname(pkgRoot)) {
    const pkgJsonPath = join(pkgRoot, "package.json");
    if (existsSync(pkgJsonPath)) {
      // Found package.json - this is the package root
      return join(pkgRoot, type, name);
    }
    pkgRoot = dirname(pkgRoot);
  }
  
  // Fallback: shouldn't reach here in normal use
  throw new Error(`Could not resolve package root from ${currentFile}`);
}

/**
 * Load prompt template with precedence chain
 *
 * @param promptName - Name of the prompt file (e.g., "idea.md", "create-project.md")
 * @param context - Optional token context for expansion (defaults to current environment)
 * @returns Prompt content as string with tokens expanded
 * @throws Error if prompt file cannot be found in any location
 *
 * Precedence chain:
 * 1. LEX_PROMPTS_DIR (explicit environment override)
 * 2. .smartergpt.local/prompts/ (local overlay - untracked)
 * 3. Package canon (resolve from package installation)
 *
 * Token expansion:
 * All loaded prompts have tokens expanded automatically:
 * - `{{today}}` → YYYY-MM-DD (e.g., `2025-11-09`)
 * - `{{now}}` → ISO local time without colons (e.g., `20251109T123456`)
 * - `{{repo_root}}` → Detected repository root
 * - `{{workspace_root}}` → Workspace root (defaults to repo root)
 * - `{{branch}}` → Current git branch
 * - `{{commit}}` → Current git commit SHA (short form)
 *
 * @example
 * ```typescript
 * const ideaPrompt = loadPrompt('idea.md');
 * console.log(ideaPrompt); // Prompt template with tokens expanded
 * ```
 *
 * @example With environment variable override
 * ```typescript
 * process.env.LEX_PROMPTS_DIR = '/custom/prompts';
 * const prompt = loadPrompt('idea.md'); // Loads from /custom/prompts/idea.md
 * ```
 *
 * @example Local overlay (create .smartergpt.local/prompts/idea.md to override)
 * ```typescript
 * // If .smartergpt.local/prompts/idea.md exists, it takes precedence
 * const prompt = loadPrompt('idea.md');
 * ```
 *
 * @example With custom token context
 * ```typescript
 * const prompt = loadPrompt('template.md', {
 *   today: '2025-01-01',
 *   branch: 'feature-branch'
 * });
 * ```
 */
export function loadPrompt(promptName: string, context?: TokenContext): string {
  const attemptedPaths: string[] = [];

  // Priority 1: LEX_PROMPTS_DIR (explicit env override)
  const envDir = process.env.LEX_PROMPTS_DIR;
  if (envDir) {
    const envPath = resolve(envDir, promptName);
    attemptedPaths.push(envPath);
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      return expandTokens(content, context);
    }
  }

  // Priority 2: .smartergpt.local/prompts/ (local overlay)
  const localPath = join(process.cwd(), ".smartergpt.local", "prompts", promptName);
  attemptedPaths.push(localPath);
  if (existsSync(localPath)) {
    const content = readFileSync(localPath, "utf-8");
    return expandTokens(content, context);
  }

  // Priority 3: Package canon (resolve from package installation)
  const canonPath = resolvePackageAsset("prompts", promptName);
  attemptedPaths.push(canonPath);
  if (existsSync(canonPath)) {
    const content = readFileSync(canonPath, "utf-8");
    return expandTokens(content, context);
  }

  throw new Error(
    `Prompt file '${promptName}' not found. Tried:\n` +
      attemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
  );
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
  // Priority 1: LEX_PROMPTS_DIR
  const envDir = process.env.LEX_PROMPTS_DIR;
  if (envDir) {
    const envPath = resolve(envDir, promptName);
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  // Priority 2: Local overlay
  const localPath = join(process.cwd(), ".smartergpt.local", "prompts", promptName);
  if (existsSync(localPath)) {
    return localPath;
  }

  // Priority 3: Package canon
  const canonPath = resolvePackageAsset("prompts", promptName);
  if (existsSync(canonPath)) {
    return canonPath;
  }

  return null;
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

  // Collect from package canon
  try {
    const canonPath = resolvePackageAsset("prompts", "");
    if (existsSync(canonPath)) {
      const files = readdirSync(canonPath);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    }
  } catch {
    // Ignore errors when reading package canon
  }

  // Collect from local (overlay)
  const localPath = join(process.cwd(), ".smartergpt.local", "prompts");
  if (existsSync(localPath)) {
    try {
      const files = readdirSync(localPath);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    } catch {
      // Ignore errors when reading local overlay
    }
  }

  // Collect from LEX_PROMPTS_DIR (if specified)
  const envDir = process.env.LEX_PROMPTS_DIR;
  if (envDir && existsSync(envDir)) {
    try {
      const files = readdirSync(envDir);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    } catch {
      // Ignore errors when reading env dir
    }
  }

  return Array.from(prompts).sort();
}
