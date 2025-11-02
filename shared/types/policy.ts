/**
 * Policy Module Type Definitions
 * 
 * Canonical TypeScript types for architectural policy definitions.
 * The policy file declares architectural boundaries: which modules own which code,
 * which calls are allowed/forbidden, and which flags/permissions gate access.
 * 
 * @see POLICY.md for complete schema documentation
 */

/**
 * Edge type for module relationships in the policy graph.
 * Represents whether a module-to-module relationship is allowed or forbidden.
 * 
 * @example
 * ```typescript
 * // Allowed edge: UI can call the API
 * const allowedEdge: PolicyEdge = {
 *   from: "ui/user-admin-panel",
 *   to: "services/user-access-api",
 *   type: "allowed"
 * };
 * 
 * // Forbidden edge: UI cannot call auth-core directly
 * const forbiddenEdge: PolicyEdge = {
 *   from: "ui/user-admin-panel",
 *   to: "services/auth-core",
 *   type: "forbidden"
 * };
 * ```
 */
export type PolicyEdge = {
  /** Source module ID */
  from: string;
  
  /** Target module ID */
  to: string;
  
  /** Whether this relationship is allowed or forbidden */
  type: 'allowed' | 'forbidden';
};

/**
 * Definition of a single module in the policy file.
 * Each module has a unique ID and defines its ownership, boundaries, and access controls.
 * 
 * @example
 * ```typescript
 * const module: PolicyModule = {
 *   coords: [0, 2],
 *   owns_paths: ["web-ui/userAdmin/**"],
 *   allowed_callers: [],
 *   forbidden_callers: ["services/auth-core"],
 *   feature_flags: ["beta_user_admin"],
 *   requires_permissions: ["can_manage_users"],
 *   kill_patterns: ["duplicate_auth_logic"],
 *   notes: "Migrating from direct auth-core calls to user-access-api"
 * };
 * ```
 */
export interface PolicyModule {
  /** 
   * Glob patterns for files this module owns (e.g., ["web-ui/userAdmin/**"])
   * Note: Either owns_paths or owns_namespaces (or both) should be specified
   * to define what this module owns.
   */
  owns_paths?: string[];
  
  /**
   * Language-specific package/module namespace patterns this module owns
   * (e.g., ["App\\UserAdmin\\*"] for PHP, ["com.example.useradmin.*"] for Java)
   * Note: Either owns_paths or owns_namespaces (or both) should be specified
   * to define what this module owns.
   */
  owns_namespaces?: string[];
  
  /**
   * Exported symbols or APIs that this module exposes to callers
   * (e.g., ["UserAdminService", "CreateUserCommand"])
   */
  exposes?: string[];
  
  /**
   * Spatial coordinates for visual layout [x, y]
   * Used by shared/atlas/ to render Atlas Frames with proper positioning
   */
  coords?: [number, number];
  
  /**
   * Module IDs that are allowed to call this module
   * Empty array [] means no one can call this (e.g., UI components should not be called by backend)
   */
  allowed_callers?: string[];
  
  /**
   * Module IDs explicitly forbidden from calling this module
   * Overrides would-be allowed edges (used for kill patterns / migration enforcement)
   */
  forbidden_callers?: string[];
  
  /**
   * Feature flags that gate access to this module
   * Example: ["beta_user_admin"] means this module is only accessible when that flag is on
   */
  feature_flags?: string[];
  
  /**
   * Permissions required to use this module
   * Example: ["can_manage_users"] means caller must have that permission
   */
  requires_permissions?: string[];
  
  /**
   * Anti-patterns being removed from this module
   * Example: ["duplicate_auth_logic"] signals "we're actively removing this pattern, don't add more"
   */
  kill_patterns?: string[];
  
  /**
   * Human-readable context or migration plan
   */
  notes?: string;
}

