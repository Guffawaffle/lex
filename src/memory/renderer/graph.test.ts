/**
 * Test suite for graph rendering
 * Run with: node --test memory/renderer/dist/renderer/graph.test.js
 */

import { renderAtlasFrameGraph, exportGraphAsPNG, type AtlasFrame } from './graph.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Test output directory
const TEST_OUTPUT_DIR = '/tmp/graph-renderer-tests';

// Performance test constants
const PERFORMANCE_TARGET_MS = 500;
const LARGE_GRAPH_SIZE = 50;

/**
 * Create a test Atlas Frame with sample data
 */
function createTestAtlasFrame(): AtlasFrame {
  return {
    atlas_timestamp: new Date().toISOString(),
    seed_modules: ['ui/admin-panel'],
    fold_radius: 1,
    modules: [
      {
        id: 'ui/admin-panel',
        coords: [400, 300],
        owns_paths: ['ui/admin/**'],
        forbidden_callers: ['backend/auth'],
        feature_flags: ['admin_ui'],
        requires_permissions: ['admin_access'],
      },
      {
        id: 'api/user-service',
        coords: [200, 200],
        owns_paths: ['api/users/**'],
        allowed_callers: ['ui/admin-panel'],
      },
      {
        id: 'api/admin-service',
        coords: [600, 200],
        owns_paths: ['api/admin/**'],
        allowed_callers: ['ui/admin-panel'],
        requires_permissions: ['admin_access'],
      },
      {
        id: 'backend/auth',
        coords: [400, 100],
        owns_paths: ['backend/auth/**'],
        allowed_callers: ['api/user-service', 'api/admin-service'],
        forbidden_callers: ['ui/admin-panel'],
      },
    ],
    edges: [
      {
        from: 'ui/admin-panel',
        to: 'api/user-service',
        allowed: true,
      },
      {
        from: 'ui/admin-panel',
        to: 'api/admin-service',
        allowed: true,
      },
      {
        from: 'ui/admin-panel',
        to: 'backend/auth',
        allowed: false,
        reason: 'forbidden_caller',
      },
      {
        from: 'api/user-service',
        to: 'backend/auth',
        allowed: true,
      },
      {
        from: 'api/admin-service',
        to: 'backend/auth',
        allowed: true,
      },
    ],
    critical_rule: 'Every module name MUST match the IDs in lexmap.policy.json',
  };
}

/**
 * Create a larger test frame for performance testing
 */
function createLargeTestAtlasFrame(): AtlasFrame {
  const modules = [];
  const edges = [];
  
  // Create modules in a grid
  for (let i = 0; i < LARGE_GRAPH_SIZE; i++) {
    modules.push({
      id: `module-${i}`,
      coords: [
        100 + (i % 10) * 90,
        100 + Math.floor(i / 10) * 90
      ] as [number, number],
    });
  }
  
  // Create edges (each module connects to next few modules)
  for (let i = 0; i < LARGE_GRAPH_SIZE - 1; i++) {
    edges.push({
      from: `module-${i}`,
      to: `module-${i + 1}`,
      allowed: true,
    });
    
    // Add some forbidden edges
    if (i % 5 === 0 && i + 2 < LARGE_GRAPH_SIZE) {
      edges.push({
        from: `module-${i}`,
        to: `module-${i + 2}`,
        allowed: false,
        reason: 'forbidden_caller',
      });
    }
  }
  
  return {
    atlas_timestamp: new Date().toISOString(),
    seed_modules: ['module-0', 'module-25'],
    fold_radius: 2,
    modules,
    edges,
    critical_rule: 'Every module name MUST match the IDs in lexmap.policy.json',
  };
}

/**
 * Test 1: Render basic SVG graph
 */
async function testBasicSVGRendering() {
  console.log('Test 1: Rendering basic SVG graph...');
  
  const atlasFrame = createTestAtlasFrame();
  const svg = renderAtlasFrameGraph(atlasFrame);
  
  // Verify SVG structure
  if (!svg.includes('<svg')) {
    throw new Error('Output does not contain SVG element');
  }
  
  if (!svg.includes('</svg>')) {
    throw new Error('SVG is not properly closed');
  }
  
  // Check for nodes
  if (!svg.includes('circle')) {
    throw new Error('SVG does not contain node circles');
  }
  
  // Check for edges
  if (!svg.includes('line')) {
    throw new Error('SVG does not contain edge lines');
  }
  
  // Check for markers (arrows)
  if (!svg.includes('marker')) {
    throw new Error('SVG does not contain arrow markers');
  }
  
  // Save output
  const outputPath = join(TEST_OUTPUT_DIR, 'test-basic-graph.svg');
  writeFileSync(outputPath, svg);
  
  console.log(`✓ Basic SVG rendered successfully (${svg.length} bytes)`);
  console.log(`  Saved to: ${outputPath}`);
  
  return svg;
}

/**
 * Test 2: Render with force-directed layout
 */
