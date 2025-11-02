/**
 * Example: Using Module ID Validation in Frame Creation
 * 
 * This demonstrates how memory/frames/ can use the validator
 * to enforce THE CRITICAL RULE before creating a Frame.
 */

import { validateModuleIds, ModuleNotFoundError } from '../shared/module_ids/index.js';
import { readFileSync } from 'fs';

// Example function that might exist in memory/frames/
function createFrame(frameData, policyPath = './policy/policy_spec/lexmap.policy.json') {
  // Load policy
  const policyContent = readFileSync(policyPath, 'utf-8');
  const policy = JSON.parse(policyContent);
  
  // Validate module_scope against policy
  const validationResult = validateModuleIds(frameData.module_scope, policy);
  
  if (!validationResult.valid) {
    // Construct detailed error message
    const errorMessages = validationResult.errors.map(error => error.message);
    throw new ModuleNotFoundError(
      validationResult.errors[0].module,
      validationResult.errors[0].suggestions
    );
  }
  
  // If validation passes, proceed with Frame creation
  console.log('✓ Module IDs validated successfully');
  return {
    ...frameData,
    validated: true
  };
}

// Example usage
try {
  // This should fail - 'auth-core' doesn't exist
  const frame1 = createFrame({
    id: 'frame-001',
    timestamp: '2025-11-01T16:04:12-05:00',
    branch: 'feature/auth-fix',
    module_scope: ['auth-core'],  // Invalid - should be 'services/auth-core'
    summary_caption: 'Auth fix',
    reference_point: 'auth deadlock',
    status_snapshot: {
      next_action: 'Fix auth'
    }
  }, '/tmp/test-proper-policy.json');
} catch (error) {
  console.error('Expected error:', error.message);
  console.log('Suggestions:', error.suggestions);
}

// This should succeed
try {
  const frame2 = createFrame({
    id: 'frame-002',
    timestamp: '2025-11-01T16:04:12-05:00',
    branch: 'feature/auth-fix',
    module_scope: ['services/auth-core'],  // Valid
    summary_caption: 'Auth fix',
    reference_point: 'auth deadlock',
    status_snapshot: {
      next_action: 'Fix auth'
    }
  }, '/tmp/test-proper-policy.json');
  console.log('\n✓ Frame created successfully:', frame2.id);
} catch (error) {
  console.error('Unexpected error:', error.message);
}
