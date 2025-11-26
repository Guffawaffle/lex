# Code Atlas Examples

Practical examples for using Code Atlas in various scenarios.

---

## Table of Contents

1. [Extract Local Repository](#1-extract-local-repository)
2. [Ingest via HTTP API](#2-ingest-via-http-api)
3. [Query Code Units](#3-query-code-units)
4. [Generate Atlas Frame](#4-generate-atlas-frame)
5. [Policy-Aware Recall](#5-policy-aware-recall)
6. [Auto-Tune Token Limits](#6-auto-tune-token-limits)
7. [Integration with LexRunner](#7-integration-with-lexrunner)

---

## 1. Extract Local Repository

### Basic Extraction with CLI

```bash
# Capture work session with modules
lex remember \
  --reference-point "implementing auth middleware" \
  --summary "Added JWT validation to API routes" \
  --next "Add refresh token support" \
  --modules "services/auth,api/middleware" \
  --jira "AUTH-123"

# Output:
# ✔ Frame created successfully!
#   Frame ID: frame-1732634400-abc123
#   Reference: implementing auth middleware
#   Modules: services/auth, api/middleware
```

### Programmatic Extraction

```typescript
import { saveFrame, getDb, closeDb } from '@smartergpt/lex';

const db = getDb();

await saveFrame(db, {
  referencePoint: 'implementing auth middleware',
  summaryCaption: 'Added JWT validation to API routes',
  statusSnapshot: { 
    nextAction: 'Add refresh token support',
    blockers: []
  },
  moduleScope: ['services/auth', 'api/middleware'],
  branch: 'feature/auth',
  jira: 'AUTH-123'
});

closeDb(db);
```

---

## 2. Ingest via HTTP API

### Using curl

```bash
# Create a Frame via HTTP API
curl -X POST http://localhost:3000/api/frames \
  -H "Authorization: Bearer $LEX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "reference_point": "implementing auth middleware",
    "summary_caption": "Added JWT validation to API routes",
    "module_scope": ["services/auth", "api/middleware"],
    "status_snapshot": {
      "next_action": "Add refresh token support",
      "blockers": []
    },
    "jira": "AUTH-123"
  }'

# Response:
# {"id":"frame-1732634400-abc123","status":"created"}
```

### Using JavaScript/TypeScript

```typescript
async function ingestFrame(frame: object): Promise<string> {
  const response = await fetch('http://localhost:3000/api/frames', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LEX_API_KEY}`,
    },
    body: JSON.stringify(frame),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Ingestion failed: ${error.message}`);
  }

  const result = await response.json();
  return result.id;
}

// Usage
const frameId = await ingestFrame({
  reference_point: 'implementing auth middleware',
  summary_caption: 'Added JWT validation to API routes',
  module_scope: ['services/auth', 'api/middleware'],
  status_snapshot: {
    next_action: 'Add refresh token support',
  },
});

console.log(`Created frame: ${frameId}`);
```

### Using Python

```python
import os
import requests

def ingest_frame(frame: dict) -> str:
    """Ingest a frame via HTTP API."""
    response = requests.post(
        'http://localhost:3000/api/frames',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {os.environ["LEX_API_KEY"]}',
        },
        json=frame,
    )
    response.raise_for_status()
    return response.json()['id']

# Usage
frame_id = ingest_frame({
    'reference_point': 'implementing auth middleware',
    'summary_caption': 'Added JWT validation to API routes',
    'module_scope': ['services/auth', 'api/middleware'],
    'status_snapshot': {
        'next_action': 'Add refresh token support',
    },
})

print(f'Created frame: {frame_id}')
```

---

## 3. Query Code Units

### Validate CodeUnit Objects

```typescript
import { parseCodeUnit, validateCodeUnit } from '@smartergpt/lex/atlas';

// Parse and validate (throws on error)
const codeUnit = parseCodeUnit({
  id: 'sha256:a1b2c3',
  repoId: 'github.com/example/project',
  filePath: 'src/auth/validator.ts',
  language: 'ts',
  kind: 'class',
  symbolPath: 'src/auth/validator.ts::JWTValidator',
  name: 'JWTValidator',
  span: { startLine: 15, endLine: 87 },
  discoveredAt: new Date().toISOString(),
  schemaVersion: 'code-unit-v0'
});

console.log(`Parsed: ${codeUnit.name} (${codeUnit.kind})`);

// Safe validation (returns result object)
const result = validateCodeUnit(rawData);
if (result.success) {
  console.log('Valid code unit:', result.data.name);
} else {
  console.error('Validation errors:');
  result.error.issues.forEach(issue => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
}
```

### Query Frames by Module

```bash
# List frames containing a specific module
lex frames list --module "services/auth" --limit 10

# Using MCP
echo '{
  "method": "tools/call",
  "params": {
    "name": "lex.list_frames",
    "arguments": {
      "module": "services/auth",
      "limit": 10
    }
  }
}' | node dist/memory/mcp_server/frame-mcp.js
```

---

## 4. Generate Atlas Frame

### Basic Generation

```typescript
import { generateAtlasFrame } from '@smartergpt/lex/shared/atlas';

// Generate Atlas Frame with 1-hop radius
const atlasFrame = generateAtlasFrame(
  ['ui/user-admin-panel'],  // seed modules
  1                          // fold radius
);

console.log(`Timestamp: ${atlasFrame.atlas_timestamp}`);
console.log(`Seed modules: ${atlasFrame.seed_modules.join(', ')}`);
console.log(`Total modules: ${atlasFrame.modules.length}`);
console.log(`Total edges: ${atlasFrame.edges.length}`);

// Inspect modules
atlasFrame.modules.forEach(mod => {
  console.log(`  ${mod.id}:`);
  if (mod.allowed_callers?.length) {
    console.log(`    Allowed callers: ${mod.allowed_callers.join(', ')}`);
  }
  if (mod.forbidden_callers?.length) {
    console.log(`    Forbidden callers: ${mod.forbidden_callers.join(', ')}`);
  }
});

// Inspect edges
atlasFrame.edges.forEach(edge => {
  const status = edge.allowed ? '✅' : '🚫';
  console.log(`  ${edge.from} → ${edge.to} [${status}]`);
});
```

### With Custom Policy Path

```typescript
import { generateAtlasFrame } from '@smartergpt/lex/shared/atlas';

const atlasFrame = generateAtlasFrame(
  ['services/payment'],
  2,  // 2-hop radius for deeper context
  '/path/to/custom/lexmap.policy.json'
);
```

### JSON Output

```typescript
import { generateAtlasFrame } from '@smartergpt/lex/shared/atlas';

const atlasFrame = generateAtlasFrame(['services/auth'], 1);

// Pretty-print JSON
console.log(JSON.stringify(atlasFrame, null, 2));

// Output:
// {
//   "atlas_timestamp": "2025-11-26T14:30:00.000Z",
//   "seed_modules": ["services/auth"],
//   "fold_radius": 1,
//   "modules": [...],
//   "edges": [...],
//   "critical_rule": "Every module name MUST match the IDs in lexmap.policy.json."
// }
```

---

## 5. Policy-Aware Recall

### CLI Recall with Atlas Context

```bash
# Basic recall (1-hop radius by default)
lex recall "auth middleware"

# Output includes Atlas Frame:
# 📌 Found 1 frame matching 'auth middleware'
# 
# Reference: implementing auth middleware
# Summary: Added JWT validation to API routes
# Next: Add refresh token support
# Modules: services/auth, api/middleware
# 
# 📊 Atlas Frame (fold radius: 1)
# 🌱 Seed modules: services/auth, api/middleware
# 📦 Total modules in neighborhood: 4
# 
# 🔗 Edges:
#   services/auth → lib/crypto [✅ Allowed]
#   api/middleware → services/auth [✅ Allowed]
#   api/middleware → services/database [🚫 Forbidden] - forbidden_caller
```

### Recall with Custom Radius

```bash
# Expand to 2-hop neighborhood
lex recall "auth" --fold-radius 2

# Show cache statistics
lex recall "auth" --cache-stats
```

### Programmatic Recall

```typescript
import { searchFrames, getDb, closeDb } from '@smartergpt/lex';
import { generateAtlasFrame } from '@smartergpt/lex/shared/atlas';

const db = getDb();

// Search for frames
const frames = await searchFrames(db, { 
  referencePoint: 'auth middleware' 
});

if (frames.length > 0) {
  const frame = frames[0];
  
  // Generate Atlas Frame for the recalled frame
  const atlasFrame = generateAtlasFrame(
    frame.moduleScope,
    1  // fold radius
  );
  
  console.log('Recalled frame:', frame.referencePoint);
  console.log('Atlas neighborhood:', atlasFrame.modules.map(m => m.id));
  
  // Check for forbidden edges
  const forbidden = atlasFrame.edges.filter(e => !e.allowed);
  if (forbidden.length > 0) {
    console.log('⚠️ Forbidden edges detected:');
    forbidden.forEach(e => {
      console.log(`  ${e.from} → ${e.to} (${e.reason})`);
    });
  }
}

closeDb(db);
```

---

## 6. Auto-Tune Token Limits

### CLI Auto-Tune

```bash
# Auto-tune radius to fit 5000 tokens
lex recall "auth" --auto-radius --max-tokens 5000

# Combine with initial radius (starts from 3, reduces as needed)
lex recall "auth" --fold-radius 3 --auto-radius --max-tokens 3000
```

### Programmatic Auto-Tune

```typescript
import { autoTuneRadius, generateAtlasFrame, estimateTokens } from '@smartergpt/lex/shared/atlas';

// Auto-tune with callback for logging
const result = autoTuneRadius(
  (radius) => generateAtlasFrame(['services/auth'], radius),
  3,      // requested radius
  5000,   // max tokens
  (oldRadius, newRadius, tokens, limit) => {
    console.log(`Reduced radius ${oldRadius} → ${newRadius} (${tokens} tokens > ${limit} limit)`);
  }
);

console.log(`Final radius: ${result.radiusUsed}`);
console.log(`Tokens used: ${result.tokensUsed}`);
console.log(`Atlas Frame:`, result.atlasFrame);

// Manual token estimation
const frame = generateAtlasFrame(['services/auth'], 2);
const tokens = estimateTokens(frame);
console.log(`Estimated tokens: ${tokens}`);
```

### Token Estimation

```typescript
import { estimateTokens, estimateTokensBeforeGeneration } from '@smartergpt/lex/shared/atlas';

// Estimate before generating (fast, heuristic-based)
const estimatedTokens = estimateTokensBeforeGeneration(
  ['services/auth', 'api/middleware'],
  2,  // radius
  '/path/to/lexmap.policy.json'
);
console.log(`Estimated tokens (pre-generation): ${estimatedTokens}`);

// Estimate from actual frame (accurate)
const atlasFrame = generateAtlasFrame(['services/auth'], 2);
const actualTokens = estimateTokens(atlasFrame);
console.log(`Actual tokens: ${actualTokens}`);
```

---

## 7. Integration with LexRunner

### Merge Conflict Resolution

```typescript
import { generateAtlasFrame } from '@smartergpt/lex/shared/atlas';

interface ConflictContext {
  file: string;
  modules: string[];
}

async function analyzeConflict(conflict: ConflictContext) {
  // Generate Atlas Frame for conflicting modules
  const atlasFrame = generateAtlasFrame(conflict.modules, 1);
  
  // Check for policy violations
  const forbiddenEdges = atlasFrame.edges.filter(e => !e.allowed);
  
  if (forbiddenEdges.length > 0) {
    console.log('⚠️ Conflict involves forbidden dependencies:');
    forbiddenEdges.forEach(edge => {
      console.log(`  ${edge.from} cannot call ${edge.to}`);
      console.log(`  Reason: ${edge.reason}`);
    });
    
    // Suggest alternative resolution
    const allowedPaths = atlasFrame.edges
      .filter(e => e.allowed)
      .map(e => `${e.from} → ${e.to}`);
    console.log('Allowed paths:', allowedPaths);
  }
  
  return {
    atlasFrame,
    hasPolicyViolations: forbiddenEdges.length > 0,
    forbiddenEdges,
  };
}

// Usage in LexRunner
const result = await analyzeConflict({
  file: 'src/auth/handler.ts',
  modules: ['services/auth', 'ui/admin-panel'],
});
```

### Task Distribution

```typescript
import { generateAtlasFrame, getCacheStats } from '@smartergpt/lex/shared/atlas';

interface Task {
  id: string;
  modules: string[];
  description: string;
}

function planTasks(tasks: Task[]) {
  const taskContexts = tasks.map(task => {
    const atlasFrame = generateAtlasFrame(task.modules, 1);
    
    return {
      ...task,
      atlasFrame,
      neighborModules: atlasFrame.modules.map(m => m.id),
      edgeCount: atlasFrame.edges.length,
      hasForbiddenEdges: atlasFrame.edges.some(e => !e.allowed),
    };
  });
  
  // Log cache efficiency
  const stats = getCacheStats();
  console.log(`Cache stats: ${stats.hits} hits, ${stats.misses} misses`);
  
  return taskContexts;
}
```

### Batch Processing

```typescript
import { 
  generateAtlasFrame, 
  setEnableCache, 
  resetCache 
} from '@smartergpt/lex/shared/atlas';

async function batchProcessModules(moduleGroups: string[][]) {
  // Enable caching for batch efficiency
  setEnableCache(true);
  resetCache();  // Start fresh
  
  const results = moduleGroups.map(modules => {
    return generateAtlasFrame(modules, 1);
  });
  
  // Many queries will hit cache if module overlap exists
  const stats = getCacheStats();
  console.log(`Batch complete: ${stats.hits} cache hits, ${stats.misses} misses`);
  
  return results;
}
```

---

## Complete Working Example

### Full Workflow: Capture → Recall → Analyze

```typescript
import { saveFrame, searchFrames, getDb, closeDb } from '@smartergpt/lex';
import { generateAtlasFrame, autoTuneRadius } from '@smartergpt/lex/shared/atlas';

async function completeWorkflow() {
  const db = getDb();
  
  try {
    // 1. Capture work session
    const frameId = await saveFrame(db, {
      referencePoint: 'implementing payment webhook',
      summaryCaption: 'Added Stripe webhook handler with signature verification',
      statusSnapshot: {
        nextAction: 'Add retry logic for failed events',
        blockers: ['Need Stripe test mode credentials'],
      },
      moduleScope: ['services/payment', 'api/webhooks'],
      branch: 'feature/stripe-webhooks',
      jira: 'PAY-789',
    });
    
    console.log(`✅ Frame captured: ${frameId}`);
    
    // 2. Recall with Atlas context
    const frames = await searchFrames(db, {
      referencePoint: 'payment webhook',
    });
    
    if (frames.length > 0) {
      const frame = frames[0];
      
      // 3. Generate auto-tuned Atlas Frame
      const result = autoTuneRadius(
        (r) => generateAtlasFrame(frame.moduleScope, r),
        2,     // Start with radius 2
        3000   // Fit in 3000 tokens
      );
      
      console.log(`\n📊 Atlas Frame (radius: ${result.radiusUsed})`);
      console.log(`   Tokens: ${result.tokensUsed}`);
      console.log(`   Modules: ${result.atlasFrame.modules.length}`);
      console.log(`   Edges: ${result.atlasFrame.edges.length}`);
      
      // 4. Check for policy issues
      const forbidden = result.atlasFrame.edges.filter(e => !e.allowed);
      if (forbidden.length > 0) {
        console.log('\n⚠️ Forbidden edges detected:');
        forbidden.forEach(e => {
          console.log(`   ${e.from} → ${e.to}`);
        });
      } else {
        console.log('\n✅ No policy violations in neighborhood');
      }
    }
  } finally {
    closeDb(db);
  }
}

completeWorkflow().catch(console.error);
```

---

## See Also

- [Quick Start](./README.md) — Get started with Code Atlas
- [Full Specification](./code-atlas-v0.md) — Schema and algorithm details
- [API Reference](./api-reference.md) — Endpoint documentation
- [CLI Reference](../CLI_OUTPUT.md) — Command-line options
