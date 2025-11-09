#!/usr/bin/env node
/**
 * Legacy Code Removal Codemod
 *
 * Automated transformation tool for Phase 3 legacy cleanup.
 * Supports DRY_RUN (default) and APPLY modes.
 *
 * Usage:
 *   node scripts/codemod-remove-legacy.mjs --dry-run  # Preview changes
 *   node scripts/codemod-remove-legacy.mjs --apply    # Apply transformations
 *
 * Transformations:
 *   1. Convert require() to ESM imports
 *   2. Remove LEGACY_POLICY_PATH references
 *   3. Simplify generateReport signature
 *   4. Migrate FrameStore to modular API
 *   5. Delete validateModuleIdsSync
 *   6. Remove transformPolicy
 *   7. Delete buildPolicyGraph adapter
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const MODE = DRY_RUN ? 'DRY_RUN' : 'APPLY';

console.log(`\n🔧 Legacy Code Removal Codemod (${MODE})\n`);

// Change tracking
const changes = [];

/**
 * Record a change for reporting
 */
function recordChange(file, action, details, risk = 'LOW') {
  changes.push({
    file: relative(REPO_ROOT, file),
    action,
    details,
    risk,
  });
}

/**
 * Safe file read with error handling
 */
function readFile(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err) {
    console.error(`❌ Failed to read ${path}: ${err.message}`);
    return null;
  }
}

/**
 * Safe file write with dry-run support
 */
function writeFile(path, content) {
  if (DRY_RUN) {
    return; // Don't actually write in dry-run mode
  }
  try {
    writeFileSync(path, content, 'utf-8');
  } catch (err) {
    console.error(`❌ Failed to write ${path}: ${err.message}`);
  }
}

/**
 * Delete file with dry-run support
 */
function deleteFile(path) {
  if (DRY_RUN) {
    return; // Don't actually delete in dry-run mode
  }
  try {
    if (existsSync(path)) {
      rmSync(path);
    }
  } catch (err) {
    console.error(`❌ Failed to delete ${path}: ${err.message}`);
  }
}

// =============================================================================
// TRANSFORMATION 1: Convert require() to ESM imports in db.ts
// =============================================================================

