/**
 * Example: Using LexSona Behavioral Rules
 * 
 * This example demonstrates how to load and filter behavioral rules
 * with the precedence chain system.
 */

import { resolveRules, listRules, getRule } from '@smartergpt/lex/rules';

console.log('=== LexSona Rule Loader Example ===\n');

// Example 1: List all available rules
console.log('1. List all available rule IDs:');
const allRuleIds = listRules();
console.log(`   Found ${allRuleIds.length} rules:`, allRuleIds.join(', '));
console.log();

// Example 2: Get a specific rule
console.log('2. Get a specific rule by ID:');
const fallbackRule = getRule('tool-fallback-protocol');
if (fallbackRule) {
  console.log(`   Rule: ${fallbackRule.rule_id}`);
  console.log(`   Text: ${fallbackRule.text}`);
  console.log(`   Confidence: ${fallbackRule.confidence}`);
  console.log(`   Source: ${fallbackRule.source}`);
  console.log(`   Severity: ${fallbackRule.severity}`);
}
console.log();

// Example 3: Resolve rules with context filtering
console.log('3. Resolve rules for github-copilot environment:');
const copilotRules = resolveRules({
  environment: 'github-copilot',
  confidenceThreshold: 0.5  // Lower threshold for demo
});
console.log(`   Found ${copilotRules.length} matching rules:`);
copilotRules.forEach(rule => {
  console.log(`   - ${rule.rule_id} (confidence: ${rule.confidence}, severity: ${rule.severity})`);
});
console.log();

// Example 4: Filter by context tags
console.log('4. Resolve rules with "execution" context tag:');
const executionRules = resolveRules({
  context_tags: ['execution'],
  confidenceThreshold: 0.5
});
console.log(`   Found ${executionRules.length} execution-related rules:`);
executionRules.forEach(rule => {
  console.log(`   - ${rule.rule_id}`);
});
console.log();

// Example 5: High confidence rules only
console.log('5. Get high-confidence rules (>75%):');
const highConfidenceRules = resolveRules({
  confidenceThreshold: 0.75
});
console.log(`   Found ${highConfidenceRules.length} high-confidence rules`);
console.log();

// Example 6: Format rules for prompt injection
console.log('6. Format rules for system prompt:');
const rulesForPrompt = resolveRules({
  environment: 'github-copilot',
  context_tags: ['execution', 'tools'],
  confidenceThreshold: 0.5
});

console.log('   Behavioral Rules (LexSona):');
rulesForPrompt.forEach(rule => {
  const severity = rule.severity === 'zero-tolerance' ? '[MUST]' : 
                   rule.severity === 'should' ? '[SHOULD]' : '[STYLE]';
  console.log(`   ${severity} ${rule.text}`);
});
console.log();

console.log('=== Example Complete ===');
