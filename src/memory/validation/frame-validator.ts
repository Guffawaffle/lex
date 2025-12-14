/**
 * Frame Payload Validation Helper
 *
 * Provides external callers with a way to pre-validate Frame payloads before ingestion.
 * Uses Zod schemas from memory/frames/types.ts with enhanced error reporting.
 *
 * @module memory/validation/frame-validator
 */

import { z } from "zod";
import { Frame as FrameSchema } from "../frames/types.js";

/**
 * Size limits for Frame fields to prevent excessively large payloads
 */
const SIZE_LIMITS = {
  /** Maximum length for string fields (e.g., summary_caption, reference_point) */
  MAX_STRING_LENGTH: 10000,
  /** Maximum number of items in array fields (e.g., keywords, toolCalls) */
  MAX_ARRAY_LENGTH: 1000,
  /** Maximum length for individual array items (strings) */
  MAX_ARRAY_ITEM_LENGTH: 500,
  /** Maximum serialized JSON size for nested objects (in characters) */
  MAX_NESTED_OBJECT_SIZE: 50000,
} as const;

/**
 * Validation error with field path information
 */
export interface FrameValidationError {
  /** Dot-notation path to the field (e.g., "status_snapshot.next_action") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
}

/**
 * Warning about unknown fields (partial validation support)
 */
export interface FrameValidationWarning {
  /** Dot-notation path to the unknown field */
  path: string;
  /** Warning message */
  message: string;
}

/**
 * Result of Frame payload validation
 */
export interface FrameValidationResult {
  /** Whether the payload is valid for ingestion */
  valid: boolean;
  /** Array of validation errors (empty if valid) */
  errors: FrameValidationError[];
  /** Array of warnings for unknown fields (partial validation) */
  warnings: FrameValidationWarning[];
}

/**
 * Known fields in the Frame schema (for unknown field detection)
 */
const KNOWN_FRAME_FIELDS = new Set([
  "id",
  "timestamp",
  "branch",
  "jira",
  "module_scope",
  "summary_caption",
  "reference_point",
  "status_snapshot",
  "keywords",
  "atlas_frame_id",
  "feature_flags",
  "permissions",
  "image_ids",
  "runId",
  "planHash",
  "spend",
  "userId",
  "executorRole",
  "toolCalls",
  "guardrailProfile",
  // v4 fields
  "turnCost",
  "capabilityTier",
  "taskComplexity",
]);

/**
 * Known fields in status_snapshot (for unknown field detection)
 */
const KNOWN_STATUS_SNAPSHOT_FIELDS = new Set([
  "next_action",
  "blockers",
  "merge_blockers",
  "tests_failing",
]);

/**
 * Known fields in spend metadata (for unknown field detection)
 */
const KNOWN_SPEND_FIELDS = new Set(["prompts", "tokens_estimated"]);

/**
 * Known fields in turnCost (for unknown field detection)
 */
const KNOWN_TURN_COST_FIELDS = new Set([
  "components",
  "weights",
  "weightedScore",
  "sessionId",
  "timestamp",
]);

/**
 * Known fields in turnCost.components (for unknown field detection)
 */
const KNOWN_TURN_COST_COMPONENT_FIELDS = new Set([
  "latency",
  "contextReset",
  "renegotiation",
  "tokenBloat",
  "attentionSwitch",
]);

/**
 * Known fields in turnCost.weights (for unknown field detection)
 */
const KNOWN_TURN_COST_WEIGHTS_FIELDS = new Set([
  "lambda",
  "gamma",
  "rho",
  "tau",
  "alpha",
]);

/**
 * Known fields in taskComplexity (for unknown field detection)
 */
const KNOWN_TASK_COMPLEXITY_FIELDS = new Set([
  "tier",
  "assignedModel",
  "actualModel",
  "escalated",
  "escalationReason",
  "retryCount",
  "tierMismatch",
]);

/**
 * Convert Zod error path to dot-notation string
 * Zod v4 uses PropertyKey[] for path which includes string | number | symbol
 */
function pathToString(path: PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path
    .map((segment, i) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }
      if (typeof segment === "symbol") {
        return `[Symbol(${segment.description ?? ""})]`;
      }
      return i === 0 ? segment : `.${segment}`;
    })
    .join("");
}

/**
 * Map Zod issue code to a user-friendly error code
 * Zod v4 issue codes: invalid_type, too_big, too_small, invalid_format,
 * not_multiple_of, unrecognized_keys, invalid_union, invalid_key,
 * invalid_element, invalid_value, custom
 */
