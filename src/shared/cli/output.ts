/**
 * CLI Output Wrapper
 *
 * Centralized output functions for CLI commands. This wrapper:
 * - Provides a single place for all CLI console.* calls
 * - Makes it easy to test CLI output
 * - Keeps the no-console ESLint rule enforceable everywhere else
 *
 * CLI commands should use these functions instead of console.* directly.
 */

/**
 * Print informational message to stdout
 */
export function info(message: string): void {
  console.log(message);
}

/**
 * Print error message to stderr
 */
export function error(message: string): void {
  console.error(message);
}

/**
 * Print success message (typically green checkmark)
 */
export function success(message: string): void {
  console.log(message);
}

/**
 * Print warning message
 */
export function warn(message: string): void {
  console.warn(message);
}

/**
 * Print JSON output to stdout (for --json flags)
 */
export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print raw output (no formatting)
 */
export function raw(message: string): void {
  console.log(message);
}
