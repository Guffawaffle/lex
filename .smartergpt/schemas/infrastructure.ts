/**
 * Zod Schemas for Infrastructure Configurations
 *
 * These Zod schemas mirror the JSON schemas for runtime validation.
 * Used for round-trip testing to ensure Zod and JSON Schema equivalence.
 */

import { z } from "zod";

/**
 * Profile Configuration Schema
 */
export const ProfileSchema = z
  .object({
    role: z.enum(["development", "local", "example", "ci", "custom"]),
    name: z.string().optional(),
    version: z.string().optional(),
    projectType: z.enum(["nodejs", "python", "generic"]).optional(),
    created: z.string().datetime().optional(),
    owner: z.string().optional(),
  })
  .strict();

export type Profile = z.infer<typeof ProfileSchema>;

/**
 * Safety Gates Configuration Schema
 */
export const GateConfigSchema = z.object({}).passthrough();

export const GateSchema = z
  .object({
    id: z.string(),
    type: z.enum(["validation", "approval", "check"]),
    enabled: z.boolean(),
    description: z.string().optional(),
    config: GateConfigSchema.optional(),
  })
  .strict();

export const GatesSchema = z
  .object({
    version: z.string().optional(),
    gates: z.array(GateSchema).optional(),
  })
  .strict();

export type Gate = z.infer<typeof GateSchema>;
export type Gates = z.infer<typeof GatesSchema>;

/**
 * Runner Stack Configuration Schema
 */
export const StackComponentConfigSchema = z.object({}).passthrough();

export const StackComponentSchema = z
  .object({
    name: z.string(),
    type: z.string(),
    enabled: z.boolean().optional(),
    config: StackComponentConfigSchema.optional(),
  })
  .strict();

export const RunnerStackSchema = z
  .object({
    version: z.string().optional(),
    stack: z.array(StackComponentSchema).optional(),
    timeout: z.number().optional(),
    retries: z.number().optional(),
  })
  .strict();

export type StackComponent = z.infer<typeof StackComponentSchema>;
export type RunnerStack = z.infer<typeof RunnerStackSchema>;

/**
 * Runner Scope Configuration Schema
 */
export const ScopeSchema = z
  .object({
    modules: z.array(z.string()).optional(),
    directories: z.array(z.string()).optional(),
    files: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
  })
  .strict();

export const LimitsSchema = z
  .object({
    maxFiles: z.number().optional(),
    maxLines: z.number().optional(),
    maxDuration: z.number().optional(),
  })
  .strict();

export const RunnerScopeSchema = z
  .object({
    version: z.string().optional(),
    scope: ScopeSchema.optional(),
    permissions: z.array(z.string()).optional(),
    limits: LimitsSchema.optional(),
  })
  .strict();

export type Scope = z.infer<typeof ScopeSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type RunnerScope = z.infer<typeof RunnerScopeSchema>;
