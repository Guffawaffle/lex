# Fold Radius & Atlas Frame Export

**Spatial neighborhood extraction from policy graph**

This module computes the "map page" around a set of modules — the minimal policy-aware context needed to understand what's happening in a Frame.

## Problem

When you `/recall` a Frame, you don't want the entire monolith dumped into context. You want:
- The modules you were touching (`module_scope`)
- Their immediate neighbors (1-hop away in the policy graph)
- The policy boundaries between them (allowed/forbidden edges, flags, permissions)

That's **fold radius = 1**.

## Implementation

### Core Functions

#### `generateAtlasFrame(seedModules, foldRadius, policyPath?)`
Main entry point for generating an Atlas Frame. Loads the policy graph, performs BFS traversal to extract the N-hop neighborhood, generates coordinates, and returns a complete Atlas Frame with modules and edges.

**Parameters:**
- `seedModules: string[]` - Module IDs from Frame.module_scope  
- `foldRadius: number` - How many hops to expand (default: 1)
- `policyPath?: string` - Optional custom policy file path

**Returns:** `AtlasFrame` object with:
- `atlas_timestamp` - ISO timestamp of generation
- `seed_modules` - Input seed modules
- `fold_radius` - Expansion radius used
- `modules` - Array of `AtlasModule` objects with full policy metadata
- `edges` - Array of `AtlasEdge` objects (allowed + forbidden)
- `critical_rule` - Policy validation rule

#### Graph Algorithms (`graph.ts`)

**`buildAdjacencyLists(policy)`**
Constructs adjacency lists from the policy graph by parsing `allowed_callers` and `forbidden_callers` fields. Returns separate maps for allowed and forbidden edges.

**`extractNeighborhood(policy, seedModules, foldRadius)`**
Performs breadth-first search (BFS) traversal starting from seed modules, expanding up to N hops. Traverses both allowed and forbidden edges to discover modules with policy relationships. Returns a set of discovered modules and all edges between them.

**Algorithm:**
1. Start with seed modules at distance 0
2. For each module at distance d < foldRadius:
   - Find neighbors via allowed edges (inbound & outbound)
   - Find neighbors via forbidden edges (inbound & outbound)
   - Mark neighbors at distance d+1
3. Collect all edges (allowed + forbidden) between discovered modules
4. Return neighborhood

**`generateCoordinates(modules, edges, width?, height?, iterations?)`**
Implements a force-directed graph layout algorithm to assign 2D coordinates to modules for visualization. Uses spring-embedding with repulsion forces between all nodes and attraction forces along allowed edges.

**Parameters:**
- `modules: Set<string>` - Module IDs to position
- `edges: GraphEdge[]` - Edges between modules
- `width?: number` - Canvas width (default: 1000)
- `height?: number` - Canvas height (default: 1000)
- `iterations?: number` - Layout iterations (default: 50)

**Returns:** `Map<string, [number, number]>` - Coordinates for each module

## Input

- **`module_scope`** (array of strings): Seed modules from a Frame (e.g., `["ui/user-admin-panel"]`)
- **`fold_radius`** (number, default 1): How many hops to expand from seed modules
- **`policy`** (object): The full `lexmap.policy.json` loaded in memory

## Output: Atlas Frame

