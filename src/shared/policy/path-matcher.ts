/**
 * Path Glob Matcher
 *
 * Provides glob pattern matching for policy.allowed_paths and policy.denied_paths.
 * Used by executors to enforce policy at tool invocation time.
 *
 * @module policy/path-matcher
 */

/**
 * Match a file path against a glob pattern.
 *
 * Supports:
 * - `*` matches any characters except `/`
 * - `**` matches any characters including `/` (recursive)
 * - `?` matches exactly one character except `/`
 * - Literal strings match exactly
 *
 * @param filePath - File path to check (use forward slashes)
 * @param pattern - Glob pattern to match against
 * @returns true if the path matches the pattern
 *
 * @example
 * ```ts
 * matchesPattern("src/foo/bar.ts", "src/**") // true
 * matchesPattern("src/foo.ts", "*.ts") // false (no directory match)
 * matchesPattern("foo.ts", "*.ts") // true
 * matchesPattern("src/test/foo.spec.ts", "**\/*.spec.ts") // true
 * ```
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  // Normalize paths: use forward slashes, remove leading ./
  const normalizedPath = normalizePath(filePath);
  const normalizedPattern = normalizePath(pattern);

  // Convert glob pattern to regex
  const regex = globToRegex(normalizedPattern);
  return regex.test(normalizedPath);
}

/**
 * Normalize a file path for matching.
 * - Convert backslashes to forward slashes
 * - Remove leading ./
 * - Remove trailing slashes
 */
function normalizePath(p: string): string {
  return p
    .replace(/\\/g, "/") // backslash to forward slash
    .replace(/^\.\//, "") // remove leading ./
    .replace(/\/$/, ""); // remove trailing slash
}

/**
 * Convert a glob pattern to a RegExp.
 *
 * Handles:
 * - `**` → matches any path segments (including none)
 * - `*` → matches any characters except /
 * - `?` → matches exactly one character except /
 * - Escapes regex special characters
 */
function globToRegex(pattern: string): RegExp {
  let regex = "";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];
    const nextChar = pattern[i + 1];

    if (char === "*" && nextChar === "*") {
      // Handle **
      const afterStars = pattern[i + 2];
      if (afterStars === "/") {
        // **/ matches zero or more directories
        regex += "(?:.*\\/)?";
        i += 3;
      } else if (afterStars === undefined) {
        // ** at end matches everything
        regex += ".*";
        i += 2;
      } else {
        // ** followed by something else
        regex += ".*";
        i += 2;
      }
    } else if (char === "*") {
      // Single * matches any non-slash characters
      regex += "[^/]*";
      i++;
    } else if (char === "?") {
      // ? matches exactly one non-slash character
      regex += "[^/]";
      i++;
    } else if (char === ".") {
      // Escape dot
      regex += "\\.";
      i++;
    } else if (char === "/" || char === "\\") {
      // Path separator
      regex += "\\/";
      i++;
    } else if ("[]{}()+^$|".includes(char)) {
      // Escape other regex special characters
      regex += "\\" + char;
      i++;
    } else {
      // Literal character
      regex += char;
      i++;
    }
  }

  return new RegExp(`^${regex}$`);
}

/**
 * Check if a file path is allowed by policy.
 *
 * Rules:
 * 1. If denied_paths contains a matching pattern, DENY (denied takes precedence)
 * 2. If allowed_paths is empty, ALLOW (empty = allow all)
 * 3. If allowed_paths contains a matching pattern, ALLOW
 * 4. Otherwise, DENY
 *
 * @param filePath - File path to check
 * @param allowedPaths - Patterns where edits are allowed
 * @param deniedPaths - Patterns where edits are forbidden
 * @returns true if the path is allowed
 *
 * @example
 * ```ts
 * // Allow src/**, deny secrets/**
 * isPathAllowed("src/foo.ts", ["src/**"], ["secrets/**"]) // true
 * isPathAllowed("secrets/key.txt", ["src/**"], ["secrets/**"]) // false
 * isPathAllowed("docs/readme.md", ["src/**"], []) // false
 *
 * // Empty allowed = allow all (minus denied)
 * isPathAllowed("anywhere.txt", [], []) // true
 * isPathAllowed("secrets/key.txt", [], ["secrets/**"]) // false
 * ```
 */
export function isPathAllowed(
  filePath: string,
  allowedPaths: string[],
  deniedPaths: string[]
): boolean {
  const normalizedPath = normalizePath(filePath);

  // Rule 1: Check denied paths first (takes precedence)
  for (const pattern of deniedPaths) {
    if (matchesPattern(normalizedPath, pattern)) {
      return false;
    }
  }

  // Rule 2: Empty allowed list means allow all
  if (allowedPaths.length === 0) {
    return true;
  }

  // Rule 3: Check if any allowed pattern matches
  for (const pattern of allowedPaths) {
    if (matchesPattern(normalizedPath, pattern)) {
      return true;
    }
  }

  // Rule 4: Not in allowed list
  return false;
}

/**
 * Filter a list of file paths by policy.
 *
 * @param filePaths - List of file paths to filter
 * @param allowedPaths - Patterns where edits are allowed
 * @param deniedPaths - Patterns where edits are forbidden
 * @returns Object with allowed and denied paths
 */
export function filterPathsByPolicy(
  filePaths: string[],
  allowedPaths: string[],
  deniedPaths: string[]
): { allowed: string[]; denied: string[] } {
  const allowed: string[] = [];
  const denied: string[] = [];

  for (const filePath of filePaths) {
    if (isPathAllowed(filePath, allowedPaths, deniedPaths)) {
      allowed.push(filePath);
    } else {
      denied.push(filePath);
    }
  }

  return { allowed, denied };
}

/**
 * Get the reason why a path was denied.
 *
 * @param filePath - File path that was denied
 * @param allowedPaths - Patterns where edits are allowed
 * @param deniedPaths - Patterns where edits are forbidden
 * @returns Explanation of why the path was denied, or null if allowed
 */
export function getDenialReason(
  filePath: string,
  allowedPaths: string[],
  deniedPaths: string[]
): string | null {
  const normalizedPath = normalizePath(filePath);

  // Check denied paths
  for (const pattern of deniedPaths) {
    if (matchesPattern(normalizedPath, pattern)) {
      return `Path "${filePath}" matches denied pattern "${pattern}"`;
    }
  }

  // Check if not in allowed paths
  if (allowedPaths.length > 0) {
    const matchesAny = allowedPaths.some((pattern) => matchesPattern(normalizedPath, pattern));
    if (!matchesAny) {
      return `Path "${filePath}" does not match any allowed pattern: ${allowedPaths.join(", ")}`;
    }
  }

  return null;
}
