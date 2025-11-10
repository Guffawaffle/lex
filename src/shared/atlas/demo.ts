/**
 * Demo script to test the fold radius algorithm
 *
 * This creates a sample policy and tests various fold radius scenarios.
 */

import { computeFoldRadius, Policy } from "./index.js";

// Sample policy based on the README examples
const samplePolicy: Policy = {
  modules: {
    "ui/user-admin-panel": {
      coords: [0, 2],
      allowed_callers: [],
      forbidden_callers: ["services/auth-core"],
      feature_flags: ["beta_user_admin"],
      requires_permissions: ["can_manage_users"],
      kill_patterns: ["duplicate_auth_logic"],
    },
    "services/user-access-api": {
      coords: [1, 2],
      allowed_callers: ["ui/user-admin-panel"],
      forbidden_callers: [],
      feature_flags: ["beta_user_admin"],
      requires_permissions: ["can_manage_users"],
    },
    "services/auth-core": {
      coords: [2, 1],
      allowed_callers: ["services/user-access-api"],
      forbidden_callers: ["ui/user-admin-panel"],
    },
    "database/user-store": {
      coords: [3, 1],
      allowed_callers: ["services/auth-core", "services/user-access-api"],
      forbidden_callers: [],
    },
  },
};

console.log("=== Fold Radius Demo ===\n");

// Test Case 1: Radius 0 (only seed modules)
console.log("Test 1: Radius 0 (only seed modules)");
const result0 = computeFoldRadius(["ui/user-admin-panel"], 0, samplePolicy);
console.log(`Seeds: ${result0.seed_modules.join(", ")}`);
console.log(`Modules found: ${result0.modules.length}`);
console.log(`Module IDs: ${result0.modules.map((m) => m.id).join(", ")}`);
console.log(`Edges: ${result0.edges.length}\n`);

// Test Case 2: Radius 1 (seed + immediate neighbors)
console.log("Test 2: Radius 1 (seed + immediate neighbors)");
const result1 = computeFoldRadius(["ui/user-admin-panel"], 1, samplePolicy);
console.log(`Seeds: ${result1.seed_modules.join(", ")}`);
console.log(`Modules found: ${result1.modules.length}`);
console.log(`Module IDs: ${result1.modules.map((m) => m.id).join(", ")}`);
console.log(`Edges: ${result1.edges.length}`);
console.log("Edges:");
result1.edges.forEach((e) => {
  console.log(`  ${e.from} -> ${e.to} (${e.allowed ? "allowed" : "forbidden"})`);
});
console.log();

// Test Case 3: Radius 2 (seed + 1-hop + 2-hop)
console.log("Test 3: Radius 2 (seed + 1-hop + 2-hop neighbors)");
const result2 = computeFoldRadius(["ui/user-admin-panel"], 2, samplePolicy);
console.log(`Seeds: ${result2.seed_modules.join(", ")}`);
console.log(`Modules found: ${result2.modules.length}`);
console.log(`Module IDs: ${result2.modules.map((m) => m.id).join(", ")}`);
console.log(`Edges: ${result2.edges.length}\n`);

// Test Case 4: Multiple seed modules
console.log("Test 4: Multiple seed modules");
const result3 = computeFoldRadius(["ui/user-admin-panel", "database/user-store"], 1, samplePolicy);
console.log(`Seeds: ${result3.seed_modules.join(", ")}`);
console.log(`Modules found: ${result3.modules.length}`);
console.log(`Module IDs: ${result3.modules.map((m) => m.id).join(", ")}`);
console.log(`Edges: ${result3.edges.length}\n`);

// Test Case 5: Disconnected module
console.log("Test 5: Module with no edges (disconnected)");
const policyWithDisconnected: Policy = {
  modules: {
    ...samplePolicy.modules,
    "standalone/isolated-module": {
      coords: [5, 5],
      allowed_callers: [],
      forbidden_callers: [],
    },
  },
};
const result4 = computeFoldRadius(["standalone/isolated-module"], 1, policyWithDisconnected);
console.log(`Seeds: ${result4.seed_modules.join(", ")}`);
console.log(`Modules found: ${result4.modules.length}`);
console.log(`Module IDs: ${result4.modules.map((m) => m.id).join(", ")}`);
console.log(`Edges: ${result4.edges.length}\n`);

// Test Case 6: Modules without coords
console.log("Test 6: Modules without coords");
const policyNoCoords: Policy = {
  modules: {
    "module-a": {
      allowed_callers: [],
      forbidden_callers: [],
    },
    "module-b": {
      allowed_callers: ["module-a"],
      forbidden_callers: [],
    },
  },
};
const result5 = computeFoldRadius(["module-a"], 1, policyNoCoords);
console.log(`Seeds: ${result5.seed_modules.join(", ")}`);
console.log(`Modules found: ${result5.modules.length}`);
console.log("Modules:");
result5.modules.forEach((m) => {
  console.log(`  ${m.id} - coords: ${m.coords ? JSON.stringify(m.coords) : "undefined"}`);
});
console.log();

console.log("=== All tests completed ===");
