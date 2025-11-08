/**
 * Reporter unit tests
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Policy, PolicyModule } from "../../shared/types/policy.js";
import type { Violation } from "./violations.js";
import { generateReport } from "./reporter.js";

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  const base: Violation = {
    type: "forbidden_caller",
    module: "ui/user-admin",
    file: "web-ui/userAdmin/panel.tsx",
    message: "UI cannot call auth-core directly",
    details: "Forbidden call blocked by policy",
    target_module: "services/auth-core",
    import_from: "services/auth-core",
  };
  return { ...base, ...overrides } as Violation;
}

function makePolicy(moduleCount = 3): Policy {
  const modules: Record<string, PolicyModule> = {};
  for (let i = 0; i < moduleCount; i++) {
    modules[`mod/${i}`] = { owns_paths: ["**/*"] };
  }
  return { modules } as Policy;
}

// Text format

test("generateReport text - zero violations (no policy)", () => {
  const r = generateReport([], { format: "text" });
  assert.equal(r.exitCode, 0);
  assert.match(r.content, /No violations found/);
});

test("generateReport text - zero violations (with policy header)", () => {
  const policy = makePolicy(5);
  const r = generateReport([], { policy, format: "text" });
  assert.equal(r.exitCode, 0);
  assert.match(r.content, /Policy: 5 modules/);
});

test("generateReport text - one violation", () => {
  const r = generateReport([makeViolation()], { format: "text" });
  assert.equal(r.exitCode, 1);
  assert.match(r.content, /Found 1 violation\(s\)/);
});

// JSON format

test("generateReport json - two violations", () => {
  const r = generateReport([makeViolation(), makeViolation({ file: "b.ts" })], { format: "json" });
  assert.equal(r.exitCode, 1);
  const obj = JSON.parse(r.content);
  assert.equal(obj.count, 2);
  assert.equal(obj.status, "violations_found");
});

// Markdown format

test("generateReport markdown - zero violations (with policy header)", () => {
  const policy = makePolicy(2);
  const r = generateReport([], { policy, format: "markdown" });
  assert.equal(r.exitCode, 0);
  assert.match(r.content, /Policy Check Report/);
  assert.match(r.content, /\*\*Policy:\*\* 2 modules/);
});

test("generateReport markdown - one violation, atlas fallback resilience", () => {
  // No policy; ensure we never throw and content includes summary
  const r = generateReport([makeViolation()], { format: "markdown" });
  assert.equal(r.exitCode, 1);
  assert.match(r.content, /\*\*Status:\*\* ❌ 1 violation/);
});
