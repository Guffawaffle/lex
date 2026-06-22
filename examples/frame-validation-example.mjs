/**
 * Example: Validating Frame payloads against Lex's canonical schema.
 *
 * This shows the two supported validation views:
 * - `safeParseFrame()` for canonical schema parsing
 * - `validateFramePayload()` for ingestion-oriented preflight validation
 *   with unknown-field warnings
 *
 * Usage:
 *   npx tsx examples/frame-validation-example.mjs
 */

import { safeParseFrame } from "../src/shared/types/frame-schema.js";
import { validateFramePayload } from "../src/memory/validation/index.js";

const validFrame = {
  id: "frame-001",
  timestamp: "2025-11-01T16:04:12-05:00",
  branch: "feature/auth-fix",
  module_scope: ["services/auth-core"],
  summary_caption: "Auth timeout fix",
  reference_point: "auth timeout session",
  status_snapshot: {
    next_action: "Run integration tests",
  },
  taskComplexity: {
    tier: "mid",
    assignedModel: "gpt-4",
    retryCount: 1,
  },
};

const legacyIngestionFrame = {
  id: "frame-002",
  timestamp: "2025-11-01T16:04:12-05:00",
  branch: "feature/auth-fix",
  module_scope: ["services/auth-core"],
  summary_caption: "Auth timeout fix",
  reference_point: "auth timeout session",
  status_snapshot: {
    next_action: "Run integration tests",
  },
  taskComplexity: {
    tier: "mid",
    assignedModel: "gpt-4",
    actualModel: "gpt-4",
    tierMismatch: false,
  },
  unknownTopLevelField: true,
};

function printCanonicalResult(label, payload) {
  const result = safeParseFrame(payload);
  console.log(`\n[canonical] ${label}`);
  if (result.success) {
    console.log("OK: valid Frame");
  } else {
    for (const issue of result.error.issues) {
      console.log(`ERR ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
  }
}

function printPreflightResult(label, payload) {
  const result = validateFramePayload(payload);
  console.log(`\n[preflight] ${label}`);
  if (result.valid) {
    console.log("OK: valid for ingestion");
  } else {
    for (const error of result.errors) {
      console.log(`ERR ${error.path}: ${error.message}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of result.warnings) {
      console.log(`- ${warning.path}: ${warning.message}`);
    }
  }
}

printCanonicalResult("valid frame", validFrame);
printPreflightResult("valid frame", validFrame);

printCanonicalResult("legacy ingestion frame", legacyIngestionFrame);
printPreflightResult("legacy ingestion frame", legacyIngestionFrame);
