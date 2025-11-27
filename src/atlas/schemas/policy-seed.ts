/**
 * PolicySeed Schema - Seed policy module definitions from Code Atlas data
 *
 * Part of Code Atlas Epic (CA-010) - Layer 4: Policy Integration (Stretch Goal)
 *
 * This is a **seed** for human refinement, not a final policy.
 */

import { z } from "zod";

/**
 * Individual module seed definition
 */
export const PolicySeedModuleSchema = z.object({
  /** Module identifier (e.g., "core", "api", "tests") */
  id: z.string().min(1),
  /** Glob patterns matching this module */
  match: z.array(z.string().min(1)),
  /** Number of code units in this module */
  unitCount: z.number().int().nonnegative(),
  /** Types of code units found (e.g., ["class", "function"]) */
  kinds: z.array(z.string().min(1)),
  /** Auto-generated notes about this module */
  notes: z.string().optional(),
});

export type PolicySeedModule = z.infer<typeof PolicySeedModuleSchema>;

/**
 * Policy seed file schema
 *
 * @property version - Schema version (0 for initial implementation)
 * @property generatedBy - Generator identifier
 * @property repoId - Repository identifier
 * @property generatedAt - ISO 8601 timestamp of generation
 * @property modules - Detected module definitions
 */
export const PolicySeedSchema = z.object({
  version: z.literal(0),
  generatedBy: z.literal("code-atlas-v0"),
  repoId: z.string().min(1),
  generatedAt: z.string().datetime(),
  modules: z.array(PolicySeedModuleSchema),
});

export type PolicySeed = z.infer<typeof PolicySeedSchema>;

/**
 * Parse and validate a PolicySeed object
 *
 * @param data - Raw data to validate
 * @returns Validated PolicySeed
 * @throws {z.ZodError} If validation fails
 */
export function parsePolicySeed(data: unknown): PolicySeed {
  return PolicySeedSchema.parse(data);
}

/**
 * Validate a PolicySeed object (safe parse)
 *
 * @param data - Raw data to validate
 * @returns Validation result with success flag
 */
export function validatePolicySeed(
  data: unknown
): { success: true; data: PolicySeed } | { success: false; error: z.ZodError } {
  const result = PolicySeedSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
