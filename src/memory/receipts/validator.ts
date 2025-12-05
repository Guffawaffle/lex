/**
 * Receipt Validation Helper
 *
 * Provides validation for Receipt payloads with structured error reporting.
 *
 * @module memory/receipts/validator
 */

import { z } from "zod";
import { Receipt as ReceiptSchema, UncertaintyMarker as UncertaintyMarkerSchema } from "./schema.js";

/**
 * Validation error with field path information
 */
export interface ReceiptValidationError {
  /** Dot-notation path to the field (e.g., "uncertaintyNotes[0].stated") */
  path: string;
  /** Human-readable error message */
  message: string;
  /** Error code for programmatic handling */
  code: string;
}

/**
 * Warning about unknown fields
 */
export interface ReceiptValidationWarning {
  /** Dot-notation path to the unknown field */
  path: string;
  /** Warning message */
  message: string;
}

/**
 * Result of Receipt payload validation
 */
export interface ReceiptValidationResult {
  /** Whether the payload is valid */
  valid: boolean;
  /** Array of validation errors (empty if valid) */
  errors: ReceiptValidationError[];
  /** Array of warnings for unknown fields */
  warnings: ReceiptValidationWarning[];
}

/**
 * Known fields in the Receipt schema (for unknown field detection)
 */
const KNOWN_RECEIPT_FIELDS = new Set([
  "schemaVersion",
  "kind",
  "action",
  "outcome",
  "rationale",
  "confidence",
  "uncertaintyNotes",
  "reversibility",
  "rollbackPath",
  "rollbackTested",
  "escalationRequired",
  "escalationReason",
  "escalatedTo",
  "timestamp",
  "agentId",
  "sessionId",
  "frameId",
]);

/**
 * Known fields in UncertaintyMarker schema
 */
const KNOWN_UNCERTAINTY_MARKER_FIELDS = new Set(["stated", "actionTaken", "confidence", "mitigations"]);

/**
 * Convert Zod error path to dot-notation string
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
    case "invalid_literal":
      return "INVALID_LITERAL";
    case "invalid_enum_value":
      return "INVALID_ENUM_VALUE";
    case "too_small":
      return "TOO_SMALL";
    case "too_big":
      return "TOO_BIG";
    case "custom":
      return "CUSTOM_ERROR";
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
): ReceiptValidationWarning[] {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return [];
  }

  const warnings: ReceiptValidationWarning[] = [];
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
 * Validate a Receipt payload
 *
 * This function validates Receipt data against the schema and returns
 * structured errors with field paths and warnings for unknown fields.
 *
 * @param data - The payload to validate (unknown type for maximum flexibility)
 * @returns ReceiptValidationResult with valid flag, errors, and warnings
 *
 * @example
 * ```typescript
 * import { validateReceiptPayload } from '@smartergpt/lex/memory/receipts';
 *
 * const payload = {
 *   schemaVersion: '1.0.0',
 *   kind: 'Receipt',
 *   action: 'Implemented feature X',
 *   outcome: 'success',
 *   rationale: 'User requirement',
 *   confidence: 'high',
 *   reversibility: 'reversible',
 *   escalationRequired: false,
 *   timestamp: '2025-12-05T02:00:00Z'
 * };
 *
 * const result = validateReceiptPayload(payload);
 * if (result.valid) {
 *   // Safe to use
 *   console.log('Valid receipt!');
 * } else {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateReceiptPayload(data: unknown): ReceiptValidationResult {
  const errors: ReceiptValidationError[] = [];
  const warnings: ReceiptValidationWarning[] = [];

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
  const result = ReceiptSchema.safeParse(data);

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
  warnings.push(...detectUnknownFields(data, KNOWN_RECEIPT_FIELDS, ""));

  // Detect unknown fields in uncertaintyNotes
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.uncertaintyNotes)) {
    record.uncertaintyNotes.forEach((note, index) => {
      warnings.push(
        ...detectUnknownFields(note, KNOWN_UNCERTAINTY_MARKER_FIELDS, `uncertaintyNotes[${index}]`)
      );
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate an UncertaintyMarker payload
 *
 * @param data - The payload to validate
 * @returns ReceiptValidationResult with valid flag, errors, and warnings
 */
export function validateUncertaintyMarkerPayload(data: unknown): ReceiptValidationResult {
  const errors: ReceiptValidationError[] = [];
  const warnings: ReceiptValidationWarning[] = [];

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

  const result = UncertaintyMarkerSchema.safeParse(data);

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: pathToString(issue.path),
        message: issue.message,
        code: mapZodCode(issue),
      });
    }
  }

  warnings.push(...detectUnknownFields(data, KNOWN_UNCERTAINTY_MARKER_FIELDS, ""));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
