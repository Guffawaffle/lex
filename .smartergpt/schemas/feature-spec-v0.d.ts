import { z } from "zod";
/**
 * Feature Specification v0 Schema
 * Corresponds to feature-spec-v0.json
 */
export declare const FeatureSpecV0Schema: z.ZodObject<{
    schemaVersion: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    acceptanceCriteria: z.ZodOptional<z.ZodArray<z.ZodString>>;
    technicalContext: z.ZodOptional<z.ZodString>;
    constraints: z.ZodOptional<z.ZodString>;
    repo: z.ZodString;
    createdAt: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type FeatureSpecV0 = z.infer<typeof FeatureSpecV0Schema>;