function transformDbRequires() {
  const dbPath = join(REPO_ROOT, 'src/memory/store/db.ts');
  let content = readFile(dbPath);
  if (!content) return;

  const original = content;

  // Pattern 1: const { dirname: parentDir } = require("path");
  // Replace with: import { dirname } from "path";
  if (content.includes('require("path")')) {
    content = content.replace(
      /const\s*{\s*dirname:\s*parentDir\s*}\s*=\s*require\(["']path["']\);?/g,
      'import { dirname } from "path";'
    );
    // Also update usage of parentDir to dirname
    content = content.replace(/parentDir/g, 'dirname');
  }

  // Pattern 2: require("fs").readFileSync
  // Replace with: import { readFileSync } from "fs";
  if (content.includes('require("fs")')) {
    // Check if fs import already exists
    if (!content.includes('import') || !content.includes('from "fs"')) {
      // Add import at top of file after other imports
      const importRegex = /(import .+ from .+;?\n)+/;
      const match = content.match(importRegex);
      if (match) {
        const lastImportIndex = match.index + match[0].length;
        content =
          content.slice(0, lastImportIndex) +
          'import { readFileSync } from "fs";\n' +
          content.slice(lastImportIndex);
      }
    }
    // Replace inline require usage
    content = content.replace(/require\(["']fs["']\)\.readFileSync/g, 'readFileSync');
  }

  if (content !== original) {
    writeFile(dbPath, content);
    recordChange(dbPath, 'ESM import', 'Lines 70, 76: require() → import', 'LOW');
    console.log('✅ Transformed db.ts: require() → ESM imports');
  } else {
    console.log('ℹ️  db.ts: No require() patterns found (may already be clean)');
  }
}

// =============================================================================
// TRANSFORMATION 2: Remove LEGACY_POLICY_PATH
// =============================================================================

function removeLegacyPolicyPath() {
  const loaderPath = join(REPO_ROOT, 'src/shared/policy/loader.ts');
  let content = readFile(loaderPath);
  if (!content) return;

  const original = content;

  // Remove LEGACY_POLICY_PATH constant declaration
  content = content.replace(
    /\/\*\*\s*\n\s*\*\s*Legacy policy path.*?\n\s*\*\/\s*\nconst LEGACY_POLICY_PATH\s*=\s*["'][^"']+["'];?\s*\n/s,
    ''
  );

  // Remove fallback attempt in loadPolicy (look for existsSync check for legacy path)
  content = content.replace(
    /\s*\/\/ Try legacy path\s*\n\s*if\s*\(\s*existsSync\(legacyPath\)\s*\)\s*{\s*\n\s*resolvedPath\s*=\s*legacyPath;\s*\n\s*}\s*\n/s,
    ''
  );

  // More aggressive removal of legacy path logic
  content = content.replace(/\s*const legacyPath\s*=\s*[^;]+;\s*\n/g, '');
  content = content.replace(/\s*\/\/.*legacy.*\n/gi, '');

  // Remove from error message template literal
  content = content.replace(/\s*3\.\s*\$\{legacyPath\}\\n\\n/g, '');
  content = content.replace(/\s*\$\{legacyPath\}/g, '');

  if (content !== original) {
    writeFile(loaderPath, content);
    recordChange(loaderPath, 'Remove legacy path', 'Lines 24-26, 161-171: LEGACY_POLICY_PATH removed', 'LOW');
    console.log('✅ Removed LEGACY_POLICY_PATH from loader.ts');
  } else {
    console.log('ℹ️  loader.ts: LEGACY_POLICY_PATH not found (may already be removed)');
  }
}

// =============================================================================
// TRANSFORMATION 3: Remove transformPolicy function
// =============================================================================

function removeTransformPolicy() {
  const loaderPath = join(REPO_ROOT, 'src/shared/policy/loader.ts');
  let content = readFile(loaderPath);
  if (!content) return;

  const original = content;

  // Remove transformPolicy function (including JSDoc)
  content = content.replace(
    /\/\*\*\s*\n\s*\* Transform lexmap\.policy\.json.*?\*\/\s*\nfunction transformPolicy\([^)]*\):\s*Policy\s*{[\s\S]*?\n}\s*\n/s,
    ''
  );

  // Remove call to transformPolicy in loadPolicy
  content = content.replace(/const policy\s*=\s*transformPolicy\(rawPolicy\);?/g, 'const policy = rawPolicy as Policy;');
  content = content.replace(/transformPolicy\(rawPolicy\)/g, 'rawPolicy as Policy');

  if (content !== original) {
    writeFile(loaderPath, content);
    recordChange(loaderPath, 'Remove transform', 'Lines 62-91, 183: transformPolicy deleted', 'LOW');
    console.log('✅ Removed transformPolicy from loader.ts');
  } else {
    console.log('ℹ️  loader.ts: transformPolicy not found (may already be removed)');
  }
}

// =============================================================================
// TRANSFORMATION 4: Simplify generateReport signature
// =============================================================================

function simplifyGenerateReport() {
  const reporterPath = join(REPO_ROOT, 'src/policy/check/reporter.ts');
  let content = readFile(reporterPath);
  if (!content) return;

  const original = content;

  // Check if legacy signature still exists
  if (!content.includes('legacyFormat') && !content.includes('Backward-compatible')) {
    console.log('ℹ️  reporter.ts: generateReport already simplified');
    return;
  }

  // Replace function signature and logic
  // This is complex, so we'll do a targeted replacement
  const legacySignaturePattern = /\/\/ Backward-compatible generateReport[\s\S]*?export function generateReport\([\s\S]*?\): ReportResult \{[\s\S]*?const exitCode/s;

  const modernSignature = `/**
 * Generate a policy violation report
 *
 * @param violations - Array of detected violations
 * @param options - Report options
 * @returns Report result with formatted content and exit code
 */
export function generateReport(
  violations: Violation[],
  options: { policy?: Policy; format?: ReportFormat; strict?: boolean } = {}
): ReportResult {
  const { policy, format = 'text' } = options;

  const exitCode`;

  content = content.replace(legacySignaturePattern, modernSignature);

  if (content !== original) {
    writeFile(reporterPath, content);
    recordChange(reporterPath, 'Simplify signature', 'Lines 28-60: Enforce modern object parameter', 'LOW');
    console.log('✅ Simplified generateReport signature in reporter.ts');
  } else {
    console.log('ℹ️  reporter.ts: Could not auto-simplify signature (manual edit required)');
  }
}

// =============================================================================
// TRANSFORMATION 5: Delete validateModuleIdsSync
// =============================================================================

function deleteValidateModuleIdsSync() {
  const validatorPath = join(REPO_ROOT, 'src/shared/module_ids/validator.ts');
  let content = readFile(validatorPath);
  if (!content) return;

  const original = content;

  // Remove validateModuleIdsSync function (including JSDoc and @deprecated)
  content = content.replace(
    /\/\*\*[\s\S]*?@deprecated[\s\S]*?\*\/\s*\nexport function validateModuleIdsSync\([^)]*\)[\s\S]*?\n}\s*\n/s,
    ''
  );

  if (content !== original) {
    writeFile(validatorPath, content);
    recordChange(validatorPath, 'Delete function', 'Lines 226-264: validateModuleIdsSync removed', 'LOW');
    console.log('✅ Deleted validateModuleIdsSync from validator.ts');
  } else {
    console.log('ℹ️  validator.ts: validateModuleIdsSync not found (may already be removed)');
  }

  // Delete test suite
  const testPath = join(REPO_ROOT, 'test/shared/module_ids/validator.test.mjs');
  if (existsSync(testPath)) {
    let testContent = readFile(testPath);
    if (testContent) {
      const originalTest = testContent;

      // Remove entire describe block for validateModuleIdsSync
      testContent = testContent.replace(
        /describe\(['""]validateModuleIdsSync[\s\S]*?\n}\);?\s*\n/s,
        ''
      );

      if (testContent !== originalTest) {
        writeFile(testPath, testContent);
        recordChange(testPath, 'Delete tests', 'Lines 45-152: Remove sync validator tests', 'NONE');
        console.log('✅ Deleted validateModuleIdsSync tests');
      }
    }
  }
}

// =============================================================================
// TRANSFORMATION 6: Evaluate and remove buildPolicyGraph
// =============================================================================

function removeBuildPolicyGraph() {
  const graphPath = join(REPO_ROOT, 'src/shared/atlas/graph.ts');
  let content = readFile(graphPath);
  if (!content) return;

  const original = content;

  // Remove buildPolicyGraph adapter function
  content = content.replace(
    /\/\*\*\s*\n\s*\* Adapter function for backward compatibility[\s\S]*?\*\/\s*\nexport function buildPolicyGraph\([^)]*\)[\s\S]*?\n}\s*\n/s,
    ''
  );

  if (content !== original) {
    writeFile(graphPath, content);
    recordChange(graphPath, 'Delete adapter', 'Lines 321-355: buildPolicyGraph removed', 'LOW');
    console.log('✅ Deleted buildPolicyGraph adapter from graph.ts');

    // Check for usage in fold-radius.ts
    const foldRadiusPath = join(REPO_ROOT, 'src/shared/atlas/fold-radius.ts');
    if (existsSync(foldRadiusPath)) {
      console.log('⚠️  WARNING: fold-radius.ts may need manual update (imports buildPolicyGraph)');
      recordChange(foldRadiusPath, 'MANUAL CHECK', 'Verify buildPolicyGraph usage', 'MEDIUM');
    }
  } else {
    console.log('ℹ️  graph.ts: buildPolicyGraph not found (may already be removed)');
  }
}

// =============================================================================
// TRANSFORMATION 7: Note FrameStore migration (manual required)
// =============================================================================

function noteFrameStoreMigration() {
  // FrameStore migration is complex and requires manual intervention
  // Just report what needs to be done
  console.log('\n⚠️  FrameStore Migration (MANUAL REQUIRED):');
  console.log('   Files affected:');
  console.log('   - src/memory/store/framestore.ts (DELETE after migration)');
  console.log('   - src/memory/mcp_server/server.ts (migrate to modular API)');
  console.log('   - test/memory/store/images.test.ts (migrate to modular API)');
  console.log('   - test/memory/store/images.perf.test.ts (migrate to modular API)');
  console.log('   See docs/legacy-removal-plan.md for migration steps.\n');

  recordChange(
    'src/memory/store/framestore.ts',
    'MANUAL DELETE',
    'Migrate usages to modular API first',
    'HIGH'
  );
  recordChange(
    'src/memory/mcp_server/server.ts',
    'MANUAL MIGRATE',
    'Replace FrameStore with getDb/saveFrame/etc',
    'MEDIUM'
  );
}

// =============================================================================
// REPORTING
// =============================================================================

function printReport() {
  console.log('\n' + '='.repeat(75));
  console.log('CODEMOD RESULTS (' + MODE + ')');
  console.log('='.repeat(75) + '\n');

  if (changes.length === 0) {
    console.log('✅ No changes needed (codebase may already be clean)\n');
    return;
  }

  // Group by risk level
  const byRisk = {
    NONE: changes.filter((c) => c.risk === 'NONE'),
    LOW: changes.filter((c) => c.risk === 'LOW'),
    MEDIUM: changes.filter((c) => c.risk === 'MEDIUM'),
    HIGH: changes.filter((c) => c.risk === 'HIGH'),
  };

  // Print table
  console.log('┌─────────────────────────────────────────────────────────────────────┐');
  console.log('│ File                           │ Action       │ Details   │ Risk    │');
  console.log('├─────────────────────────────────────────────────────────────────────┤');

  for (const risk of ['NONE', 'LOW', 'MEDIUM', 'HIGH']) {
    for (const change of byRisk[risk]) {
      const file = change.file.padEnd(30).substring(0, 30);
      const action = change.action.padEnd(12).substring(0, 12);
      const details = change.details.padEnd(30).substring(0, 30);
      const riskLabel = change.risk.padEnd(7);
      console.log(`│ ${file} │ ${action} │ ${details} │ ${riskLabel} │`);
    }
  }

  console.log('└─────────────────────────────────────────────────────────────────────┘\n');

  // Summary
  console.log(`Total files affected: ${new Set(changes.map((c) => c.file)).size}`);
  console.log(`Total transformations: ${changes.length}`);
  console.log(`Risk distribution:`);
  console.log(`  - NONE: ${byRisk.NONE.length}`);
  console.log(`  - LOW: ${byRisk.LOW.length}`);
  console.log(`  - MEDIUM: ${byRisk.MEDIUM.length}`);
  console.log(`  - HIGH: ${byRisk.HIGH.length}`);

  if (DRY_RUN) {
    console.log('\n💡 This was a DRY RUN. No files were modified.');
    console.log('   Run with --apply to make changes.\n');
  } else {
    console.log('\n✅ Changes applied. Run validation commands:\n');
    console.log('   npm run type-check && npm run build');
    console.log('   npm test');
    console.log('   npm run lint\n');
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('Starting transformations...\n');

  // Run transformations in safe order
  transformDbRequires();
  removeLegacyPolicyPath();
  removeTransformPolicy();
  simplifyGenerateReport();
  deleteValidateModuleIdsSync();
  removeBuildPolicyGraph();
  noteFrameStoreMigration(); // Manual step

  // Print report
  printReport();
}

main().catch((err) => {
  console.error('❌ Codemod failed:', err);
  process.exit(1);
});
