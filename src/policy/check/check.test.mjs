/**
 * Tests for Policy Violation Detection and Reporting
 *
 * Run with: node policy/check/check.test.mjs
 */

import { strict as assert } from "assert";
import { test, describe } from "node:test";
// Adjusted import paths to point to built dist output under repository root
import { detectViolations } from "../../../dist/policy/check/violations.js";
import { generateReport, getExitCode } from "../../../dist/policy/check/reporter.js";

describe("detectViolations", () => {
  test("detects forbidden caller violations", () => {
    const policy = {
      modules: {
        "ui/admin": {
          owns_paths: ["src/ui/admin/**"],
          forbidden_callers: [],
        },
        "services/auth-core": {
          owns_paths: ["src/services/auth/**"],
          forbidden_callers: ["ui/**"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/ui/admin/UserPanel.tsx",
          declarations: [],
          imports: [{ from: "src/services/auth/AuthService", type: "import_statement" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "forbidden_caller");
    assert.equal(violations[0].module, "ui/admin");
    assert.equal(violations[0].target_module, "services/auth-core");
    assert.ok(violations[0].message.includes("forbidden"));
  });

  test("detects missing allowed caller violations", () => {
    const policy = {
      modules: {
        "ui/dashboard": {
          owns_paths: ["src/ui/dashboard/**"],
        },
        "backend/api": {
          owns_paths: ["src/backend/api/**"],
          allowed_callers: ["services/**"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/ui/dashboard/Widget.tsx",
          declarations: [],
          imports: [{ from: "src/backend/api/UserApi", type: "import_statement" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "missing_allowed_caller");
    assert.equal(violations[0].module, "ui/dashboard");
    assert.equal(violations[0].target_module, "backend/api");
    assert.ok(violations[0].message.includes("not in allowed_callers"));
  });

  test("detects feature flag violations", () => {
    const policy = {
      modules: {
        "features/beta-ui": {
          owns_paths: ["src/features/beta/**"],
          feature_flags: ["beta_ui_enabled"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/features/beta/NewWidget.tsx",
          declarations: [],
          imports: [],
          feature_flags: [], // Missing required flag!
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "feature_flag");
    assert.equal(violations[0].module, "features/beta-ui");
    assert.ok(violations[0].message.includes("beta_ui_enabled"));
  });

  test("detects permission violations", () => {
    const policy = {
      modules: {
        "admin/users": {
          owns_paths: ["src/admin/users/**"],
          requires_permissions: ["can_manage_users"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/admin/users/UserManager.tsx",
          declarations: [],
          imports: [],
          feature_flags: [],
          permissions: [], // Missing required permission!
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "permission");
    assert.equal(violations[0].module, "admin/users");
    assert.ok(violations[0].message.includes("can_manage_users"));
  });

  test("detects kill pattern violations in module", () => {
    const policy = {
      modules: {
        "legacy/auth": {
          owns_paths: ["src/legacy/auth/**"],
          kill_patterns: ["duplicate_auth_logic"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/legacy/auth/OldAuthService.ts",
          declarations: [],
          imports: [],
          feature_flags: [],
          permissions: [],
          warnings: ["Found duplicate_auth_logic in authenticate method"],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "kill_pattern");
    assert.equal(violations[0].module, "legacy/auth");
    assert.ok(violations[0].message.includes("duplicate_auth_logic"));
  });

  test("detects global kill pattern violations", () => {
    const policy = {
      modules: {
        "utils/helpers": {
          owns_paths: ["src/utils/**"],
        },
      },
      global_kill_patterns: [
        {
          pattern: "deprecated_api",
          description: "Remove all uses of deprecated API",
        },
      ],
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/utils/helper.ts",
          declarations: [],
          imports: [],
          feature_flags: [],
          permissions: [],
          warnings: ["Using deprecated_api in helper function"],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, "kill_pattern");
    assert.ok(violations[0].message.includes("deprecated_api"));
    assert.ok(violations[0].details.includes("Remove all uses"));
  });

  test("passes when no violations exist", () => {
    const policy = {
      modules: {
        "ui/components": {
          owns_paths: ["src/ui/components/**"],
        },
        "services/api": {
          owns_paths: ["src/services/api/**"],
          allowed_callers: ["ui/**"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/ui/components/Button.tsx",
          declarations: [],
          imports: [{ from: "src/services/api/ButtonApi", type: "import_statement" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 0);
  });

  test("passes when file has required feature flags", () => {
    const policy = {
      modules: {
        "features/beta-ui": {
          owns_paths: ["src/features/beta/**"],
          feature_flags: ["beta_ui_enabled"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/features/beta/NewWidget.tsx",
          declarations: [],
          imports: [],
          feature_flags: ["beta_ui_enabled"], // Has required flag
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 0);
  });

  test("passes when file has required permissions", () => {
    const policy = {
      modules: {
        "admin/users": {
          owns_paths: ["src/admin/users/**"],
          requires_permissions: ["can_manage_users"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/admin/users/UserManager.tsx",
          declarations: [],
          imports: [],
          feature_flags: [],
          permissions: ["can_manage_users"], // Has required permission
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    assert.equal(violations.length, 0);
  });

  test("handles files outside known modules gracefully", () => {
    const policy = {
      modules: {
        "ui/components": {
          owns_paths: ["src/ui/components/**"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/unknown/SomeFile.tsx",
          declarations: [],
          imports: [],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    // Should not throw, just skip unknown files
    assert.equal(violations.length, 0);
  });

  test("supports wildcard patterns in allowed_callers", () => {
    const policy = {
      modules: {
        "ui/admin": {
          owns_paths: ["src/ui/admin/**"],
        },
        "services/shared": {
          owns_paths: ["src/services/shared/**"],
          allowed_callers: ["ui/**", "services/**"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/ui/admin/Panel.tsx",
          declarations: [],
          imports: [{ from: "src/services/shared/Utils", type: "import_statement" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    // ui/admin matches ui/** pattern, so should be allowed
    assert.equal(violations.length, 0);
  });

  test("supports namespace-based imports (PHP style)", () => {
    const policy = {
      modules: {
        "backend/controllers": {
          owns_paths: ["app/Controllers/**"],
          owns_namespaces: ["App\\Controllers\\"],
        },
        "backend/models": {
          owns_paths: ["app/Models/**"],
          owns_namespaces: ["App\\Models\\"],
          allowed_callers: ["backend/controllers"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["policy/scanners"],
      files: [
        {
          path: "app/Controllers/UserController.php",
          declarations: [],
          imports: [{ from: "App\\Models\\User", type: "import_statement" }],
          feature_flags: [],
          permissions: [],
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    // Should resolve namespace and allow the import
    assert.equal(violations.length, 0);
  });

  test("detects multiple violations in single file", () => {
    const policy = {
      modules: {
        "ui/admin": {
          owns_paths: ["src/ui/admin/**"],
          feature_flags: ["admin_panel_enabled"],
          requires_permissions: ["can_access_admin"],
        },
        "services/auth": {
          owns_paths: ["src/services/auth/**"],
          forbidden_callers: ["ui/**"],
        },
      },
    };

    const merged = {
      version: "1.0.0",
      sources: ["typescript"],
      files: [
        {
          path: "src/ui/admin/AdminPanel.tsx",
          declarations: [],
          imports: [{ from: "src/services/auth/AuthCore", type: "import_statement" }],
          feature_flags: [], // Missing required flag
          permissions: [], // Missing required permission
          warnings: [],
        },
      ],
      edges: [],
      warnings: [],
    };

    const violations = detectViolations(merged, policy);

    // Should have 3 violations: forbidden_caller, feature_flag, permission
    assert.equal(violations.length, 3);

    const types = violations.map((v) => v.type).sort();
    assert.ok(types.includes("forbidden_caller"));
    assert.ok(types.includes("feature_flag"));
    assert.ok(types.includes("permission"));
  });
});

describe("generateReport", () => {
  test("generates text report for clean result", () => {
    const violations = [];
    const policy = { modules: {} };

    const report = generateReport(violations, policy, "text");

    assert.equal(report.exitCode, 0);
    assert.ok(report.content.includes("No violations"));
  });

  test("generates text report with violations", () => {
    const violations = [
      {
        file: "src/test.ts",
        module: "test-module",
        type: "forbidden_caller",
        message: "Test violation",
        details: "Test details",
      },
    ];
    const policy = { modules: { "test-module": { owns_paths: ["src/**"] } } };

    const report = generateReport(violations, policy, "text");

    assert.equal(report.exitCode, 1);
    assert.ok(report.content.includes("violation"));
    assert.ok(report.content.includes("test-module"));
  });

  test("generates JSON report", () => {
    const violations = [
      {
        file: "src/test.ts",
        module: "test-module",
        type: "forbidden_caller",
        message: "Test violation",
        details: "Test details",
      },
    ];
    const policy = { modules: {} };

    const report = generateReport(violations, policy, "json");

    assert.equal(report.exitCode, 1);

    const json = JSON.parse(report.content);
    assert.equal(json.count, 1);
    assert.equal(json.status, "violations_found");
    assert.equal(json.violations.length, 1);
  });

  test("generates markdown report", () => {
    const violations = [
      {
        file: "src/test.ts",
        module: "test-module",
        type: "forbidden_caller",
        message: "Test violation",
        details: "Test details",
      },
    ];
    const policy = { modules: { "test-module": { owns_paths: ["src/**"] } } };

    const report = generateReport(violations, policy, "markdown");

    assert.equal(report.exitCode, 1);
    assert.ok(report.content.includes("# Policy Check Report"));
    assert.ok(report.content.includes("## Summary"));
    assert.ok(report.content.includes("test-module"));
  });
});

describe("getExitCode", () => {
  test("returns 0 for no violations", () => {
    const exitCode = getExitCode([]);
    assert.equal(exitCode, 0);
  });

  test("returns 1 for violations", () => {
    const violations = [
      {
        file: "src/test.ts",
        module: "test-module",
        type: "forbidden_caller",
        message: "Test violation",
        details: "",
      },
    ];
    const exitCode = getExitCode(violations);
    assert.equal(exitCode, 1);
  });
});
