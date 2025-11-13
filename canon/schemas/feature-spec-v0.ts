import { z } from "zod";

/**
 * Feature Specification v0 Schema
 * Corresponds to feature-spec-v0.json
 */
export const FeatureSpecV0Schema = z
  .object({
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()).optional(),
    technicalContext: z.string().optional(),
    constraints: z.string().optional(),
    repo: z.string(),
    createdAt: z.string().datetime().optional(),
  })
  .strict();

export type FeatureSpecV0 = z.infer<typeof FeatureSpecV0Schema>;
