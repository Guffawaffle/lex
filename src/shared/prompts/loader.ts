/**
 * Prompt Loading Utility
 *
 * Loads prompt templates with precedence chain support:
 * 1. LEX_PROMPTS_DIR (explicit environment override)
 * 2. ./.smartergpt/prompts/ (organization workspace, preferred)
 * 3. ./prompts/ (legacy location)
 * 4. Package canon/prompts/ (built-in fallback, read-only)
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join, normalize, relative } from "path";
import { fileURLToPath } from "url";
import { PromptTemplate, PromptMetadata, RenderError } from "./types.js";
import { computeContentHash } from "./renderer.js";

/**
 * Resolve package asset path for both dev and installed contexts
 *
 * @param type - Asset type ('prompts', 'schemas', or 'rules')
 * @param name - Asset name/filename
 * @returns Resolved absolute path to the asset in canon/
 */
function resolvePackageAsset(type: "prompts" | "schemas" | "rules", name: string): string {
  // When installed: node_modules/@smartergpt/lex/canon/prompts/
  // When local dev: <repo>/canon/prompts/
  const currentFile = fileURLToPath(import.meta.url);
  let pkgRoot = dirname(currentFile);

  // Walk up until we find package.json
  while (pkgRoot !== dirname(pkgRoot)) {
    const pkgJsonPath = join(pkgRoot, "package.json");
    if (existsSync(pkgJsonPath)) {
      // Found package root - return canon path
      return join(pkgRoot, "canon", type, name);
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
 * @returns Prompt content as string
 * @throws Error if prompt file cannot be found in any location
 *
 * Precedence chain:
 * 1. LEX_PROMPTS_DIR (explicit environment override)
 * 2. ./.smartergpt/prompts/ (organization workspace, preferred)
 * 3. ./prompts/ (legacy location)
 * 4. canon/prompts/ (package built-in, read-only fallback)
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
 * const prompt = loadPrompt('idea.md'); // Loads from /custom/prompts/idea.md
 * ```
 *
 * @example Workspace override (create .smartergpt/prompts/idea.md to override canon)
 * ```typescript
 * // If .smartergpt/prompts/idea.md exists, it takes precedence over canon
 * const prompt = loadPrompt('idea.md');
 * ```
 */
export function loadPrompt(promptName: string): string {
  const attemptedPaths: string[] = [];

  // Priority 1: LEX_PROMPTS_DIR (explicit env override)
  const envDir = process.env.LEX_PROMPTS_DIR;
  if (envDir) {
    const envPath = resolve(envDir, promptName);
    attemptedPaths.push(envPath);
    if (existsSync(envPath)) {
      return readFileSync(envPath, "utf-8");
    }
  }

  // Priority 2: ./.smartergpt/prompts/ (organization workspace, preferred)
  const smartergptPath = join(process.cwd(), ".smartergpt", "prompts", promptName);
  attemptedPaths.push(smartergptPath);
  if (existsSync(smartergptPath)) {
    return readFileSync(smartergptPath, "utf-8");
  }

  // Priority 3: ./prompts/ (legacy location)
  const legacyPath = join(process.cwd(), "prompts", promptName);
  attemptedPaths.push(legacyPath);
  if (existsSync(legacyPath)) {
    return readFileSync(legacyPath, "utf-8");
  }

  // Priority 4: canon/prompts/ (package built-in, read-only)
  const canonPath = resolvePackageAsset("prompts", promptName);
  attemptedPaths.push(canonPath);
  if (existsSync(canonPath)) {
    return readFileSync(canonPath, "utf-8");
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
 * console.log(path); // '/workspace/.smartergpt/prompts/idea.md'
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

  // Priority 2: ./.smartergpt/prompts/
  const smartergptPath = join(process.cwd(), ".smartergpt", "prompts", promptName);
  if (existsSync(smartergptPath)) {
    return smartergptPath;
  }

  // Priority 3: ./prompts/ (legacy)
  const legacyPath = join(process.cwd(), "prompts", promptName);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  // Priority 4: canon/prompts/
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

  // Collect from .smartergpt/prompts/ (organization workspace prompts)
  const smartergptPath = join(process.cwd(), ".smartergpt", "prompts");
  if (existsSync(smartergptPath)) {
    try {
      const files = readdirSync(smartergptPath);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    } catch {
      // Ignore errors when reading workspace prompts
    }
  }

  // Collect from prompts/ (legacy location)
  const legacyPath = join(process.cwd(), "prompts");
  if (existsSync(legacyPath)) {
    try {
      const files = readdirSync(legacyPath);
      files.forEach((file: string) => {
        if (file.endsWith(".md")) {
          prompts.add(file);
        }
      });
    } catch {
      // Ignore errors when reading legacy prompts
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

/**
 * Maximum allowed prompt file size (100KB)
 */
const MAX_PROMPT_SIZE = 100 * 1024;

/**
 * Validate prompt file path to prevent directory traversal attacks
 */
function validatePromptPath(promptName: string, resolvedPath: string): void {
  // Reject absolute paths
  if (promptName.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(promptName)) {
    throw new RenderError(`Absolute paths not allowed: ${promptName}`, "INVALID_PATH", {
      path: promptName,
    });
  }

  // Reject parent directory references
  if (promptName.includes("..")) {
    throw new RenderError(`Path traversal not allowed: ${promptName}`, "INVALID_PATH", {
      path: promptName,
    });
  }

  // Validate that resolved path is within allowed directories
  const normalizedPath = normalize(resolvedPath);
  const allowedDirs = [
    normalize(resolvePackageAsset("prompts", "")),
    normalize(join(process.cwd(), ".smartergpt.local", "prompts")),
  ];

  const envDir = process.env.LEX_PROMPTS_DIR;
  if (envDir) {
    allowedDirs.push(normalize(resolve(envDir)));
  }

  const isAllowed = allowedDirs.some((allowedDir) => {
    const rel = relative(allowedDir, normalizedPath);
    return !rel.startsWith("..") && !join(allowedDir, rel).includes("..");
  });

  if (!isAllowed) {
    throw new RenderError(`Path outside allowed directories: ${promptName}`, "INVALID_PATH", {
      path: promptName,
      resolved: normalizedPath,
    });
  }
}

/**
 * Validate prompt file size
 */
function validatePromptSize(filePath: string): void {
  const stats = statSync(filePath);
  if (stats.size > MAX_PROMPT_SIZE) {
    throw new RenderError(
      `Prompt file too large: ${stats.size} bytes (max: ${MAX_PROMPT_SIZE})`,
      "FILE_TOO_LARGE",
      { path: filePath, size: stats.size, maxSize: MAX_PROMPT_SIZE }
    );
  }
}

/**
 * Check if file is binary (heuristic: contains null bytes in first 8KB)
 */
function isBinaryFile(filePath: string): boolean {
  const buffer = readFileSync(filePath);
  const checkLength = Math.min(8192, buffer.length);

  for (let i = 0; i < checkLength; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Parse YAML frontmatter from prompt content
 *
 * @param content - Full prompt content with optional frontmatter
 * @returns Tuple of [metadata, contentWithoutFrontmatter]
 */
function parseFrontmatter(content: string): [PromptMetadata | null, string] {
  // Check for frontmatter delimiters
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return [null, content];
  }

  // Find closing delimiter
  const lines = content.split("\n");
  let endIndex = -1;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    return [null, content];
  }

  // Extract frontmatter
  const frontmatterLines = lines.slice(1, endIndex);
  const contentLines = lines.slice(endIndex + 1);

  // Parse YAML (simple key-value parser)
  const metadata: Partial<PromptMetadata> = {};

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmed.substring(0, colonIndex).trim();
    let value = trimmed.substring(colonIndex + 1).trim();

    // Remove quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }

    // Parse arrays [item1, item2]
    if (value.startsWith("[") && value.endsWith("]")) {
      const arrayContent = value.substring(1, value.length - 1);
      const items = arrayContent.split(",").map((item) => item.trim().replace(/^["']|["']$/g, ""));
      (metadata as Record<string, unknown>)[key] = items.filter((item) => item.length > 0);
    } else if (key === "schemaVersion") {
      (metadata as Record<string, unknown>)[key] = parseInt(value, 10);
    } else {
      (metadata as Record<string, unknown>)[key] = value;
    }
  }

  // Validate required fields
  if (!metadata.id || !metadata.title) {
    throw new RenderError(
      "Frontmatter must include 'id' and 'title' fields",
      "INVALID_FRONTMATTER",
      { metadata }
    );
  }

  return [metadata as PromptMetadata, contentLines.join("\n")];
}

/**
 * Load a prompt template with metadata
 *
 * @param promptName - Name of the prompt file (e.g., "conflict-resolution.md")
 * @returns PromptTemplate with content, metadata, and content hash
 * @throws RenderError if prompt file is invalid or not found
 *
 * @example
 * ```typescript
 * const template = await loadPromptTemplate('conflict-resolution.md');
 * console.log(template.id, template.metadata.title);
 * ```
 */
export function loadPromptTemplate(promptName: string): PromptTemplate {
  const attemptedPaths: string[] = [];

  // Priority 1: LEX_PROMPTS_DIR (explicit env override)
  const envDir = process.env.LEX_PROMPTS_DIR;
  if (envDir) {
    const envPath = resolve(envDir, promptName);
    attemptedPaths.push(envPath);
    if (existsSync(envPath)) {
      validatePromptPath(promptName, envPath);
      validatePromptSize(envPath);

      if (isBinaryFile(envPath)) {
        throw new RenderError(`Binary files not allowed: ${promptName}`, "BINARY_FILE", {
          path: envPath,
        });
      }

      const content = readFileSync(envPath, "utf-8");
      const [metadata, templateContent] = parseFrontmatter(content);

      if (!metadata) {
        throw new RenderError(
          `Prompt template must include frontmatter with id and title: ${promptName}`,
          "MISSING_FRONTMATTER",
          { path: envPath }
        );
      }

      return {
        id: metadata.id,
        content: templateContent,
        metadata,
        contentHash: computeContentHash(templateContent),
      };
    }
  }

  // Priority 2: .smartergpt.local/prompts/ (local overlay)
  const localPath = join(process.cwd(), ".smartergpt.local", "prompts", promptName);
  attemptedPaths.push(localPath);
  if (existsSync(localPath)) {
    validatePromptPath(promptName, localPath);
    validatePromptSize(localPath);

    if (isBinaryFile(localPath)) {
      throw new RenderError(`Binary files not allowed: ${promptName}`, "BINARY_FILE", {
        path: localPath,
      });
    }

    const content = readFileSync(localPath, "utf-8");
    const [metadata, templateContent] = parseFrontmatter(content);

    if (!metadata) {
      throw new RenderError(
        `Prompt template must include frontmatter with id and title: ${promptName}`,
        "MISSING_FRONTMATTER",
        { path: localPath }
      );
    }

    return {
      id: metadata.id,
      content: templateContent,
      metadata,
      contentHash: computeContentHash(templateContent),
    };
  }

  // Priority 3: Package canon (resolve from package installation)
  const canonPath = resolvePackageAsset("prompts", promptName);
  attemptedPaths.push(canonPath);
  if (existsSync(canonPath)) {
    validatePromptPath(promptName, canonPath);
    validatePromptSize(canonPath);

    if (isBinaryFile(canonPath)) {
      throw new RenderError(`Binary files not allowed: ${promptName}`, "BINARY_FILE", {
        path: canonPath,
      });
    }

    const content = readFileSync(canonPath, "utf-8");
    const [metadata, templateContent] = parseFrontmatter(content);

    if (!metadata) {
      throw new RenderError(
        `Prompt template must include frontmatter with id and title: ${promptName}`,
        "MISSING_FRONTMATTER",
        { path: canonPath }
      );
    }

    return {
      id: metadata.id,
      content: templateContent,
      metadata,
      contentHash: computeContentHash(templateContent),
    };
  }

  throw new Error(
    `Prompt file '${promptName}' not found. Tried:\n` +
      attemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
  );
}

/**
 * List all available prompt templates with metadata
 *
 * @returns Array of prompt metadata (deduplicated by id)
 *
 * @example
 * ```typescript
 * const templates = listPromptTemplates();
 * templates.forEach(meta => console.log(meta.id, meta.title));
 * ```
 */
export function listPromptTemplates(): PromptMetadata[] {
  const prompts = listPrompts();
  const metadataMap = new Map<string, PromptMetadata>();

  for (const promptName of prompts) {
    try {
      const template = loadPromptTemplate(promptName);
      // Deduplicate by id (first one wins in precedence order)
      if (!metadataMap.has(template.id)) {
        metadataMap.set(template.id, template.metadata);
      }
    } catch {
      // Skip prompts that fail to load (e.g., no frontmatter)
      // This allows backward compatibility with simple prompts
    }
  }

  return Array.from(metadataMap.values());
}
