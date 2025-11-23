/**
 * Token Expansion Utility
 *
 * Provides consistent token substitution for configuration files and prompts.
 * Supports date/time tokens, git repository tokens, and path tokens.
 */

import { getCurrentBranch } from "../git/branch.js";
import { getCurrentCommit } from "../git/commit.js";
import { findRepoRoot, getWorkspaceRoot } from "../paths/normalizer.js";

/**
 * Token definitions
 */
export interface TokenContext {
  /** Override for today's date (for testing) */
  today?: Date;
  /** Override for current time (for testing) */
  now?: Date;
  /** Override for repo root path (for testing) */
  repoRoot?: string;
  /** Override for workspace root path (for testing) */
  workspaceRoot?: string;
  /** Override for git branch (for testing) */
  branch?: string;
  /** Override for git commit (for testing) */
  commit?: string;
}

/**
 * Get current date in YYYY-MM-DD format
 */
function formatToday(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get current datetime in ISO format without colons
 * Format: YYYYMMDDTHHMMSS
 */
function formatNow(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

/**
 * Expand tokens in a string
 *
 * @param input - String that may contain tokens like {{today}}, {{now}}, etc.
 * @param context - Optional context for overriding token values (useful for testing)
 * @returns String with tokens replaced by their values
 *
 * Supported tokens:
 * - `{{today}}` → YYYY-MM-DD (e.g., 2025-11-09)
 * - `{{now}}` → YYYYMMDDTHHMMSS (e.g., 20251109T123456)
 * - `{{repo_root}}` → Detected repository root (first parent with .git/)
 * - `{{workspace_root}}` → Multi-folder workspace root (when available)
 * - `{{branch}}` → Current git branch
 * - `{{commit}}` → Current git commit SHA (short form)
 *
 * @example
 * ```ts
 * const path = expandTokens("{{repo_root}}/.smartergpt.local/deliverables/weave-{{today}}-{{now}}");
 * // => "/path/to/repo/.smartergpt.local/deliverables/weave-2025-11-09-20251109T123456"
 *
 * const filename = expandTokens("umbrella-{{today}}-{{now}}.md");
 * // => "umbrella-2025-11-09-20251109T123456.md"
 * ```
 */
export function expandTokens(input: string, context: TokenContext = {}): string {
  let result = input;

  // Resolve token values
  const today = context.today ? formatToday(context.today) : formatToday();
  const now = context.now ? formatNow(context.now) : formatNow();
  
  // Repository root - use override or detect
  let repoRoot: string;
  if (context.repoRoot !== undefined) {
    repoRoot = context.repoRoot;
  } else {
    const detected = findRepoRoot();
    repoRoot = detected || "";
  }

  // Workspace root - use override or detect
  const workspaceRoot = context.workspaceRoot !== undefined 
    ? context.workspaceRoot 
    : getWorkspaceRoot();

  // Git branch - use override or detect
  const branch = context.branch !== undefined 
    ? context.branch 
    : getCurrentBranch();

  // Git commit - use override or detect
  const commit = context.commit !== undefined 
    ? context.commit 
    : getCurrentCommit();

  // Replace tokens (process in order to avoid replacement conflicts)
  const replacements: Array<[RegExp, string]> = [
    [/\{\{today\}\}/g, today],
    [/\{\{now\}\}/g, now],
    [/\{\{repo_root\}\}/g, repoRoot],
    [/\{\{workspace_root\}\}/g, workspaceRoot],
    [/\{\{branch\}\}/g, branch],
    [/\{\{commit\}\}/g, commit],
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * Check if a string contains any tokens
 *
 * @param input - String to check
 * @returns true if the string contains any expandable tokens
 */
export function hasTokens(input: string): boolean {
  const tokenPattern = /\{\{(today|now|repo_root|workspace_root|branch|commit)\}\}/;
  return tokenPattern.test(input);
}

/**
 * Extract all tokens found in a string
 *
 * @param input - String to analyze
 * @returns Array of token names found (without delimiters)
 */
export function extractTokens(input: string): string[] {
  const tokenPattern = /\{\{(today|now|repo_root|workspace_root|branch|commit)\}\}/g;
  const tokens: string[] = [];
  let match;

  while ((match = tokenPattern.exec(input)) !== null) {
    if (!tokens.includes(match[1])) {
      tokens.push(match[1]);
    }
  }

  return tokens;
}

/**
 * Expand tokens in all string values of an object (recursively)
 *
 * @param obj - Object that may contain tokens in string values
 * @param context - Optional context for overriding token values
 * @returns New object with tokens expanded in all string values
 *
 * @example
 * ```ts
 * const config = {
 *   deliverables: "{{repo_root}}/.smartergpt.local/deliverables/{{today}}",
 *   created: "{{today}}T12:00:00Z",
 *   metadata: {
 *     branch: "{{branch}}",
 *     commit: "{{commit}}"
 *   }
 * };
 *
 * const expanded = expandTokensInObject(config);
 * // All string values will have tokens expanded
 * ```
 */
export function expandTokensInObject<T>(obj: T, context: TokenContext = {}): T {
  if (typeof obj === "string") {
    return expandTokens(obj, context) as T;
  }

  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj.map((item) => expandTokensInObject(item, context)) as T;
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandTokensInObject(value as unknown, context);
    }
    return result as T;
  }

  return obj;
}