```json
{
  "atlas_timestamp": "2025-11-01T23:17:00-05:00",
  "seed_modules": ["ui/user-admin-panel"],
  "fold_radius": 1,
  "modules": [
    {
      "id": "ui/user-admin-panel",
      "coords": [342, 567],
      "owns_paths": ["ui/admin/**"],
      "allowed_callers": [],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["duplicate_auth_logic"],
      "notes": "Migrating from direct auth-core calls to user-access-api"
    },
    {
      "id": "services/user-access-api",
      "coords": [521, 589],
      "owns_paths": ["services/userAccess/**"],
      "allowed_callers": ["ui/user-admin-panel"],
      "feature_flags": ["beta_user_admin"]
    },
    {
      "id": "services/auth-core",
      "coords": [678, 423],
      "owns_paths": ["services/auth/**"],
      "allowed_callers": ["services/user-access-api"],
      "forbidden_callers": ["ui/user-admin-panel"]
    }
  ],
  "edges": [
    {
      "from": "ui/user-admin-panel",
      "to": "services/user-access-api",
      "allowed": true
    },
    {
      "from": "ui/user-admin-panel",
      "to": "services/auth-core",
      "allowed": false,
      "reason": "forbidden_caller"
    },
    {
      "from": "services/user-access-api",
      "to": "services/auth-core",
      "allowed": true
    }
  ],
  "critical_rule": "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming."
}
```

## Edge Semantics

Edges are derived from `allowed_callers` and `forbidden_callers` in the policy:

- **`allowed_callers`** on module X: Creates allowed edges FROM each caller TO X
- **`forbidden_callers`** on module X: Creates forbidden edges FROM each caller TO X

Both allowed and forbidden edges are included in the neighborhood because forbidden edges provide important context about architectural boundaries and migration plans.

## Performance

Fold radius 1 typically returns:
- 5-10 modules (~2-5k tokens of context)
- vs. full dependency graph = 100+ modules (50k+ tokens)

This is the token compression that makes policy-aware recall tractable.

### Performance Characteristics

- **Time Complexity**: O(V + E) where V is modules and E is edges (BFS traversal)
- **Space Complexity**: O(V + E) for storing discovered modules and edges
- **Coordinate Generation**: O(V² × I) where I is iterations (force-directed layout)

Tested with 100+ module policies, performs acceptably (< 1 second for typical queries).

## Integration

Called by:
- **`memory/mcp_server`** — when returning a Frame via `/recall`, also exports Atlas Frame for `module_scope`
- **`policy/check`** (future) — when showing a violation, export the neighborhood around the offending edge

## Testing

Run tests with:
```bash
cd shared/atlas
node atlas-frame.test.mjs
```

Test coverage includes:
- ✅ 1-hop and 2-hop neighborhood extraction
- ✅ Forbidden edge inclusion for policy context
- ✅ Disconnected module handling
- ✅ Coordinate generation for visualization
- ✅ Multiple seed modules
- ✅ Edge cases (empty seeds, unknown modules, fold radius 0)
- ✅ Full policy metadata inclusion
- ✅ Large graph performance

All 16 tests passing.

## Future work

- Cache Atlas Frames by `(module_scope, fold_radius)` key to avoid recomputation
- Support variable fold radius (radius 2 for deeper context, radius 0 for just seed modules)
- Render Atlas Frame as visual graph (SVG/Canvas) for memory card inclusion
- Optimize coordinate generation for very large graphs (> 100 modules)
- Support different layout algorithms (hierarchical, circular, etc.)

## Usage

```typescript
import { computeFoldRadius, Policy } from './shared/atlas/index.js';

// Load your policy
const policy: Policy = {
  modules: {
    "ui/user-admin-panel": {
      coords: [0, 2],
      allowed_callers: [],
      forbidden_callers: ["services/auth-core"],
      feature_flags: ["beta_user_admin"],
      requires_permissions: ["can_manage_users"],
    },
    "services/user-access-api": {
      coords: [1, 2],
      allowed_callers: ["ui/user-admin-panel"],
    },
    // ... more modules
  },
};

// Compute fold radius
const atlasFrame = computeFoldRadius(
  ["ui/user-admin-panel"],  // seed modules
  1,                         // fold radius
  policy
);

// Use the result
console.log(`Found ${atlasFrame.modules.length} modules in neighborhood`);
console.log(`With ${atlasFrame.edges.length} edges`);
```

See `demo.ts` for more examples.

---

**Status:** ✅ **Fully Implemented** (as of PR #31)

The fold radius algorithm is now complete with full policy graph traversal, coordinate generation, and comprehensive test coverage.