function mapZodCode(issue: z.ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return "INVALID_TYPE";
    case "unrecognized_keys":
      return "UNKNOWN_FIELD";
    case "invalid_union":
      return "INVALID_UNION";
    case "invalid_value":
      return "INVALID_VALUE";
    case "invalid_format":
      return "INVALID_FORMAT";
    case "invalid_key":
      return "INVALID_KEY";
    case "invalid_element":
      return "INVALID_ELEMENT";
    case "too_small":
      return "TOO_SMALL";
    case "too_big":
      return "TOO_BIG";
    case "custom":
      return "CUSTOM_ERROR";
    case "not_multiple_of":
      return "NOT_MULTIPLE";
    default:
      return "VALIDATION_ERROR";
  }
}

/**
 * Detect unknown fields in an object and return warnings
 */
function detectUnknownFields(
  data: unknown,
  knownFields: Set<string>,
  pathPrefix: string
): FrameValidationWarning[] {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return [];
  }

  const warnings: FrameValidationWarning[] = [];
  const record = data as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!knownFields.has(key)) {
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      warnings.push({
        path,
        message: `Unknown field '${key}' will be ignored`,
      });
    }
  }

  return warnings;
}

/**
 * Check if a string field exceeds the maximum length
 */
function validateStringSize(
  value: unknown,
  path: string,
  maxLength: number = SIZE_LIMITS.MAX_STRING_LENGTH
): FrameValidationError | null {
  if (typeof value === "string" && value.length > maxLength) {
    return {
      path,
      message: `String exceeds maximum length of ${maxLength} characters (got ${value.length})`,
      code: "TOO_BIG",
    };
  }
  return null;
}

/**
 * Check if an array field exceeds the maximum length
 */
function validateArraySize(
  value: unknown,
  path: string,
  maxLength: number = SIZE_LIMITS.MAX_ARRAY_LENGTH
): FrameValidationError | null {
  if (Array.isArray(value) && value.length > maxLength) {
    return {
      path,
      message: `Array exceeds maximum length of ${maxLength} items (got ${value.length})`,
      code: "TOO_BIG",
    };
  }
  return null;
}

/**
 * Check if array items exceed the maximum length
 */
function validateArrayItemSizes(
  value: unknown,
  path: string,
  maxItemLength: number = SIZE_LIMITS.MAX_ARRAY_ITEM_LENGTH
): FrameValidationError[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const errors: FrameValidationError[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item === "string" && item.length > maxItemLength) {
      errors.push({
        path: `${path}[${i}]`,
        message: `Array item exceeds maximum length of ${maxItemLength} characters (got ${item.length})`,
        code: "TOO_BIG",
      });
    }
  }
  return errors;
}

/**
 * Check if a nested object exceeds the maximum serialized size
 */
function validateNestedObjectSize(
  value: unknown,
  path: string,
  maxSize: number = SIZE_LIMITS.MAX_NESTED_OBJECT_SIZE
): FrameValidationError | null {
  if (typeof value === "object" && value !== null) {
    try {
      const serialized = JSON.stringify(value);
      if (serialized.length > maxSize) {
        return {
          path,
          message: `Nested object exceeds maximum size of ${maxSize} characters (got ${serialized.length})`,
          code: "TOO_BIG",
        };
      }
    } catch (err) {
      return {
        path,
        message: `Failed to serialize nested object for size check: ${err instanceof Error ? err.message : String(err)}`,
        code: "INVALID_VALUE",
      };
    }
  }
  return null;
}

/**
 * Validate a Frame payload before ingestion.
 *
 * This function provides external callers with a way to pre-validate Frame data
 * before calling saveFrame(). It returns structured errors with field paths and
 * warnings for unknown fields.
 *
 * @param data - The payload to validate (unknown type for maximum flexibility)
 * @returns FrameValidationResult with valid flag, errors, and warnings
 *
 * @example
 * ```typescript
 * import { validateFramePayload } from '@smartergpt/lex/memory';
 *
 * const payload = {
 *   id: 'frame-001',
 *   timestamp: '2025-11-27T10:00:00Z',
 *   branch: 'feature/my-feature',
 *   module_scope: ['core'],
 *   summary_caption: 'Implemented feature X',
 *   reference_point: 'feature x complete',
 *   status_snapshot: { next_action: 'PR review' }
 * };
 *
 * const result = validateFramePayload(payload);
 * if (result.valid) {
 *   // Safe to ingest
 *   saveFrame(db, payload as Frame);
 * } else {
 *   console.error('Validation errors:', result.errors);
 * }
 *
 * // Check for unknown fields
 * if (result.warnings.length > 0) {
 *   console.warn('Unknown fields:', result.warnings);
 * }
 * ```
 */
