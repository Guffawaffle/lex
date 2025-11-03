/**
 * Test suite for memory card rendering
 * Run with: node --loader tsx memory/renderer/card.test.ts
 */

import { renderMemoryCard, renderMemoryCardWithOptions } from './card.js';
import type { Frame } from '../frames/types.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Test output directory
const TEST_OUTPUT_DIR = '/tmp/memory-card-tests';

/**
 * Test helper to create a minimal Frame
 */
function createMinimalFrame(): Frame {
  return {
    id: 'frame-minimal-001',
    timestamp: new Date().toISOString(),
    branch: 'main',
    module_scope: ['memory/renderer'],
    summary_caption: 'Minimal test frame',
    reference_point: 'Basic rendering test',
    status_snapshot: {
      next_action: 'Verify minimal frame renders correctly',
    },
  };
}

/**
 * Test helper to create a full Frame with all optional fields
 */
function createFullFrame(): Frame {
  return {
    id: 'frame-full-002',
    timestamp: new Date().toISOString(),
    branch: 'feature/memory-card-rendering',
    jira: 'LEX-123',
    module_scope: ['memory/renderer', 'memory/frames', 'memory/store'],
    summary_caption: 'Full featured test frame with all optional fields populated to test rendering capabilities',
    reference_point: 'Complete frame with blockers, keywords, and atlas reference',
    status_snapshot: {
      next_action: 'Continue implementing memory card visual rendering with canvas library and ensure all fields are properly displayed',
      blockers: [
        'Canvas library installation pending',
        'Test infrastructure needs setup',
      ],
      merge_blockers: [
        'PR review required',
        'Integration tests failing',
      ],
      tests_failing: [
        'test_memory_card_minimal',
        'test_memory_card_full',
        'test_long_text_handling',
      ],
    },
    keywords: ['memory', 'rendering', 'canvas', 'visual', 'testing', 'frames'],
    atlas_frame_id: 'atlas-frame-xyz789',
    feature_flags: ['enable-visual-rendering'],
    permissions: ['read', 'write'],
  };
}

/**
 * Test helper to create a Frame with very long text
 */
function createLongTextFrame(): Frame {
  return {
    id: 'frame-longtext-003',
    timestamp: new Date().toISOString(),
    branch: 'test/long-text-handling',
    module_scope: ['memory/renderer'],
    summary_caption:
      'This is a very long summary caption that should be truncated or wrapped properly to fit within the card boundaries without overflowing or breaking the layout. It contains many words and should demonstrate text handling capabilities.',
    reference_point:
      'Testing extremely long reference point text that needs to be handled gracefully with either truncation or wrapping mechanisms',
    status_snapshot: {
      next_action:
        'Test the memory card renderer with various edge cases including very long text strings that might exceed the normal display boundaries and need to be wrapped across multiple lines or truncated with ellipsis to maintain readability and visual consistency throughout the rendered card image.',
      blockers: [
        'This is a very long blocker description that should be truncated because it exceeds the maximum allowed length for a single blocker item in the display',
      ],
    },
    keywords: Array(15).fill('keyword').map((k, i) => `${k}${i}`),
  };
}

/**
 * Test 1: Render minimal Frame
 */
async function testMinimalFrame() {
  console.log('Test 1: Rendering minimal Frame...');
  const frame = createMinimalFrame();
  const buffer = await renderMemoryCard(frame);
  
  // Verify buffer is valid
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Output is not a Buffer');
  }
  
  // Check PNG signature
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Output is not a valid PNG');
  }
  
  // Save for manual inspection
  const outputPath = join(TEST_OUTPUT_DIR, 'test-minimal-frame.png');
  writeFileSync(outputPath, buffer);
  
  console.log(`✓ Minimal frame rendered successfully (${buffer.length} bytes)`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 2: Render full Frame with all optional fields
 */
async function testFullFrame() {
  console.log('Test 2: Rendering full Frame...');
  const frame = createFullFrame();
  const buffer = await renderMemoryCard(frame);
  
  // Verify buffer is valid
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Output is not a Buffer');
  }
  
  // Check PNG signature
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Output is not a valid PNG');
  }
  
  // Should be larger than minimal due to more content
  const outputPath = join(TEST_OUTPUT_DIR, 'test-full-frame.png');
  writeFileSync(outputPath, buffer);
  
  console.log(`✓ Full frame rendered successfully (${buffer.length} bytes)`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 3: Handle long text (truncation/wrapping)
 */
async function testLongTextHandling() {
  console.log('Test 3: Testing long text handling...');
  const frame = createLongTextFrame();
  const buffer = await renderMemoryCard(frame);
  
  // Verify buffer is valid
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Output is not a Buffer');
  }
  
  const outputPath = join(TEST_OUTPUT_DIR, 'test-long-text.png');
  writeFileSync(outputPath, buffer);
  
  console.log(`✓ Long text handled successfully (${buffer.length} bytes)`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 4: Render with raw context
 */
async function testRawContext() {
  console.log('Test 4: Testing raw context rendering...');
  const frame = createMinimalFrame();
  const rawContext = `
Recent logs:
[2024-11-02 17:00:00] Starting memory card rendering
[2024-11-02 17:00:01] Canvas initialized
[2024-11-02 17:00:02] Frame data loaded
[2024-11-02 17:00:03] Rendering complete

Recent changes:
+ Added renderMemoryCard function to card.ts
+ Implemented canvas-based image generation
+ Created test suite with 5+ test cases
  `;
  
  const buffer = await renderMemoryCard(frame, rawContext);
  
  // Verify buffer is valid
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Output is not a Buffer');
  }
  
  const outputPath = join(TEST_OUTPUT_DIR, 'test-raw-context.png');
  writeFileSync(outputPath, buffer);
  
  console.log(`✓ Raw context rendered successfully (${buffer.length} bytes)`);
  console.log(`  Saved to: ${outputPath}`);
}

/**
 * Test 5: Verify output is readable at various sizes
 */
async function testReadabilityAtSizes() {
  console.log('Test 5: Testing readability at various sizes...');
  const frame = createFullFrame();
  
  // Test with custom dimensions
  const sizes = [
    { width: 600, height: 800, name: 'small' },
    { width: 800, height: 1000, name: 'medium' },
    { width: 1000, height: 1200, name: 'large' },
  ];
  
  for (const size of sizes) {
    const buffer = await renderMemoryCardWithOptions(frame, {
      dimensions: {
        width: size.width,
        height: size.height,
        padding: 40,
        lineHeight: 24,
      },
    });
    
    const outputPath = join(TEST_OUTPUT_DIR, `test-size-${size.name}.png`);
    writeFileSync(outputPath, buffer);
    
    console.log(`  ✓ ${size.name} size (${size.width}x${size.height}): ${buffer.length} bytes`);
  }
  
  console.log('✓ All size variations rendered successfully');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('=== Memory Card Renderer Test Suite ===\n');
  
  // Create output directory
  try {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  } catch (err) {
    // Directory already exists
  }
  
  try {
    await testMinimalFrame();
    console.log();
    
    await testFullFrame();
    console.log();
    
    await testLongTextHandling();
    console.log();
    
    await testRawContext();
    console.log();
    
    await testReadabilityAtSizes();
    console.log();
    
    console.log('=== All Tests Passed ✓ ===');
    console.log(`\nTest outputs saved to: ${TEST_OUTPUT_DIR}`);
    console.log('Open the PNG files to visually verify rendering quality.');
  } catch (error) {
    console.error('\n=== Test Failed ✗ ===');
    console.error(error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
runTests();
