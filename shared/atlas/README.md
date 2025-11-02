# Fold Radius & Atlas Frame Export

**Spatial neighborhood extraction from policy graph**

This module computes the "map page" around a set of modules — the minimal policy-aware context needed to understand what's happening in a Frame.

## Problem

When you `/recall` a Frame, you don't want the entire monolith dumped into context. You want:
- The modules you were touching (`module_scope`)
- Their immediate neighbors (1-hop away in the policy graph)
- The policy boundaries between them (allowed/forbidden edges, flags, permissions)

That's **fold radius = 1**.

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
      "coords": [0, 2],
      "allowed_callers": [],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["duplicate_auth_logic"]
    },
    {
      "id": "services/user-access-api",
      "coords": [1, 2],
      "allowed_callers": ["ui/user-admin-panel"],
      "forbidden_callers": []
    },
    {
      "id": "services/auth-core",
      "coords": [2, 1],
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
    }
  ],
  "critical_rule": "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming."
}
```

## Algorithm

1. Start with seed modules from `module_scope`
2. Build adjacency graph from policy (derive allowed/forbidden edges from `allowed_callers` and `forbidden_callers`)
3. Expand N hops (default N=1):
   - For each seed module, find all modules it can call (outbound edges)
   - Find all modules that can call it (inbound edges)
4. Include full policy metadata for all discovered modules
5. Stop (no cascading beyond fold radius)

## Performance

Fold radius 1 typically returns:
- 5-10 modules (~2-5k tokens of context)
- vs. full dependency graph = 100+ modules (50k+ tokens)

This is the token compression that makes policy-aware recall tractable.

## Integration

Called by:
- **`memory/recall`** — when returning a Frame, also export Atlas Frame for `module_scope`
- **`policy/check`** (future) — when showing a violation, export the neighborhood around the offending edge

## Future work

- Cache Atlas Frames by `(module_scope, fold_radius)` key to avoid recomputation
- Support variable fold radius (radius 2 for deeper context, radius 0 for just seed modules)
- Render Atlas Frame as visual graph (SVG/Canvas) for memory card inclusion

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

**Note:** This logic currently lives split across LexMap (adjacency graph generation) and will be consolidated here during the merge.
