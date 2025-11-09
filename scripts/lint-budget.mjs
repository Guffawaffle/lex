#!/usr/bin/env node
/**
 * Lint Budget Checker
 * 
 * Compares current ESLint results against a baseline to prevent quality erosion.
 * Fails if warning/error count increases.
 * 
 * Usage:
 *   node scripts/lint-budget.mjs <current.json> <baseline.json>
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node scripts/lint-budget.mjs <current.json> <baseline.json>');
    process.exit(1);
  }
  return { currentFile: args[0], baselineFile: args[1] };
}

function loadLintResults(filepath) {
  try {
    const content = readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error loading ${filepath}:`, err.message);
    process.exit(1);
  }
}

function analyzeLintResults(results) {
  const stats = {
    totalWarnings: 0,
    totalErrors: 0,
    fileWarnings: new Map(),
    ruleWarnings: new Map(),
  };

  for (const file of results) {
    const warnings = file.warningCount;
    const errors = file.errorCount;
    
    stats.totalWarnings += warnings;
    stats.totalErrors += errors;

    if (warnings > 0 || errors > 0) {
      stats.fileWarnings.set(file.filePath, { warnings, errors });
    }

    // Count by rule
    for (const msg of file.messages) {
      if (msg.ruleId) {
        const current = stats.ruleWarnings.get(msg.ruleId) || 0;
        stats.ruleWarnings.set(msg.ruleId, current + 1);
      }
    }
  }

  return stats;
}

function getTopOffenders(map, limit = 10) {
  return Array.from(map.entries())
    .sort((a, b) => {
      const aTotal = (a[1].warnings || 0) + (a[1].errors || 0) || b[1] - a[1];
      const bTotal = (b[1].warnings || 0) + (b[1].errors || 0) || 0;
      return bTotal - aTotal;
    })
    .slice(0, limit);
}

function printTopOffenders(title, offenders, isFile = false, baseDir = process.cwd()) {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
  
  offenders.forEach(([name, value], index) => {
    const displayName = isFile ? relative(baseDir, name) : name;
    if (isFile && typeof value === 'object') {
      const total = value.warnings + value.errors;
      console.log(`${index + 1}. ${displayName}: ${total} (${value.warnings}w, ${value.errors}e)`);
    } else {
      console.log(`${index + 1}. ${displayName}: ${value}`);
    }
  });
}

function compareResults(current, baseline) {
  const warningDiff = current.totalWarnings - baseline.totalWarnings;
  const errorDiff = current.totalErrors - baseline.totalErrors;

  console.log('\n📊 Lint Budget Report');
  console.log('====================\n');
  
  console.log('Current:');
  console.log(`  Warnings: ${current.totalWarnings}`);
  console.log(`  Errors:   ${current.totalErrors}`);
  
  console.log('\nBaseline:');
  console.log(`  Warnings: ${baseline.totalWarnings}`);
  console.log(`  Errors:   ${baseline.totalErrors}`);
  
  console.log('\nDifference:');
  console.log(`  Warnings: ${warningDiff > 0 ? '+' : ''}${warningDiff}`);
  console.log(`  Errors:   ${errorDiff > 0 ? '+' : ''}${errorDiff}`);

  // Top offenders by file
  const topFilesCurrent = getTopOffenders(current.fileWarnings, 10);
  printTopOffenders('📁 Top 10 Files by Warning Count', topFilesCurrent, true);

  // Top offenders by rule
  const topRulesCurrent = getTopOffenders(current.ruleWarnings, 10);
  printTopOffenders('\n📋 Top 10 Rules by Violation Count', topRulesCurrent);

  console.log('\n');

  // Determine pass/fail
  if (warningDiff > 0 || errorDiff > 0) {
    console.error('❌ FAIL: Lint budget exceeded!');
    console.error(`   ${warningDiff} more warning(s), ${errorDiff} more error(s) than baseline.`);
    console.error('   Please fix new issues or update baseline with: npm run lint:baseline:update');
    return false;
  } else if (warningDiff < 0 || errorDiff < 0) {
    console.log('✅ PASS: Lint improved! 🎉');
    console.log(`   ${Math.abs(warningDiff)} fewer warning(s), ${Math.abs(errorDiff)} fewer error(s).`);
    console.log('   Consider updating baseline to lock in improvements: npm run lint:baseline:update');
    return true;
  } else {
    console.log('✅ PASS: No change in lint warnings/errors.');
    return true;
  }
}

function main() {
  const { currentFile, baselineFile } = parseArgs();
  
  console.log('🔍 Loading lint results...');
  const currentResults = loadLintResults(currentFile);
  const baselineResults = loadLintResults(baselineFile);
  
  const currentStats = analyzeLintResults(currentResults);
  const baselineStats = analyzeLintResults(baselineResults);
  
  const passed = compareResults(currentStats, baselineStats);
  
  process.exit(passed ? 0 : 1);
}

main();
