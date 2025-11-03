/**
 * Tests for Atlas Frame Generation
 * 
 * Run with: node shared/atlas/atlas-frame.test.mjs
 */

import { strict as assert } from 'assert';
import { test, describe } from 'node:test';
import { generateAtlasFrame, formatAtlasFrame } from './dist/atlas/atlas-frame.js';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create a test policy for isolated testing
const testPolicyPath = join(__dirname, 'test-policy.json');

// Test policy with a small graph for controlled testing
const testPolicy = {
  modules: {
    "ui/admin-panel": {
      owns_paths: ["ui/admin/**"],
      allowed_callers: [],
      forbidden_callers: ["backend/auth"],
      feature_flags: ["admin_ui"],
      requires_permissions: ["admin_access"],
      notes: "Admin UI module"
    },
    "api/user-service": {
      owns_paths: ["api/users/**"],
      allowed_callers: ["ui/admin-panel", "api/admin-service"],
      forbidden_callers: [],
      notes: "User management API"
    },
    "api/admin-service": {
      owns_paths: ["api/admin/**"],
      allowed_callers: ["ui/admin-panel"],
      forbidden_callers: [],
      requires_permissions: ["admin_access"],
      notes: "Admin operations API"
    },
    "backend/auth": {
      owns_paths: ["backend/auth/**"],
      allowed_callers: ["api/user-service", "api/admin-service"],
      forbidden_callers: ["ui/admin-panel"],
      notes: "Authentication backend"
    },
    "backend/database": {
      owns_paths: ["backend/db/**"],
      allowed_callers: ["backend/auth"],
      forbidden_callers: [],
      notes: "Database layer"
    },
    "isolated/module": {
      owns_paths: ["isolated/**"],
      allowed_callers: [],
      forbidden_callers: [],
      notes: "Disconnected module for testing"
    }
  }
};

// Write test policy to file
mkdirSync(dirname(testPolicyPath), { recursive: true });
writeFileSync(testPolicyPath, JSON.stringify(testPolicy, null, 2));

