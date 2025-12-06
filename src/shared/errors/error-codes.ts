/**
 * Lex Error Codes Catalog
 *
 * Stable error codes for AXError responses.
 * Per AX Contract v0.1 §2.3, all AI-facing errors should use these codes.
 *
 * Error codes follow UPPER_SNAKE_CASE format and are organized by category.
 *
 * @module shared/errors/error-codes
 */

/**
 * Configuration Errors (CONFIG_*)
 *
 * Errors related to loading and parsing configuration files.
 */
export const CONFIG_ERROR_CODES = {
  /** lex.yaml not found after workspace is initialized */
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  /** lex.yaml exists but has invalid YAML syntax */
  CONFIG_PARSE_ERROR: "CONFIG_PARSE_ERROR",
  /** lex.yaml exists but fails schema validation */
  CONFIG_INVALID: "CONFIG_INVALID",
} as const;

/**
 * Policy Errors (POLICY_*)
 *
 * Errors related to policy files and validation.
 */
export const POLICY_ERROR_CODES = {
  /** No policy file found in any search path */
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
  /** Policy file exists but has invalid JSON */
  POLICY_PARSE_ERROR: "POLICY_PARSE_ERROR",
  /** Policy file fails schema validation */
  POLICY_INVALID: "POLICY_INVALID",
  /** Policy module ID not found */
  POLICY_MODULE_NOT_FOUND: "POLICY_MODULE_NOT_FOUND",
} as const;

/**
 * Database/Store Errors (DB_*, FRAME_*, STORE_*)
 *
 * Errors related to database operations and frame storage.
 */
export const STORE_ERROR_CODES = {
  /** Database connection failed */
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",
  /** Database query failed */
  DB_QUERY_FAILED: "DB_QUERY_FAILED",
  /** Database migration failed */
  DB_MIGRATION_FAILED: "DB_MIGRATION_FAILED",
  /** Frame not found by ID */
  FRAME_NOT_FOUND: "FRAME_NOT_FOUND",
  /** Frame validation failed */
  FRAME_INVALID: "FRAME_INVALID",
  /** Frame save operation failed */
  FRAME_SAVE_FAILED: "FRAME_SAVE_FAILED",
  /** Store initialization failed */
  STORE_INIT_FAILED: "STORE_INIT_FAILED",
} as const;

/**
 * Prompt Errors (PROMPT_*)
 *
 * Errors related to prompt loading and rendering.
 */
export const PROMPT_ERROR_CODES = {
  /** Prompt file not found in any search path */
  PROMPT_NOT_FOUND: "PROMPT_NOT_FOUND",
  /** Prompt template has invalid syntax */
  PROMPT_INVALID: "PROMPT_INVALID",
  /** Prompt rendering failed (missing variables, etc.) */
  PROMPT_RENDER_FAILED: "PROMPT_RENDER_FAILED",
} as const;

/**
 * Schema Errors (SCHEMA_*)
 *
 * Errors related to schema loading and validation.
 */
export const SCHEMA_ERROR_CODES = {
  /** Schema file not found */
  SCHEMA_NOT_FOUND: "SCHEMA_NOT_FOUND",
  /** Schema file has invalid JSON */
  SCHEMA_PARSE_ERROR: "SCHEMA_PARSE_ERROR",
  /** Data failed schema validation */
  SCHEMA_VALIDATION_FAILED: "SCHEMA_VALIDATION_FAILED",
} as const;

/**
 * Instructions Errors (INSTRUCTIONS_*)
 *
 * Errors related to instruction generation and management.
 */
export const INSTRUCTIONS_ERROR_CODES = {
  /** Canonical instruction file not found */
  INSTRUCTIONS_CANONICAL_NOT_FOUND: "INSTRUCTIONS_CANONICAL_NOT_FOUND",
  /** Target file already exists (without --force) */
  INSTRUCTIONS_TARGET_EXISTS: "INSTRUCTIONS_TARGET_EXISTS",
  /** Invalid projection target specified */
  INSTRUCTIONS_INVALID_TARGET: "INSTRUCTIONS_INVALID_TARGET",
  /** Instruction projections out of sync */
  INSTRUCTIONS_OUT_OF_SYNC: "INSTRUCTIONS_OUT_OF_SYNC",
} as const;

