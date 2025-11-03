/**
 * Integration tests for Policy Check Pipeline
 * 
 * Tests the full policy check integration:
 * - Scanner → merge → check pipeline
 * - Atlas Frame extraction from policy
 * - Violation detection with real policy
 * 
 * Run with: node policy/integration.test.mjs
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { mergeScans } from './merge/dist/merge.js';
import { detectViolations } from './check/dist/violations.js';
import { generateReport } from './check/dist/reporter.js';
import { extractAtlasFrame } from '../shared/atlas/atlas-frame.js';
import { loadPolicy } from '../shared/policy/loader.js';

describe('Policy Integration Tests', () => {
  describe('Scanner → Merge → Check Pipeline', () => {
    test('should complete full pipeline: scan → merge → check', () => {
      // Step 1: Simulate scanner outputs
      const typescriptScan = {
        language: 'typescript',
        files: [
          {
            path: 'src/ui/admin/UserPanel.tsx',
            declarations: [{ type: 'component', name: 'UserPanel' }],
            imports: [
              { from: 'src/services/auth/AuthCore', type: 'import_statement' },
            ],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const phpScan = {
        language: 'php',
        files: [
          {
            path: 'app/Controllers/UserController.php',
            declarations: [{ type: 'class', name: 'UserController' }],
            imports: [
              { from: 'App\\Services\\AuthService', type: 'import_statement' },
            ],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      // Step 2: Merge scanner outputs
      const merged = mergeScans([typescriptScan, phpScan]);
      assert.ok(merged, 'Should merge scanner outputs');
      assert.equal(merged.sources.length, 2, 'Should include both sources');
      assert.equal(merged.files.length, 2, 'Should include both files');

      // Step 3: Load policy
      const policy = {
        modules: {
          'ui/admin': {
            owns_paths: ['src/ui/admin/**'],
          },
          'services/auth': {
            owns_paths: ['src/services/auth/**', 'app/Services/**'],
            forbidden_callers: ['ui/**'],
          },
        },
      };

      // Step 4: Check violations
      const violations = detectViolations(merged, policy);
      assert.ok(violations.length > 0, 'Should detect forbidden_caller violation');
      assert.equal(violations[0].type, 'forbidden_caller');
      assert.equal(violations[0].module, 'ui/admin');

      // Step 5: Generate report
      const report = generateReport(violations, policy, 'text');
      assert.equal(report.exitCode, 1, 'Should exit with error code');
      assert.ok(
        report.content.includes('forbidden'),
        'Report should mention violation type'
      );
    });

    test('should pass clean pipeline with no violations', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/ui/components/Button.tsx',
            declarations: [{ type: 'component', name: 'Button' }],
            imports: [
              { from: 'src/services/api/ButtonApi', type: 'import_statement' },
            ],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'ui/components': {
            owns_paths: ['src/ui/components/**'],
          },
          'services/api': {
            owns_paths: ['src/services/api/**'],
            allowed_callers: ['ui/**'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.equal(violations.length, 0, 'Should have no violations');

      const report = generateReport(violations, policy, 'text');
      assert.equal(report.exitCode, 0, 'Should exit successfully');
      assert.ok(
        report.content.includes('No violations'),
        'Report should indicate success'
      );
    });

    test('should handle multi-language pipeline', () => {
      const scans = [
        {
          language: 'typescript',
          files: [
            {
              path: 'frontend/src/App.tsx',
              declarations: [],
              imports: [{ from: 'api/client', type: 'import_statement' }],
              feature_flags: [],
              permissions: [],
              warnings: [],
            },
          ],
        },
        {
          language: 'python',
          files: [
            {
              path: 'backend/api/views.py',
              declarations: [],
              imports: [{ from: 'database.models', type: 'import_statement' }],
              feature_flags: [],
              permissions: [],
              warnings: [],
            },
          ],
        },
        {
          language: 'php',
          files: [
            {
              path: 'legacy/api/endpoints.php',
              declarations: [],
              imports: [],
              feature_flags: [],
              permissions: [],
              warnings: [],
            },
          ],
        },
      ];

      const merged = mergeScans(scans);
      assert.equal(merged.sources.length, 3, 'Should merge all languages');
      assert.equal(merged.files.length, 3, 'Should include all files');
      assert.ok(merged.sources.includes('typescript'));
      assert.ok(merged.sources.includes('python'));
      assert.ok(merged.sources.includes('php'));
    });
  });

  describe('Atlas Frame Extraction from Policy', () => {
    test('should extract Atlas Frame from policy violations', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/features/beta/NewWidget.tsx',
            declarations: [],
            imports: [],
            feature_flags: [], // Missing required flag
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'features/beta': {
            owns_paths: ['src/features/beta/**'],
            feature_flags: ['beta_ui_enabled'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.ok(violations.length > 0, 'Should detect feature flag violation');

      // Create a Frame from violation
      const frame = {
        id: 'frame-policy-001',
        timestamp: new Date().toISOString(),
        branch: 'feature/beta-ui',
        module_scope: ['features/beta'],
        summary_caption: 'Policy violation in beta feature',
        reference_point: 'beta feature flag missing',
        status_snapshot: {
          next_action: 'Add beta_ui_enabled feature flag',
          merge_blockers: violations.map((v) => v.message),
        },
        keywords: ['policy', 'violation', 'feature-flag'],
      };

      // Extract Atlas Frame
      const atlasFrame = extractAtlasFrame(frame);
      assert.ok(atlasFrame, 'Should extract Atlas Frame');
      assert.equal(atlasFrame.context, frame.reference_point);
      assert.ok(
        atlasFrame.status.merge_blockers.length > 0,
        'Should include merge blockers'
      );
    });

    test('should create Atlas Frame for successful policy check', () => {
      const frame = {
        id: 'frame-policy-002',
        timestamp: new Date().toISOString(),
        branch: 'feature/compliant-code',
        module_scope: ['ui/components'],
        summary_caption: 'All policy checks passed',
        reference_point: 'clean policy check',
        status_snapshot: {
          next_action: 'Ready to merge',
          blockers: [],
        },
      };

      const atlasFrame = extractAtlasFrame(frame);
      assert.ok(atlasFrame, 'Should extract Atlas Frame');
      assert.equal(atlasFrame.status.next_action, 'Ready to merge');
      assert.equal(atlasFrame.status.blockers.length, 0);
    });
  });

  describe('Violation Detection with Real Policy', () => {
    test('should detect forbidden_caller violations', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/ui/admin/Panel.tsx',
            declarations: [],
            imports: [
              { from: 'src/services/auth-core/Auth', type: 'import_statement' },
            ],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'ui/admin': {
            owns_paths: ['src/ui/admin/**'],
          },
          'services/auth-core': {
            owns_paths: ['src/services/auth-core/**'],
            forbidden_callers: ['ui/**'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.ok(violations.length > 0, 'Should detect violation');
      assert.equal(violations[0].type, 'forbidden_caller');
      assert.ok(
        violations[0].message.includes('forbidden'),
        'Message should explain violation'
      );
    });

    test('should detect missing_allowed_caller violations', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/ui/components/Widget.tsx',
            declarations: [],
            imports: [
              { from: 'src/backend/api/UserApi', type: 'import_statement' },
            ],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'ui/components': {
            owns_paths: ['src/ui/components/**'],
          },
          'backend/api': {
            owns_paths: ['src/backend/api/**'],
            allowed_callers: ['services/**'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.ok(violations.length > 0, 'Should detect violation');
      assert.equal(violations[0].type, 'missing_allowed_caller');
    });

    test('should detect feature_flag violations', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/features/premium/Dashboard.tsx',
            declarations: [],
            imports: [],
            feature_flags: [], // Missing required flag
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'features/premium': {
            owns_paths: ['src/features/premium/**'],
            feature_flags: ['premium_enabled'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.ok(violations.length > 0, 'Should detect violation');
      assert.equal(violations[0].type, 'feature_flag');
      assert.ok(violations[0].message.includes('premium_enabled'));
    });

    test('should detect permission violations', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/admin/users/Manager.tsx',
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [], // Missing required permission
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'admin/users': {
            owns_paths: ['src/admin/users/**'],
            requires_permissions: ['can_manage_users'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.ok(violations.length > 0, 'Should detect violation');
      assert.equal(violations[0].type, 'permission');
      assert.ok(violations[0].message.includes('can_manage_users'));
    });

    test('should detect kill_pattern violations', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/legacy/OldAuth.ts',
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: ['Found deprecated_pattern in authenticate method'],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'legacy': {
            owns_paths: ['src/legacy/**'],
            kill_patterns: ['deprecated_pattern'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.ok(violations.length > 0, 'Should detect violation');
      assert.equal(violations[0].type, 'kill_pattern');
      assert.ok(violations[0].message.includes('deprecated_pattern'));
    });

    test('should handle multiple violations in single file', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/ui/admin/AdminPanel.tsx',
            declarations: [],
            imports: [
              { from: 'src/services/auth/Core', type: 'import_statement' },
            ],
            feature_flags: [], // Missing required flag
            permissions: [], // Missing required permission
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'ui/admin': {
            owns_paths: ['src/ui/admin/**'],
            feature_flags: ['admin_panel_enabled'],
            requires_permissions: ['can_access_admin'],
          },
          'services/auth': {
            owns_paths: ['src/services/auth/**'],
            forbidden_callers: ['ui/**'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      assert.ok(violations.length >= 3, 'Should detect multiple violations');

      const types = violations.map((v) => v.type);
      assert.ok(types.includes('forbidden_caller'));
      assert.ok(types.includes('feature_flag'));
      assert.ok(types.includes('permission'));
    });
  });

  describe('Report Generation', () => {
    test('should generate text report with violations', () => {
      const violations = [
        {
          file: 'src/test.ts',
          module: 'test-module',
          type: 'forbidden_caller',
          message: 'Test violation message',
          details: 'Detailed explanation',
          target_module: 'target',
        },
      ];

      const policy = {
        modules: {
          'test-module': { owns_paths: ['src/**'] },
        },
      };

      const report = generateReport(violations, policy, 'text');
      assert.equal(report.exitCode, 1);
      assert.ok(report.content.includes('violation'));
      assert.ok(report.content.includes('test-module'));
    });

    test('should generate JSON report', () => {
      const violations = [
        {
          file: 'src/test.ts',
          module: 'test-module',
          type: 'forbidden_caller',
          message: 'Test violation',
          details: 'Details',
          target_module: 'target',
        },
      ];

      const policy = { modules: {} };

      const report = generateReport(violations, policy, 'json');
      assert.equal(report.exitCode, 1);

      const json = JSON.parse(report.content);
      assert.equal(json.status, 'violations_found');
      assert.equal(json.count, 1);
      assert.equal(json.violations.length, 1);
    });

    test('should generate markdown report', () => {
      const violations = [
        {
          file: 'src/test.ts',
          module: 'test-module',
          type: 'forbidden_caller',
          message: 'Test violation',
          details: 'Details',
          target_module: 'target',
        },
      ];

      const policy = {
        modules: {
          'test-module': { owns_paths: ['src/**'] },
        },
      };

      const report = generateReport(violations, policy, 'markdown');
      assert.equal(report.exitCode, 1);
      assert.ok(report.content.includes('# Policy Check Report'));
      assert.ok(report.content.includes('## Summary'));
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty scanner output', () => {
      const scan = {
        language: 'typescript',
        files: [],
      };

      const merged = mergeScans([scan]);
      assert.equal(merged.files.length, 0);

      const policy = { modules: {} };
      const violations = detectViolations(merged, policy);
      assert.equal(violations.length, 0);
    });

    test('should handle files outside known modules', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'scripts/build.ts',
            declarations: [],
            imports: [],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'src': {
            owns_paths: ['src/**'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      // Should not throw, just skip unknown files
      assert.equal(violations.length, 0);
    });

    test('should support wildcard patterns in policy', () => {
      const scan = {
        language: 'typescript',
        files: [
          {
            path: 'src/ui/admin/Panel.tsx',
            declarations: [],
            imports: [
              { from: 'src/services/shared/Utils', type: 'import_statement' },
            ],
            feature_flags: [],
            permissions: [],
            warnings: [],
          },
        ],
      };

      const merged = mergeScans([scan]);

      const policy = {
        modules: {
          'ui/admin': {
            owns_paths: ['src/ui/admin/**'],
          },
          'services/shared': {
            owns_paths: ['src/services/shared/**'],
            allowed_callers: ['ui/**', 'services/**'],
          },
        },
      };

      const violations = detectViolations(merged, policy);
      // ui/admin matches ui/** pattern, so should be allowed
      assert.equal(violations.length, 0);
    });
  });
});

console.log('\n✅ Policy Integration Tests - Full pipeline coverage\n');
