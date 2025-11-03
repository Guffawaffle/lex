#!/usr/bin/env node
/**
 * Test suite for LexMap scanners
 * 
 * Tests:
 * 1. File path correctly maps to module via owns_paths
 * 2. Cross-module calls are detected
 * 3. Feature flag checks are detected
 * 4. Permission checks are detected
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const TEST_DIR = '/tmp/scanner_tests';
const POLICY_FILE = path.join(TEST_DIR, 'test.policy.json');
const SCANNERS_DIR = '/home/runner/work/lex/lex/policy/scanners';

// Test counter
let totalTests = 0;
let passedTests = 0;

function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        passedTests++;
        console.log(`✓ ${name}`);
      }).catch((error) => {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
      });
    } else {
      passedTests++;
      console.log(`✓ ${name}`);
    }
  } catch (error: any) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${error.message}`);
  }
}

async function setup() {
  // Clean and create test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'ui/admin'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'services/auth'), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, 'web-ui/userAdmin'), { recursive: true });

  // Create policy file
  const policy = {
    modules: {
      'ui/admin': {
        coords: [0, 1],
        owns_paths: ['ui/admin/**'],
        feature_flags: ['admin_panel'],
        requires_permissions: ['can_manage_users']
      },
      'services/auth': {
        coords: [1, 1],
        owns_paths: ['services/auth/**'],
        owns_namespaces: ['App\\\\Services\\\\Auth'],
        allowed_callers: ['services/user-api']
      },
      'ui/user-admin-panel': {
        coords: [0, 2],
        owns_paths: ['web-ui/userAdmin/**'],
        feature_flags: ['beta_user_admin'],
        requires_permissions: ['can_manage_users']
      }
    }
  };

  fs.writeFileSync(POLICY_FILE, JSON.stringify(policy, null, 2));
}

async function testTypeScriptScanner() {
  console.log('\n--- TypeScript Scanner Tests ---\n');

  // Test 1: File path maps to module
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/panel.ts'), `
export class AdminPanel {
  constructor() {}
}
`);

  await test('TS: File path maps to module via owns_paths', async () => {
    const { stdout } = await execAsync(
      `npx tsx ${path.join(SCANNERS_DIR, 'ts_scanner.ts')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path === 'ui/admin/panel.ts');
    if (!file || file.module_scope !== 'ui/admin') {
      throw new Error(`Expected module_scope 'ui/admin', got '${file?.module_scope}'`);
    }
  });

  // Test 2: Cross-module calls detected
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/panel.ts'), `
import { AuthService } from '../../services/auth/AuthService';

export class AdminPanel {
  constructor(private auth: AuthService) {}
}
`);

  fs.writeFileSync(path.join(TEST_DIR, 'services/auth/AuthService.ts'), `
export class AuthService {}
`);

  await test('TS: Cross-module calls are detected', async () => {
    const { stdout } = await execAsync(
      `npx tsx ${path.join(SCANNERS_DIR, 'ts_scanner.ts')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const edge = result.module_edges?.find(
      (e: any) => e.from_module === 'ui/admin' && e.to_module === 'services/auth'
    );
    if (!edge) {
      throw new Error('Expected cross-module edge not found');
    }
  });

  // Test 3: Feature flag detection - flags.flag_name
  fs.writeFileSync(path.join(TEST_DIR, 'web-ui/userAdmin/view.tsx'), `
export function View() {
  if (flags.beta_user_admin) {
    return <div>Admin</div>;
  }
}
`);

  await test('TS: Feature flag detection - flags.flag_name', async () => {
    const { stdout } = await execAsync(
      `npx tsx ${path.join(SCANNERS_DIR, 'ts_scanner.ts')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('userAdmin/view'));
    if (!file || !file.feature_flags.includes('beta_user_admin')) {
      throw new Error(`Expected feature flag 'beta_user_admin' not found`);
    }
  });

  // Test 4: Feature flag detection - featureFlags.isEnabled()
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/feature.ts'), `
if (featureFlags.isEnabled('admin_panel')) {
  console.log('enabled');
}
`);

  await test('TS: Feature flag detection - featureFlags.isEnabled()', async () => {
    const { stdout } = await execAsync(
      `npx tsx ${path.join(SCANNERS_DIR, 'ts_scanner.ts')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('feature.ts'));
    if (!file || !file.feature_flags.includes('admin_panel')) {
      throw new Error(`Expected feature flag 'admin_panel' not found`);
    }
  });

  // Test 5: Permission checks detected
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/access.ts'), `
export function checkAccess(user: User) {
  return hasPermission('can_manage_users');
}
`);

  await test('TS: Permission checks are detected', async () => {
    const { stdout } = await execAsync(
      `npx tsx ${path.join(SCANNERS_DIR, 'ts_scanner.ts')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('access.ts'));
    if (!file || !file.permissions.includes('can_manage_users')) {
      throw new Error(`Expected permission 'can_manage_users' not found`);
    }
  });
}

async function testPythonScanner() {
  console.log('\n--- Python Scanner Tests ---\n');

  // Test 1: File path maps to module
  fs.writeFileSync(path.join(TEST_DIR, 'services/auth/service.py'), `
class AuthService:
    pass
`);

  await test('Python: File path maps to module via owns_paths', async () => {
    const { stdout } = await execAsync(
      `python3 ${path.join(SCANNERS_DIR, 'python_scanner.py')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('services/auth'));
    if (!file || file.module_scope !== 'services/auth') {
      throw new Error(`Expected module_scope 'services/auth', got '${file?.module_scope}'`);
    }
  });

  // Test 2: Cross-module calls detected
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/views.py'), `
from services.auth.service import AuthService

class AdminPanel:
    pass
`);

  await test('Python: Cross-module imports are detected', async () => {
    const { stdout } = await execAsync(
      `python3 ${path.join(SCANNERS_DIR, 'python_scanner.py')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const edge = result.module_edges?.find(
      (e: any) => e.from_module === 'ui/admin' && e.to_module === 'services/auth'
    );
    if (!edge) {
      throw new Error('Expected cross-module edge not found');
    }
  });

  // Test 3: Feature flag detection
  fs.writeFileSync(path.join(TEST_DIR, 'web-ui/userAdmin/controller.py'), `
def view(request):
    if feature_flags.is_enabled('beta_user_admin'):
        return render_admin()
`);

  await test('Python: Feature flag detection - feature_flags.is_enabled()', async () => {
    const { stdout } = await execAsync(
      `python3 ${path.join(SCANNERS_DIR, 'python_scanner.py')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('controller.py'));
    if (!file || !file.feature_flags.includes('beta_user_admin')) {
      throw new Error(`Expected feature flag 'beta_user_admin' not found`);
    }
  });

  // Test 4: Permission checks detected
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/perms.py'), `
def check(user):
    return user.has_perm('can_manage_users')
`);

  await test('Python: Permission checks are detected', async () => {
    const { stdout } = await execAsync(
      `python3 ${path.join(SCANNERS_DIR, 'python_scanner.py')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('perms.py'));
    if (!file || !file.permissions.includes('can_manage_users')) {
      throw new Error(`Expected permission 'can_manage_users' not found`);
    }
  });
}

async function testPHPScanner() {
  console.log('\n--- PHP Scanner Tests ---\n');

  // Test 1: File path maps to module
  fs.writeFileSync(path.join(TEST_DIR, 'services/auth/Service.php'), `
<?php
namespace App\\Services\\Auth;
class AuthService {}
`);

  await test('PHP: File path maps to module via owns_paths', async () => {
    const { stdout } = await execAsync(
      `python3 ${path.join(SCANNERS_DIR, 'php_scanner.py')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('services/auth'));
    if (!file || file.module_scope !== 'services/auth') {
      throw new Error(`Expected module_scope 'services/auth', got '${file?.module_scope}'`);
    }
  });

  // Test 2: Feature flag detection
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/Controller.php'), `
<?php
class Controller {
    public function index() {
        if (FeatureFlags::enabled('admin_panel')) {
            return view('admin');
        }
    }
}
`);

  await test('PHP: Feature flag detection - FeatureFlags::enabled()', async () => {
    const { stdout } = await execAsync(
      `python3 ${path.join(SCANNERS_DIR, 'php_scanner.py')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('Controller.php'));
    if (!file || !file.feature_flags.includes('admin_panel')) {
      throw new Error(`Expected feature flag 'admin_panel' not found`);
    }
  });

  // Test 3: Permission checks detected
  fs.writeFileSync(path.join(TEST_DIR, 'ui/admin/Access.php'), `
<?php
class Access {
    public function check($user) {
        return $user->can('can_manage_users');
    }
}
`);

  await test('PHP: Permission checks are detected', async () => {
    const { stdout } = await execAsync(
      `python3 ${path.join(SCANNERS_DIR, 'php_scanner.py')} ${TEST_DIR} ${POLICY_FILE}`
    );
    const result = JSON.parse(stdout);
    const file = result.files.find((f: any) => f.path.includes('Access.php'));
    if (!file || !file.permissions.includes('can_manage_users')) {
      throw new Error(`Expected permission 'can_manage_users' not found`);
    }
  });
}

async function main() {
  console.log('=== LexMap Scanner Test Suite ===\n');
  
  await setup();
  await testTypeScriptScanner();
  await testPythonScanner();
  await testPHPScanner();

  console.log(`\n=== Results: ${passedTests}/${totalTests} tests passed ===`);
  
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
