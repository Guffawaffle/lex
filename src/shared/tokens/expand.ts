/**
 * Token expansion utilities
 *
 * Provides consistent token substitution across configuration files and prompts
 */

import { findRepoRoot, getCurrentCommit } from "../git/repo.js";
import { getCurrentBranch } from "../git/branch.js";

/**
 * Format current date as YYYY-MM-DD
 *
 * @param date - Date to format (defaults to current date)
 * @returns Date string in YYYY-MM-DD format
 *
 * @example
 * ```ts
 * formatToday()
 * // Returns: "2025-11-09"
 * ```
 */
export function formatToday(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format current date-time as ISO local time without colons
 *
 * @param date - Date to format (defaults to current date-time)
 * @returns ISO local datetime string without colons (YYYYMMDDTHHMMSS)
 *
 * @example
 * ```ts
 * formatNow()
 * // Returns: "20251109T123456"
 * ```
 */
export function formatNow(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

/**
 * Token context for expansion
 */
export interface TokenContext {
  /**
   * Override for {{today}} token (defaults to current date)
   */
  today?: string;

  /**
   * Override for {{now}} token (defaults to current date-time)
   */
  now?: string;

  /**
   * Override for {{repo_root}} token (defaults to detected repo root)
   */
  repoRoot?: string;

  /**
   * Override for {{workspace_root}} token (defaults to repo root)
   */
  workspaceRoot?: string;

  /**
   * Override for {{branch}} token (defaults to current git branch)
   */
  branch?: string;

  /**
   * Override for {{commit}} token (defaults to current git commit SHA)
   */
  commit?: string;
}

/**
 * Get default token values from the environment
 *
 * @param context - Optional context overrides
 * @returns Token values resolved from context or defaults
 */
export function getTokenValues(context: TokenContext = {}): Record<string, string> {
  const today = context.today || formatToday();
  const now = context.now || formatNow();
  const repoRoot = context.repoRoot || getRepoRootSafe();
  const workspaceRoot = context.workspaceRoot || repoRoot;
  const branch = context.branch || getCurrentBranch();
  const commit = context.commit || getCurrentCommit();

  return {
    today,
    now,
    repo_root: repoRoot,
    workspace_root: workspaceRoot,
    branch,
    commit,
  };
}

/**
 * Get repo root safely (returns empty string if not in a repo)
 */
function getRepoRootSafe(): string {
  try {
    return findRepoRoot();
  } catch (error) {
    // Not in a git repository, return empty string
    return "";
  }
}

/**
 * Expand tokens in a string
 *
 * @param input - String containing tokens to expand
 * @param context - Optional context for token values
 * @returns String with all tokens expanded
 *
 * Supported tokens:
 * - `{{today}}` → YYYY-MM-DD (e.g., `2025-11-09`)
 * - `{{now}}` → ISO local time without colons (e.g., `20251109T123456`)
 * - `{{repo_root}}` → Detected repository root (first parent with `.git/`)
 * - `{{workspace_root}}` → Multi-folder workspace root (defaults to repo root)
 * - `{{branch}}` → Current git branch
 * - `{{commit}}` → Current git commit SHA (short form)
 *
 * @example
 * ```ts
 * expandTokens('deliverables-{{today}}-{{now}}')
 * // Returns: 'deliverables-2025-11-09-20251109T123456'
 *
 * expandTokens('{{repo_root}}/.smartergpt/prompts/merge.md')
 * // Returns: '/absolute/path/to/repo/.smartergpt/prompts/merge.md'
 *
 * expandTokens('branch-{{branch}}-commit-{{commit}}')
 * // Returns: 'branch-main-commit-a1b2c3d'
 * ```
 */
export function expandTokens(input: string, context: TokenContext = {}): string {
  const values = getTokenValues(context);
  let result = input;

  // Replace each token with its value
  for (const [token, value] of Object.entries(values)) {
    const pattern = new RegExp(`\\{\\{${token}\\}\\}`, "g");
    result = result.replace(pattern, value);
  }

  return result;
}

/**
 * Expand tokens in an object (recursively processes strings)
 *
 * @param obj - Object containing values that may have tokens
 * @param context - Optional context for token values
 * @returns New object with tokens expanded in all string values
 *
 * @example
 * ```ts
 * expandTokensInObject({
 *   deliverables: '{{repo_root}}/output-{{today}}',
 *   metadata: {
 *     branch: '{{branch}}',
 *     timestamp: '{{now}}'
 *   }
 * })
 * // Returns:
 * // {
 * //   deliverables: '/absolute/path/to/repo/output-2025-11-09',
 * //   metadata: {
 * //     branch: 'main',
 * //     timestamp: '20251109T123456'
 * //   }
 * // }
 * ```
 */
export function expandTokensInObject<T>(obj: T, context: TokenContext = {}): T {
  if (typeof obj === "string") {
    return expandTokens(obj, context) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => expandTokensInObject(item, context)) as T;
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandTokensInObject(value, context);
    }
    return result as T;
  }

  return obj;
}