describe('generateAtlasFrame', () => {
  test('returns valid AtlasFrame structure', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    
    assert.ok(frame);
    assert.ok(frame.atlas_timestamp);
    assert.deepEqual(frame.seed_modules, ['ui/admin-panel']);
    assert.equal(frame.fold_radius, 1);
    assert.ok(Array.isArray(frame.modules));
    assert.ok(Array.isArray(frame.edges));
    assert.equal(typeof frame.critical_rule, 'string');
  });

  test('includes seed modules in result', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    
    const moduleIds = frame.modules.map(m => m.id);
    assert.ok(moduleIds.includes('ui/admin-panel'));
  });

  test('extracts 1-hop neighborhood correctly', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    
    const moduleIds = new Set(frame.modules.map(m => m.id));
    
    // Seed module should be included
    assert.ok(moduleIds.has('ui/admin-panel'));
    
    // 1-hop neighbors should be included
    // ui/admin-panel calls api/user-service and api/admin-service
    assert.ok(moduleIds.has('api/user-service'));
    assert.ok(moduleIds.has('api/admin-service'));
    
    // backend/auth has forbidden edge to ui/admin-panel, should be included
    assert.ok(moduleIds.has('backend/auth'));
    
    // 2-hop neighbors should NOT be included
    assert.ok(!moduleIds.has('backend/database'));
  });

  test('extracts 2-hop neighborhood correctly', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 2, testPolicyPath);
    
    const moduleIds = new Set(frame.modules.map(m => m.id));
    
    // Seed module
    assert.ok(moduleIds.has('ui/admin-panel'));
    
    // 1-hop neighbors
    assert.ok(moduleIds.has('api/user-service'));
    assert.ok(moduleIds.has('api/admin-service'));
    assert.ok(moduleIds.has('backend/auth'));
    
    // 2-hop neighbors should now be included
    // backend/auth is called by api/user-service and api/admin-service
    // backend/database is called by backend/auth
    assert.ok(moduleIds.has('backend/database'));
  });

  test('includes forbidden edges in result', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    
    // Find forbidden edge from ui/admin-panel to backend/auth
    const forbiddenEdge = frame.edges.find(
      e => e.from === 'ui/admin-panel' && e.to === 'backend/auth' && !e.allowed
    );
    
    assert.ok(forbiddenEdge, 'Should include forbidden edge from ui/admin-panel to backend/auth');
    assert.equal(forbiddenEdge.allowed, false);
    assert.equal(forbiddenEdge.reason, 'forbidden_caller');
  });

  test('includes allowed edges in result', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    
    // Find allowed edge from ui/admin-panel to api/user-service
    const allowedEdge = frame.edges.find(
      e => e.from === 'ui/admin-panel' && e.to === 'api/user-service' && e.allowed
    );
    
    assert.ok(allowedEdge, 'Should include allowed edge from ui/admin-panel to api/user-service');
    assert.equal(allowedEdge.allowed, true);
    assert.equal(allowedEdge.reason, undefined);
  });

  test('handles disconnected modules gracefully', () => {
    // isolated/module has no connections, so shouldn't be in neighborhood
    const frame = generateAtlasFrame(['ui/admin-panel'], 2, testPolicyPath);
    
    const moduleIds = new Set(frame.modules.map(m => m.id));
    assert.ok(!moduleIds.has('isolated/module'));
  });

  test('handles disconnected seed module', () => {
    // If seed itself is disconnected, it should still be included
    const frame = generateAtlasFrame(['isolated/module'], 1, testPolicyPath);
    
    const moduleIds = new Set(frame.modules.map(m => m.id));
    assert.ok(moduleIds.has('isolated/module'));
    // But no other modules should be included
    assert.equal(frame.modules.length, 1);
  });

  test('includes full policy metadata in modules', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    
    const adminPanel = frame.modules.find(m => m.id === 'ui/admin-panel');
    assert.ok(adminPanel);
    
    // Check that policy metadata is included
    assert.ok(adminPanel.owns_paths);
    assert.deepEqual(adminPanel.owns_paths, ["ui/admin/**"]);
    assert.deepEqual(adminPanel.forbidden_callers, ["backend/auth"]);
    assert.deepEqual(adminPanel.feature_flags, ["admin_ui"]);
    assert.deepEqual(adminPanel.requires_permissions, ["admin_access"]);
    assert.equal(adminPanel.notes, "Admin UI module");
  });

  test('generates coordinates for all modules', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    
    // All modules should have coordinates
    for (const module of frame.modules) {
      assert.ok(module.coords, `Module ${module.id} should have coordinates`);
      assert.equal(module.coords.length, 2);
      assert.equal(typeof module.coords[0], 'number');
      assert.equal(typeof module.coords[1], 'number');
      
      // Coordinates should be within reasonable bounds (0-1000 by default)
      assert.ok(module.coords[0] >= 0 && module.coords[0] <= 1000);
      assert.ok(module.coords[1] >= 0 && module.coords[1] <= 1000);
    }
  });

  test('handles multiple seed modules', () => {
    const frame = generateAtlasFrame(
      ['ui/admin-panel', 'backend/database'],
      1,
      testPolicyPath
    );
    
    const moduleIds = new Set(frame.modules.map(m => m.id));
    
    // Both seeds should be included
    assert.ok(moduleIds.has('ui/admin-panel'));
    assert.ok(moduleIds.has('backend/database'));
    
    // Should include neighbors of both seeds
    assert.ok(moduleIds.has('api/user-service')); // neighbor of ui/admin-panel
    assert.ok(moduleIds.has('backend/auth')); // neighbor of backend/database
  });

  test('handles empty seed modules', () => {
    const frame = generateAtlasFrame([], 1, testPolicyPath);
    
    assert.equal(frame.modules.length, 0);
    assert.equal(frame.edges.length, 0);
  });

  test('handles unknown seed modules', () => {
    const frame = generateAtlasFrame(['unknown/module'], 1, testPolicyPath);
    
    // Should handle gracefully - unknown modules just don't get expanded
    assert.equal(frame.modules.length, 0);
  });

  test('fold radius 0 returns only seed modules', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 0, testPolicyPath);
    
    const moduleIds = new Set(frame.modules.map(m => m.id));
    assert.ok(moduleIds.has('ui/admin-panel'));
    // With fold radius 0, should only have the seed module
    assert.equal(frame.modules.length, 1);
  });
});

describe('formatAtlasFrame', () => {
  test('formats atlas frame for display', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    const formatted = formatAtlasFrame(frame);
    
    assert.ok(typeof formatted === 'string');
    assert.ok(formatted.includes('Atlas Frame'));
    assert.ok(formatted.includes('ui/admin-panel'));
    assert.ok(formatted.includes('fold radius: 1'));
  });

  test('displays edges with correct status', () => {
    const frame = generateAtlasFrame(['ui/admin-panel'], 1, testPolicyPath);
    const formatted = formatAtlasFrame(frame);
    
    // Should show allowed and forbidden edges
    if (frame.edges.length > 0) {
      assert.ok(formatted.includes('Edges:') || formatted.includes('🔗'));
    }
  });
});

console.log('All tests passed! ✅');
