import { buildAdjacencyLists } from './dist/graph.js';
import { readFileSync } from 'fs';

const policy = JSON.parse(readFileSync('test-policy.json', 'utf-8'));
const { allowedEdges, forbiddenEdges } = buildAdjacencyLists(policy);

console.log('=== Adjacency Lists ===');
console.log('\nAllowed Edges:');
for (const [from, targets] of allowedEdges.entries()) {
  if (targets.size > 0) {
    console.log(`  ${from} -> [${Array.from(targets).join(', ')}]`);
  }
}

console.log('\nForbidden Edges:');
for (const [from, targets] of forbiddenEdges.entries()) {
  if (targets.size > 0) {
    console.log(`  ${from} -> [${Array.from(targets).join(', ')}]`);
  }
}

// Manual BFS simulation
console.log('\n=== BFS Simulation ===');
const discovered = new Map();
const queue = [];

discovered.set('ui/admin-panel', 0);
queue.push({ moduleId: 'ui/admin-panel', distance: 0 });

console.log('Starting with:', 'ui/admin-panel');

while (queue.length > 0) {
  const { moduleId, distance } = queue.shift();
  console.log(`\nProcessing: ${moduleId} (distance: ${distance})`);
  
  if (distance >= 1) {
    console.log('  Reached fold radius, skipping');
    continue;
  }
  
  // Outbound allowed
  const outAllowed = allowedEdges.get(moduleId) || new Set();
  console.log(`  Outbound allowed: [${Array.from(outAllowed).join(', ')}]`);
  for (const n of outAllowed) {
    if (!discovered.has(n)) {
      console.log(`    Discovering: ${n}`);
      discovered.set(n, distance + 1);
      queue.push({ moduleId: n, distance: distance + 1 });
    }
  }
  
  // Outbound forbidden
  const outForbidden = forbiddenEdges.get(moduleId) || new Set();
  console.log(`  Outbound forbidden: [${Array.from(outForbidden).join(', ')}]`);
  for (const n of outForbidden) {
    if (!discovered.has(n)) {
      console.log(`    Discovering: ${n}`);
      discovered.set(n, distance + 1);
      queue.push({ moduleId: n, distance: distance + 1 });
    }
  }
}

console.log('\n=== Final discovered modules ===');
console.log(Array.from(discovered.keys()));