/**
 * Top-level policy container with module definitions.
 * Maps module IDs to their policy definitions.
 * 
 * @example
 * ```typescript
 * const policy: Policy = {
 *   modules: {
 *     "ui/user-admin-panel": {
 *       coords: [0, 2],
 *       owns_paths: ["web-ui/userAdmin/**"],
 *       allowed_callers: [],
 *       forbidden_callers: ["services/auth-core"],
 *       feature_flags: ["beta_user_admin"],
 *       requires_permissions: ["can_manage_users"]
 *     },
 *     "services/user-access-api": {
 *       coords: [1, 2],
 *       owns_paths: ["services/userAccess/**"],
 *       allowed_callers: ["ui/user-admin-panel"],
 *       feature_flags: ["beta_user_admin"]
 *     },
 *     "services/auth-core": {
 *       coords: [2, 1],
 *       owns_paths: ["services/auth/**"],
 *       allowed_callers: ["services/user-access-api"],
 *       forbidden_callers: ["ui/user-admin-panel"]
 *     }
 *   },
 *   global_kill_patterns: [
 *     {
 *       pattern: "duplicate_auth_logic",
 *       description: "Remove duplicate authentication logic across modules"
 *     }
 *   ]
 * };
 * ```
 */
export interface Policy {
  /** Map of module ID to module definition */
  modules: Record<string, PolicyModule>;
  
  /**
   * Global anti-patterns that apply across all modules
   * Used to enforce organization-wide code quality standards
   */
  global_kill_patterns?: Array<{
    /** Pattern identifier */
    pattern: string;
    
    /** Human-readable description of the pattern and why it's being removed */
    description: string;
  }>;
}

/**
 * Validates that an unknown value conforms to the PolicyModule interface.
 * 
 * @param module - The value to validate
 * @returns True if the value is a valid PolicyModule, false otherwise
 * 
 * @example
 * ```typescript
 * const data: unknown = JSON.parse(moduleJson);
 * if (validatePolicyModule(data)) {
 *   // data is now typed as PolicyModule
 *   console.log(data.owns_paths);
 * }
 * ```
 */
export function validatePolicyModule(module: unknown): module is PolicyModule {
  if (typeof module !== 'object' || module === null) {
    return false;
  }
  
  const m = module as Record<string, unknown>;
  
  // Check optional array fields
  if (m.owns_paths !== undefined) {
    if (!Array.isArray(m.owns_paths)) return false;
    if (!m.owns_paths.every((p: unknown) => typeof p === 'string')) return false;
  }
  
  if (m.owns_namespaces !== undefined) {
    if (!Array.isArray(m.owns_namespaces)) return false;
    if (!m.owns_namespaces.every((n: unknown) => typeof n === 'string')) return false;
  }
  
  if (m.exposes !== undefined) {
    if (!Array.isArray(m.exposes)) return false;
    if (!m.exposes.every((e: unknown) => typeof e === 'string')) return false;
  }
  
  if (m.coords !== undefined) {
    if (!Array.isArray(m.coords)) return false;
    if (m.coords.length !== 2) return false;
    if (typeof m.coords[0] !== 'number' || typeof m.coords[1] !== 'number') return false;
  }
  
  if (m.allowed_callers !== undefined) {
    if (!Array.isArray(m.allowed_callers)) return false;
    if (!m.allowed_callers.every((c: unknown) => typeof c === 'string')) return false;
  }
  
  if (m.forbidden_callers !== undefined) {
    if (!Array.isArray(m.forbidden_callers)) return false;
    if (!m.forbidden_callers.every((c: unknown) => typeof c === 'string')) return false;
  }
  
  if (m.feature_flags !== undefined) {
    if (!Array.isArray(m.feature_flags)) return false;
    if (!m.feature_flags.every((f: unknown) => typeof f === 'string')) return false;
  }
  
  if (m.requires_permissions !== undefined) {
    if (!Array.isArray(m.requires_permissions)) return false;
    if (!m.requires_permissions.every((p: unknown) => typeof p === 'string')) return false;
  }
  
  if (m.kill_patterns !== undefined) {
    if (!Array.isArray(m.kill_patterns)) return false;
    if (!m.kill_patterns.every((k: unknown) => typeof k === 'string')) return false;
  }
  
  if (m.notes !== undefined && typeof m.notes !== 'string') {
    return false;
  }
  
  return true;
}