/**
 * Git Errors (GIT_*)
 *
 * Errors related to git operations.
 */
export const GIT_ERROR_CODES = {
  /** Not in a git repository */
  GIT_NOT_REPO: "GIT_NOT_REPO",
  /** Git command failed */
  GIT_COMMAND_FAILED: "GIT_COMMAND_FAILED",
  /** Git branch not found */
  GIT_BRANCH_NOT_FOUND: "GIT_BRANCH_NOT_FOUND",
} as const;

/**
 * LexSona Errors (LEXSONA_*)
 *
 * Errors related to behavioral rules and persona management.
 */
export const LEXSONA_ERROR_CODES = {
  /** Rule not found by ID */
  LEXSONA_RULE_NOT_FOUND: "LEXSONA_RULE_NOT_FOUND",
  /** Correction could not be recorded */
  LEXSONA_CORRECTION_FAILED: "LEXSONA_CORRECTION_FAILED",
  /** Persona not found */
  LEXSONA_PERSONA_NOT_FOUND: "LEXSONA_PERSONA_NOT_FOUND",
} as const;

/**
 * Validation Errors (VALIDATION_*)
 *
 * Generic validation errors.
 */
export const VALIDATION_ERROR_CODES = {
  /** Required field is missing */
  VALIDATION_REQUIRED_FIELD: "VALIDATION_REQUIRED_FIELD",
  /** Field has invalid type */
  VALIDATION_INVALID_TYPE: "VALIDATION_INVALID_TYPE",
  /** Field value is out of range */
  VALIDATION_OUT_OF_RANGE: "VALIDATION_OUT_OF_RANGE",
  /** Module ID format is invalid */
  VALIDATION_INVALID_MODULE_ID: "VALIDATION_INVALID_MODULE_ID",
} as const;

/**
 * All Lex error codes combined
 */
export const LEX_ERROR_CODES = {
  ...CONFIG_ERROR_CODES,
  ...POLICY_ERROR_CODES,
  ...STORE_ERROR_CODES,
  ...PROMPT_ERROR_CODES,
  ...SCHEMA_ERROR_CODES,
  ...INSTRUCTIONS_ERROR_CODES,
  ...GIT_ERROR_CODES,
  ...LEXSONA_ERROR_CODES,
  ...VALIDATION_ERROR_CODES,
} as const;

/**
 * Type for any valid Lex error code
 */
export type LexErrorCode = (typeof LEX_ERROR_CODES)[keyof typeof LEX_ERROR_CODES];

/**
 * Check if a string is a valid Lex error code
 */
export function isLexErrorCode(code: string): code is LexErrorCode {
  return Object.values(LEX_ERROR_CODES).includes(code as LexErrorCode);
}

/**
 * Standard next actions for common error scenarios
 *
 * Use these to provide consistent recovery suggestions.
 */
export const STANDARD_NEXT_ACTIONS = {
  /** Suggest running lex init */
  INIT_WORKSPACE: 'Run "lex init" to create a workspace',
  /** Suggest running lex policy check */
  CHECK_POLICY: 'Run "lex policy check" to validate policy',
  /** Suggest running lex timeline */
  VIEW_TIMELINE: 'Run "lex timeline" to see recent Frames',
  /** Suggest checking file path */
  CHECK_FILE_PATH: "Verify the file path exists and is readable",
  /** Suggest checking config */
  CHECK_CONFIG: "Check lex.yaml configuration for errors",
  /** Suggest using --force flag */
  USE_FORCE: "Use --force flag to overwrite existing files",
  /** Suggest retrying */
  RETRY: "Retry the operation",
  /** Suggest checking logs */
  CHECK_LOGS: "Check logs for more details",
} as const;
