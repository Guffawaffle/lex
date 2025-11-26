/**
 * Policy Schema Validation using Zod
 *
 * Provides strict schema validation for lexmap.policy.json files.
 * Used by `lex policy check` command to validate policy syntax.
 */

import { z } from "zod";

/**
 * Module ID pattern: lowercase letters, numbers, underscores, hyphens, and forward slashes
 */
const moduleIdPattern = /^[a-z0-9/_-]+$/;

/**
 * Zod schema for a single policy module
 */
export const PolicyModuleSchema = z.object({
  /** Human-readable description of module purpose */
  description: z.string().optional(),

  /** Glob patterns for files this module owns */
  owns_paths: z.array(z.string()).optional(),

  /** Namespace prefixes owned by this module */
  owns_namespaces: z.array(z.string()).optional(),

  /** Public interfaces/classes/functions this module exposes */
  exposes: z.array(z.string()).optional(),

  /** Spatial coordinates for visual layout [x, y] */
  coords: z.tuple([z.number(), z.number()]).optional(),

  /** Module IDs permitted to depend on this module */
  allowed_callers: z.array(z.string()).optional(),

  /** Module IDs explicitly forbidden from depending on this module */
  forbidden_callers: z.array(z.string()).optional(),

  /** Feature flags that gate behavior in this module */
  feature_flags: z.array(z.string()).optional(),

  /** Permission strings required to access this module's functionality */
  requires_permissions: z.array(z.string()).optional(),

  /** Anti-patterns specific to this module that must be eliminated */
  kill_patterns: z.array(z.string()).optional(),

  /** Additional architectural guidance or historical context */
  notes: z.string().optional(),

  /** Match patterns for the module (alternative to owns_paths) */
  match: z.array(z.string()).optional(),
});

/**
 * Zod schema for global kill patterns
 */
export const GlobalKillPatternSchema = z.union([
  z.object({
    pattern: z.string(),
    description: z.string(),
  }),
  z.string(),
]);

/**
 * Zod schema for the complete policy file
 */
export const PolicySchema = z.object({
  /** Schema version for migration support */
  schemaVersion: z.string().optional(),

  /** Map of module_id -> module definition */
  modules: z.record(
    z.string().regex(moduleIdPattern, {
      message: `Invalid module ID format. Must match pattern: ${moduleIdPattern}`,
    }),
    PolicyModuleSchema
  ),

  /** Repository-wide anti-patterns */
  global_kill_patterns: z.array(GlobalKillPatternSchema).optional(),
});

export type PolicyModuleSchemaType = z.infer<typeof PolicyModuleSchema>;
export type PolicySchemaType = z.infer<typeof PolicySchema>;

/**
 * Validation result interface
 */
export interface PolicyValidationResult {
  valid: boolean;
  moduleCount: number;
  errors: PolicyValidationError[];
  warnings: PolicyValidationWarning[];
}

/**
 * Validation error interface
 */
export interface PolicyValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Validation warning interface
 */
export interface PolicyValidationWarning {
  path: string;
  message: string;
  code: string;
}

/**
 * Validate a policy object against the schema
 *
 * @param policy - The policy object to validate
 * @returns Validation result with errors and warnings
 */
export function validatePolicySchema(policy: unknown): PolicyValidationResult {
  const errors: PolicyValidationError[] = [];
  const warnings: PolicyValidationWarning[] = [];

  // Parse with Zod
  const result = PolicySchema.safeParse(policy);

  if (!result.success) {
    // Convert Zod errors to our format
    for (const issue of result.error.issues) {
      errors.push({
        path: issue.path.join(".") || "root",
        message: issue.message,
        code: issue.code,
      });
    }

    return {
      valid: false,
      moduleCount: 0,
      errors,
      warnings,
    };
  }

  const validPolicy = result.data;
  const moduleCount = Object.keys(validPolicy.modules).length;

  // Additional semantic validations (warnings)

  // Check for modules without ownership definition
  for (const [moduleId, module] of Object.entries(validPolicy.modules)) {
    if (!module.owns_paths && !module.owns_namespaces && !module.match) {
      warnings.push({
        path: `modules.${moduleId}`,
        message: `Module "${moduleId}" has no ownership definition (owns_paths, owns_namespaces, or match)`,
        code: "missing_ownership",
      });
    }
  }

  // Check for self-references in allowed_callers or forbidden_callers
  for (const [moduleId, module] of Object.entries(validPolicy.modules)) {
    if (module.allowed_callers?.includes(moduleId)) {
      warnings.push({
        path: `modules.${moduleId}.allowed_callers`,
        message: `Module "${moduleId}" references itself in allowed_callers`,
        code: "self_reference",
      });
    }
    if (module.forbidden_callers?.includes(moduleId)) {
      warnings.push({
        path: `modules.${moduleId}.forbidden_callers`,
        message: `Module "${moduleId}" references itself in forbidden_callers`,
        code: "self_reference",
      });
    }
  }

  // Check for references to non-existent modules
  const moduleIds = new Set(Object.keys(validPolicy.modules));
  for (const [moduleId, module] of Object.entries(validPolicy.modules)) {
    // Check allowed_callers - only warn if it's not a glob pattern
    for (const caller of module.allowed_callers || []) {
      if (!caller.includes("*") && !moduleIds.has(caller)) {
        warnings.push({
          path: `modules.${moduleId}.allowed_callers`,
          message: `Module "${moduleId}" references unknown module "${caller}" in allowed_callers`,
          code: "unknown_module_reference",
        });
      }
    }
    // Check forbidden_callers - only warn if it's not a glob pattern
    for (const caller of module.forbidden_callers || []) {
      if (!caller.includes("*") && !moduleIds.has(caller)) {
        warnings.push({
          path: `modules.${moduleId}.forbidden_callers`,
          message: `Module "${moduleId}" references unknown module "${caller}" in forbidden_callers`,
          code: "unknown_module_reference",
        });
      }
    }
  }

  return {
    valid: true,
    moduleCount,
    errors,
    warnings,
  };
}
