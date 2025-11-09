/**
 * Minimal CLI Event Schema Validator
 *
 * Validates that CliEvent objects conform to the v1 schema.
 * This is a best-effort shape checker without external dependencies.
 *
 * For full JSON Schema validation, install ajv and use:
 * schemas/cli-output.v1.schema.json
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "../../schemas/cli-output.v1.schema.json");

/**
 * Load the CLI Event v1 JSON schema
 * @returns {object} The schema object
 */
export function loadSchema() {
  return JSON.parse(readFileSync(schemaPath, "utf-8"));
}

/**
 * Validate that an object conforms to CliEvent v1 schema
 *
 * @param {unknown} obj - Object to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateCliEvent(obj) {
  const errors = [];

  // Must be an object
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { valid: false, errors: ["Must be an object"] };
  }

  // Required fields
  if (!("v" in obj)) errors.push("Missing required field: v");
  if (!("ts" in obj)) errors.push("Missing required field: ts");
  if (!("level" in obj)) errors.push("Missing required field: level");

  // Type checks for required fields
  if ("v" in obj && obj.v !== 1) {
    errors.push(`v must be 1, got ${obj.v}`);
  }

  if ("ts" in obj) {
    if (typeof obj.ts !== "string") {
      errors.push(`ts must be a string, got ${typeof obj.ts}`);
    } else {
      // Basic ISO 8601 format check
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      if (!isoRegex.test(obj.ts)) {
        errors.push(`ts must be ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ), got ${obj.ts}`);
      }
    }
  }

  if ("level" in obj) {
    const validLevels = ["info", "warn", "error", "success", "debug"];
    if (!validLevels.includes(obj.level)) {
      errors.push(`level must be one of ${validLevels.join(", ")}, got ${obj.level}`);
    }
  }

  // Optional field type checks
  if ("scope" in obj && typeof obj.scope !== "string") {
    errors.push(`scope must be a string, got ${typeof obj.scope}`);
  }

  if ("code" in obj && typeof obj.code !== "string") {
    errors.push(`code must be a string, got ${typeof obj.code}`);
  }

  if ("message" in obj) {
    if (typeof obj.message !== "string") {
      errors.push(`message must be a string, got ${typeof obj.message}`);
    } else if (obj.message.length > 100) {
      errors.push(`message must be <= 100 chars, got ${obj.message.length}`);
    }
  }

  if ("hint" in obj && typeof obj.hint !== "string") {
    errors.push(`hint must be a string, got ${typeof obj.hint}`);
  }

  // Check for additional properties (schema has additionalProperties: false)
  const allowedProps = ["v", "ts", "level", "scope", "code", "message", "data", "hint"];
  for (const key of Object.keys(obj)) {
    if (!allowedProps.includes(key)) {
      errors.push(`Unexpected property: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