export function validateFramePayload(data: unknown): FrameValidationResult {
  const errors: FrameValidationError[] = [];
  const warnings: FrameValidationWarning[] = [];

  // Early type check for better error messages
  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      errors: [
        {
          path: "(root)",
          message: data === null ? "Expected object, received null" : `Expected object, received ${typeof data}`,
          code: "INVALID_TYPE",
        },
      ],
      warnings: [],
    };
  }

  // Use Zod to validate the payload
  const result = FrameSchema.safeParse(data);

  if (!result.success) {
    // Convert Zod errors to our structured format
    for (const issue of result.error.issues) {
      errors.push({
        path: pathToString(issue.path),
        message: issue.message,
        code: mapZodCode(issue),
      });
    }
  }

  // Detect unknown fields at the root level
  warnings.push(...detectUnknownFields(data, KNOWN_FRAME_FIELDS, ""));

  // Detect unknown fields in status_snapshot
  const record = data as Record<string, unknown>;
  if (record.status_snapshot && typeof record.status_snapshot === "object") {
    warnings.push(
      ...detectUnknownFields(record.status_snapshot, KNOWN_STATUS_SNAPSHOT_FIELDS, "status_snapshot")
    );
  }

  // Detect unknown fields in spend
  if (record.spend && typeof record.spend === "object") {
    warnings.push(...detectUnknownFields(record.spend, KNOWN_SPEND_FIELDS, "spend"));
  }

  // Detect unknown fields in turnCost (v4)
  if (record.turnCost && typeof record.turnCost === "object") {
    warnings.push(...detectUnknownFields(record.turnCost, KNOWN_TURN_COST_FIELDS, "turnCost"));
    
    const turnCost = record.turnCost as Record<string, unknown>;
    
    // Detect unknown fields in turnCost.components
    if (turnCost.components && typeof turnCost.components === "object") {
      warnings.push(
        ...detectUnknownFields(turnCost.components, KNOWN_TURN_COST_COMPONENT_FIELDS, "turnCost.components")
      );
    }
    
    // Detect unknown fields in turnCost.weights
    if (turnCost.weights && typeof turnCost.weights === "object") {
      warnings.push(
        ...detectUnknownFields(turnCost.weights, KNOWN_TURN_COST_WEIGHTS_FIELDS, "turnCost.weights")
      );
    }
  }

  // Detect unknown fields in taskComplexity (v4)
  if (record.taskComplexity && typeof record.taskComplexity === "object") {
    warnings.push(...detectUnknownFields(record.taskComplexity, KNOWN_TASK_COMPLEXITY_FIELDS, "taskComplexity"));
  }

  // Size validation for string fields
  const stringFields = [
    { key: "id", value: record.id },
    { key: "summary_caption", value: record.summary_caption },
    { key: "reference_point", value: record.reference_point },
    { key: "branch", value: record.branch },
    { key: "jira", value: record.jira },
    { key: "atlas_frame_id", value: record.atlas_frame_id },
    { key: "runId", value: record.runId },
    { key: "planHash", value: record.planHash },
    { key: "userId", value: record.userId },
    { key: "executorRole", value: record.executorRole },
    { key: "guardrailProfile", value: record.guardrailProfile },
  ];

  for (const { key, value } of stringFields) {
    const error = validateStringSize(value, key);
    if (error) errors.push(error);
  }

  // Size validation for array fields
  const arrayFields = [
    { key: "module_scope", value: record.module_scope },
    { key: "keywords", value: record.keywords },
    { key: "feature_flags", value: record.feature_flags },
    { key: "permissions", value: record.permissions },
    { key: "image_ids", value: record.image_ids },
    { key: "toolCalls", value: record.toolCalls },
  ];

  for (const { key, value } of arrayFields) {
    const arrayError = validateArraySize(value, key);
    if (arrayError) errors.push(arrayError);
    
    // Also check individual array item sizes
    errors.push(...validateArrayItemSizes(value, key));
  }

  // Size validation for nested objects
  const nestedObjects = [
    { key: "status_snapshot", value: record.status_snapshot },
    { key: "spend", value: record.spend },
    { key: "turnCost", value: record.turnCost },
    { key: "taskComplexity", value: record.taskComplexity },
  ];

  for (const { key, value } of nestedObjects) {
    const objError = validateNestedObjectSize(value, key);
    if (objError) errors.push(objError);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