async function testForceDirectedLayout() {
  console.log('Test 2: Testing force-directed layout...');
  
  const atlasFrame = createTestAtlasFrame();
  const svg = renderAtlasFrameGraph(atlasFrame, {
    layout: 'force-directed',
    layoutConfig: {
      iterations: 50,
    },
  });
  
  if (!svg.includes('<svg')) {
    throw new Error('Force-directed layout failed to generate SVG');
  }
  
  const outputPath = join(TEST_OUTPUT_DIR, 'test-force-directed.svg');
  writeFileSync(outputPath, svg);
  
  console.log(`✓ Force-directed layout rendered successfully`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 3: Render with hierarchical layout
 */
async function testHierarchicalLayout() {
  console.log('Test 3: Testing hierarchical layout...');
  
  const atlasFrame = createTestAtlasFrame();
  const svg = renderAtlasFrameGraph(atlasFrame, {
    layout: 'hierarchical',
  });
  
  if (!svg.includes('<svg')) {
    throw new Error('Hierarchical layout failed to generate SVG');
  }
  
  const outputPath = join(TEST_OUTPUT_DIR, 'test-hierarchical.svg');
  writeFileSync(outputPath, svg);
  
  console.log(`✓ Hierarchical layout rendered successfully`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 4: Export as PNG
 */
async function testPNGExport() {
  console.log('Test 4: Testing PNG export...');
  
  const atlasFrame = createTestAtlasFrame();
  const svg = renderAtlasFrameGraph(atlasFrame);
  const png = await exportGraphAsPNG(svg, { width: 800, height: 600 });
  
  // Verify PNG signature
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!png.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Output is not a valid PNG');
  }
  
  const outputPath = join(TEST_OUTPUT_DIR, 'test-export.png');
  writeFileSync(outputPath, png);
  
  console.log(`✓ PNG export successful (${png.length} bytes)`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 5: Test with custom colors
 */
async function testCustomColors() {
  console.log('Test 5: Testing custom node colors...');
  
  const atlasFrame = createTestAtlasFrame();
  const svg = renderAtlasFrameGraph(atlasFrame, {
    nodeColors: {
      'ui/admin-panel': '#FF6B6B',
      'api/user-service': '#4ECDC4',
      'api/admin-service': '#45B7D1',
      'backend/auth': '#96CEB4',
    },
  });
  
  if (!svg.includes('#FF6B6B')) {
    throw new Error('Custom colors were not applied');
  }
  
  const outputPath = join(TEST_OUTPUT_DIR, 'test-custom-colors.svg');
  writeFileSync(outputPath, svg);
  
  console.log(`✓ Custom colors applied successfully`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 6: Performance test with large graph
 */
async function testLargeGraphPerformance() {
  console.log(`Test 6: Testing performance with large graph (${LARGE_GRAPH_SIZE} nodes)...`);
  
  const atlasFrame = createLargeTestAtlasFrame();
  const startTime = Date.now();
  
  const svg = renderAtlasFrameGraph(atlasFrame, {
    layout: 'force-directed',
    layoutConfig: {
      iterations: 100,
    },
  });
  
  const renderTime = Date.now() - startTime;
  
  if (!svg.includes('<svg')) {
    throw new Error('Large graph rendering failed');
  }
  
  const outputPath = join(TEST_OUTPUT_DIR, 'test-large-graph.svg');
  writeFileSync(outputPath, svg);
  
  console.log(`✓ Large graph rendered in ${renderTime}ms`);
  console.log(`  Saved to: ${outputPath}`);
  
  // Check performance requirement (< 500ms for < 100 nodes)
  if (renderTime > PERFORMANCE_TARGET_MS) {
    console.warn(`  ⚠ Render time ${renderTime}ms exceeds target of ${PERFORMANCE_TARGET_MS}ms`);
  } else {
    console.log(`  ✓ Performance requirement met (${renderTime}ms < ${PERFORMANCE_TARGET_MS}ms)`);
  }
}

/**
 * Test 7: Test edge cases
 */
async function testEdgeCases() {
  console.log('Test 7: Testing edge cases...');
  
  // Empty graph
  const emptyFrame: AtlasFrame = {
    atlas_timestamp: new Date().toISOString(),
    seed_modules: [],
    fold_radius: 0,
    modules: [],
    edges: [],
    critical_rule: 'Test',
  };
  
  const emptySvg = renderAtlasFrameGraph(emptyFrame);
  if (!emptySvg.includes('<svg')) {
    throw new Error('Empty graph should still render SVG container');
  }
  
  // Single node
  const singleNodeFrame: AtlasFrame = {
    atlas_timestamp: new Date().toISOString(),
    seed_modules: ['single'],
    fold_radius: 0,
    modules: [{ id: 'single', coords: [400, 300] }],
    edges: [],
    critical_rule: 'Test',
  };
  
  const singleSvg = renderAtlasFrameGraph(singleNodeFrame);
  if (!singleSvg.includes('circle')) {
    throw new Error('Single node graph should render a circle');
  }
  
  console.log(`✓ Edge cases handled correctly`);
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('=== Graph Renderer Test Suite ===\n');
  
  // Create output directory
  try {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  } catch (err) {
    // Directory already exists
  }
  
  try {
    await testBasicSVGRendering();
    console.log();
    
    await testForceDirectedLayout();
    console.log();
    
    await testHierarchicalLayout();
    console.log();
    
    await testPNGExport();
    console.log();
    
    await testCustomColors();
    console.log();
    
    await testLargeGraphPerformance();
    console.log();
    
    await testEdgeCases();
    console.log();
    
    console.log('=== All Tests Passed ✓ ===');
    console.log(`\nTest outputs saved to: ${TEST_OUTPUT_DIR}`);
    console.log('Open the SVG and PNG files to visually verify rendering quality.');
  } catch (error) {
    console.error('\n=== Test Failed ✗ ===');
    console.error(error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
runTests();
