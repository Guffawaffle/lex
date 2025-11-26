/**
 * MCP Error Codes
 *
 * Machine-readable error codes for MCP tool responses.
 * Part of the Lex 1.0.0 contract - orchestrators can branch on these codes.
 *
 * @example
 * ```typescript
 * if (response.error?.code === MCPErrorCode.INVALID_MODULE_ID) {
 *   // Handle module ID validation failure
 * }
 * ```
 */

/**
 * Error codes for MCP tool operations
 *
 * Naming convention: CATEGORY_SPECIFIC_ERROR
 * - VALIDATION_* : Input validation errors
 * - STORAGE_* : Database/storage errors
 * - POLICY_* : Policy-related errors
 * - INTERNAL_* : Unexpected internal errors
 */
export enum MCPErrorCode {
  // =============================================================================
  // VALIDATION ERRORS (4xx-style: client/input problems)
  // =============================================================================

  /** Required field is missing */
  VALIDATION_REQUIRED_FIELD = "VALIDATION_REQUIRED_FIELD",

  /** Field has invalid format or type */
  VALIDATION_INVALID_FORMAT = "VALIDATION_INVALID_FORMAT",

  /** Module ID does not match any module in policy */
  VALIDATION_INVALID_MODULE_ID = "VALIDATION_INVALID_MODULE_ID",

  /** module_scope array is empty */
  VALIDATION_EMPTY_MODULE_SCOPE = "VALIDATION_EMPTY_MODULE_SCOPE",

  /** status_snapshot structure is invalid */
  VALIDATION_INVALID_STATUS = "VALIDATION_INVALID_STATUS",

  /** Image data is malformed or unsupported */
  VALIDATION_INVALID_IMAGE = "VALIDATION_INVALID_IMAGE",

  // =============================================================================
  // STORAGE ERRORS (5xx-style: server/storage problems)
  // =============================================================================

  /** Failed to save frame to database */
  STORAGE_WRITE_FAILED = "STORAGE_WRITE_FAILED",

  /** Failed to read from database */
  STORAGE_READ_FAILED = "STORAGE_READ_FAILED",

  /** Failed to delete from database */
  STORAGE_DELETE_FAILED = "STORAGE_DELETE_FAILED",

  /** Failed to store image attachment */
  STORAGE_IMAGE_FAILED = "STORAGE_IMAGE_FAILED",

  // =============================================================================
  // POLICY ERRORS
  // =============================================================================

  /** Policy file not found or unreadable */
  POLICY_NOT_FOUND = "POLICY_NOT_FOUND",

  /** Policy file has invalid structure */
  POLICY_INVALID = "POLICY_INVALID",

  // =============================================================================
  // INTERNAL ERRORS
  // =============================================================================

  /** Unknown tool name requested */
  INTERNAL_UNKNOWN_TOOL = "INTERNAL_UNKNOWN_TOOL",

  /** Unknown MCP method requested */
  INTERNAL_UNKNOWN_METHOD = "INTERNAL_UNKNOWN_METHOD",

  /** Unexpected internal error */
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * MCP Error with structured code and metadata
 */
export class MCPError extends Error {
  public readonly code: MCPErrorCode;
  public readonly metadata?: Record<string, unknown>;

  constructor(code: MCPErrorCode, message: string, metadata?: Record<string, unknown>) {
    super(message);
    this.name = "MCPError";
    this.code = code;
    this.metadata = metadata;
  }

  /**
   * Convert to MCP response error format
   */
  toResponse(): { error: { code: string; message: string; metadata?: Record<string, unknown> } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.metadata && { metadata: this.metadata }),
      },
    };
  }
}

/**
 * Helper to create validation errors with suggestions
 */
export function createValidationError(
  code: MCPErrorCode,
  message: string,
  suggestions?: string[]
): MCPError {
  return new MCPError(code, message, suggestions ? { suggestions } : undefined);
}

/**
 * Helper to create module ID validation error with available modules
 */
export function createModuleIdError(
  invalidIds: string[],
  suggestions: string[],
  availableModules: string[]
): MCPError {
  const message =
    `Invalid module IDs: ${invalidIds.join(", ")}. ` +
    (suggestions.length > 0 ? `Did you mean: ${suggestions.join(", ")}? ` : "") +
    `Available modules: ${availableModules.slice(0, 5).join(", ")}${availableModules.length > 5 ? "..." : ""}`;

  return new MCPError(MCPErrorCode.VALIDATION_INVALID_MODULE_ID, message, {
    invalidIds,
    suggestions,
    availableModules,
  });
}
