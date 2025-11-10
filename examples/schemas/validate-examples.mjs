#!/usr/bin/env node

/**
 * Validates example JSON files against the schemas
 */

import { readFileSync } from "fs";
import { FeatureSpecV0Schema } from "../../.smartergpt/schemas/feature-spec-v0.js";
import { ExecutionPlanV1Schema } from "../../.smartergpt/schemas/execution-plan-v1.js";

console.log("Validating Feature Spec v0 example...");
const featureSpecExample = JSON.parse(
  readFileSync("./examples/schemas/feature-spec-example.json", "utf-8")
);

try {
  FeatureSpecV0Schema.parse(featureSpecExample);
  console.log("✓ Feature Spec v0 example is valid");
} catch (error) {
  console.error("✗ Feature Spec v0 example is invalid:", error);
  process.exit(1);
}

console.log("\nValidating Execution Plan v1 example...");
const executionPlanExample = JSON.parse(
  readFileSync("./examples/schemas/execution-plan-example.json", "utf-8")
);

try {
  ExecutionPlanV1Schema.parse(executionPlanExample);
  console.log("✓ Execution Plan v1 example is valid");
} catch (error) {
  console.error("✗ Execution Plan v1 example is invalid:", error);
  process.exit(1);
}

console.log("\n✓ All examples validated successfully!");
