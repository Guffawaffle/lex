# Policy Module Schema

**Canonical structure for modules in `lexmap.policy.json`**

The policy file declares architectural boundaries: which modules own which code, which calls are allowed/forbidden, and which flags/permissions gate access.

## Module definition

Each module has a unique ID (e.g., `"ui/user-admin-panel"`, `"services/auth-core"`) and the following fields:

### Required fields

- **`owns_paths`** (array of strings): Glob patterns for files this module owns (e.g., `["web-ui/userAdmin/**"]`)
  - Can also use `owns_namespaces` for language-specific package/module names

### Optional fields (policy boundaries)

- **`coords`** (array of 2 numbers): Spatial coordinates for visual layout (e.g., `[0, 2]`)
  - Used by `shared/atlas/` to render Atlas Frames with proper positioning

- **`allowed_callers`** (array of strings): Module IDs that are allowed to call this module
  - Empty array `[]` means no one can call this (e.g., UI components should not be called by backend)

- **`forbidden_callers`** (array of strings): Module IDs explicitly forbidden from calling this
  - Overrides would-be allowed edges (used for kill patterns / migration enforcement)

- **`feature_flags`** (array of strings): Feature flags that gate access to this module
  - Example: `["beta_user_admin"]` means this module is only accessible when that flag is on

- **`requires_permissions`** (array of strings): Permissions required to use this module
  - Example: `["can_manage_users"]` means caller must have that permission

- **`kill_patterns`** (array of strings): Anti-patterns being removed from this module
  - Example: `["duplicate_auth_logic"]` signals "we're actively removing this pattern, don't add more"

- **`notes`** (string): Human-readable context or migration plan

## Example

```json
{
  "modules": {
    "ui/user-admin-panel": {
      "coords": [0, 2],
      "owns_paths": ["web-ui/userAdmin/**"],
      "allowed_callers": [],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["duplicate_auth_logic"],
      "notes": "Migrating from direct auth-core calls to user-access-api"
    },
    "services/user-access-api": {
      "coords": [1, 2],
      "owns_paths": ["services/userAccess/**"],
      "allowed_callers": ["ui/user-admin-panel"],
      "forbidden_callers": [],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"]
    },
    "services/auth-core": {
      "coords": [2, 1],
      "owns_paths": ["services/auth/**"],
      "allowed_callers": ["services/user-access-api"],
      "forbidden_callers": ["ui/user-admin-panel"],
      "notes": "Only accessible via approved API layer"
    }
  }
}
```

## Validation

Policy files are validated by `policy/check/` before enforcement:
- Module IDs must be unique
- `coords` must be `[number, number]` if provided
- Glob patterns in `owns_paths` must be valid
- Circular dependencies in `allowed_callers` are permitted (bidirectional communication is valid)

## Integration with Frames

When a Frame's `module_scope` references a module (e.g., `"ui/user-admin-panel"`), that ID must exist in the policy file. This is THE CRITICAL RULE, enforced by `shared/module_ids/`.

---

**Used by:**
- `policy/check/` — compares scanner output to this contract
- `shared/atlas/` — exports fold-radius neighborhoods using `coords` and caller relationships
- `memory/recall` — validates Frame `module_scope` against this vocabulary
