/**
 * AXError - Structured errors with recovery actions
 *
 * Per AX-CONTRACT.md v0.1, Guarantee 2.3: Recoverable Errors
 *
 * When something fails, an AI knows what went wrong and what to try next.
 * All structured errors MUST follow this shape.
 *
 * @module shared/errors
 */

import { z } from "zod";

/**
 * AXError schema - the canonical shape for structured errors
 *
 * @example
 * ```json
 * {
 *   "code": "FRAME_NOT_FOUND",
 *   "message": "Frame with ID 'abc123' not found",
 *   "context": { "frameId": "abc123" },
 *   "nextActions": ["Run 'lex timeline' to see recent Frames"]
 * }
 * ```
 */
export const AXErrorSchema = z.object({
  /**
   * Stable error code in UPPER_SNAKE_CASE
   * Must be unique and documented in error-codes.ts
   */
  code: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/, "Error code must be UPPER_SNAKE_CASE (e.g., FRAME_NOT_FOUND)"),

  /**
   * Human-readable error message
   * Should be concise but descriptive
   */
  message: z.string().min(1, "Message is required"),

  /**
   * Optional structured context about the error
   * Include relevant IDs, paths, or values that help diagnose
   */
  context: z.record(z.string(), z.unknown()).optional(),

  /**
   * Recovery suggestions - at least one required
   * These tell the agent what to try next
   */
  nextActions: z.array(z.string().min(1)).min(1, "At least one nextAction is required"),
});

/**
 * TypeScript type for AXError
 */
export type AXError = z.infer<typeof AXErrorSchema>;

/**
 * Type guard to check if a value is an AXError
 *
 * @example
 * ```typescript
 * if (isAXError(error)) {
 *   console.log(error.nextActions[0]);
 * }
 * ```
 */
export function isAXError(value: unknown): value is AXError {
  return AXErrorSchema.safeParse(value).success;
}

/**
 * Create a validated AXError
 *
 * @throws {ZodError} if inputs don't match schema
 *
 * @example
 * ```typescript
 * const error = createAXError(
 *   'FRAME_NOT_FOUND',
 *   'Frame not found',
 *   ['Run "lex timeline" to see recent Frames'],
 *   { frameId: 'abc123' }
 * );
 * ```
 */
export function createAXError(
  code: string,
  message: string,
  nextActions: string[],
  context?: Record<string, unknown>
): AXError {
  return AXErrorSchema.parse({ code, message, nextActions, context });
}

/**
 * Wrap a standard Error as an AXError
 *
 * Useful for catching exceptions and converting them to structured form.
 *
 * @example
 * ```typescript
 * try {
 *   await riskyOperation();
 * } catch (err) {
 *   return wrapAsAXError(
 *     err as Error,
 *     'OPERATION_FAILED',
 *     ['Check logs for details', 'Retry the operation']
 *   );
 * }
 * ```
 */
export function wrapAsAXError(
  error: Error,
  code: string,
  nextActions: string[],
  additionalContext?: Record<string, unknown>
): AXError {
  return createAXError(code, error.message, nextActions, {
    originalError: error.name,
    stack: error.stack?.split("\n").slice(0, 5),
    ...additionalContext,
  });
}

/**
 * AXError class for throwing structured errors
 *
 * Extends Error so it can be thrown and caught normally,
 * but carries the structured AXError data.
 *
 * @example
 * ```typescript
 * throw new AXErrorException(
 *   'POLICY_NOT_FOUND',
 *   'No policy file found',
 *   ['Run "lex init" to create a workspace'],
 *   { searchedPaths: ['.smartergpt/', 'canon/'] }
 * );
 * ```
 */
export class AXErrorException extends Error {
  public readonly axError: AXError;

  constructor(
    code: string,
    message: string,
    nextActions: string[],
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AXErrorException";
    this.axError = createAXError(code, message, nextActions, context);
  }

  /**
   * Get the structured error for JSON output
   */
  toAXError(): AXError {
    return this.axError;
  }

  /**
   * Serialize to JSON (for CLI --json output)
   */
  toJSON(): AXError {
    return this.axError;
  }
}

/**
 * Check if an error is an AXErrorException
 */
export function isAXErrorException(error: unknown): error is AXErrorException {
  return error instanceof AXErrorException;
}
