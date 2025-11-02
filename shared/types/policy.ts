/**
 * TypeScript types for Policy schema (lexmap.policy.json)
 * 
 * These types represent the canonical architectural truth from policy files.
 * Used for module ID validation and Frame integration.
 */

export interface PolicyModule {
  description?: string;
  owns_namespaces?: string[];
  owns_paths?: string[];
  exposes?: string[];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
  notes?: string;
  coords?: [number, number];
}

export interface Policy {
  modules: Record<string, PolicyModule>;
  global_kill_patterns?: Array<{
    pattern: string;
    description: string;
  }>;
}
