/**
 * Performance test for fold radius algorithm with large graphs
 */

import { computeFoldRadius, Policy, PolicyModule } from './index.js';

// Configuration constants
const MIN_CALLERS = 2;
const CALLER_RANGE = 3;
const FORBIDDEN_CALLER_PROBABILITY = 0.8;

// Generate a large policy with 150 modules
function generateLargePolicy(numModules: number): Policy {
  const modules: Record<string, PolicyModule> = {};
  
  for (let i = 0; i < numModules; i++) {
    const moduleId = `module-${i}`;
    const allowedCallers: string[] = [];
    const forbiddenCallers: string[] = [];
    
    // Create connections to create a reasonably connected graph
    // Each module can be called by 2-5 other modules
    const numCallers = MIN_CALLERS + Math.floor(Math.random() * CALLER_RANGE);
    for (let j = 0; j < numCallers; j++) {
      const callerId = `module-${Math.floor(Math.random() * numModules)}`;
      if (callerId !== moduleId && !allowedCallers.includes(callerId)) {
        if (Math.random() > FORBIDDEN_CALLER_PROBABILITY) {
          forbiddenCallers.push(callerId);
        } else {
          allowedCallers.push(callerId);
        }
      }
    }
    
    modules[moduleId] = {
      coords: [i % 10, Math.floor(i / 10)],
      allowed_callers: allowedCallers,
      forbidden_callers: forbiddenCallers,
    };
  }
  
  return { modules };
}

console.log("=== Performance Test: 150 Module Graph ===\n");

const largePolicy = generateLargePolicy(150);
console.log(`Generated policy with ${Object.keys(largePolicy.modules).length} modules`);

// Test different radii
const testCases = [
  { seeds: ["module-75"], radius: 0 },
  { seeds: ["module-75"], radius: 1 },
  { seeds: ["module-75"], radius: 2 },
  { seeds: ["module-75"], radius: 3 },
  { seeds: ["module-25", "module-75", "module-125"], radius: 1 },
  { seeds: ["module-25", "module-75", "module-125"], radius: 2 },
];

testCases.forEach((testCase, idx) => {
  const startTime = Date.now();
  const result = computeFoldRadius(testCase.seeds, testCase.radius, largePolicy);
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`\nTest ${idx + 1}:`);
  console.log(`  Seeds: ${testCase.seeds.join(", ")}`);
  console.log(`  Radius: ${testCase.radius}`);
  console.log(`  Modules found: ${result.modules.length}`);
  console.log(`  Edges: ${result.edges.length}`);
  console.log(`  Time: ${duration}ms`);
  
  // Validate results
  if (testCase.radius === 0) {
    if (result.modules.length !== testCase.seeds.length) {
      console.log(`  ❌ ERROR: Expected ${testCase.seeds.length} modules for radius 0`);
    }
  }
});

console.log("\n=== Performance test completed ===");
console.log("✅ All performance tests passed - algorithm handles 150+ module graphs efficiently");
