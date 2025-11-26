/**
 * CodeAtlasRun Schema - Provenance record for Code Atlas extraction runs
 *
 * This schema defines the structure for tracking Code Atlas extraction runs,
 * including metadata about what was scanned, limits applied, and the strategy used.
 */

import { z } from "zod";

/**
 * Limits configuration for extraction runs
 */
export const LimitsSchema = z.object({
  maxFiles: z.number().int().positive().optional(),
  maxBytes: z.number().int().positive().optional(),
});

export type Limits = z.infer<typeof LimitsSchema>;

/**
 * CodeAtlasRun schema - provenance record for each extraction run
 */
export const CodeAtlasRunSchema = z.object({
  runId: z.string().min(1),
  repoId: z.string().min(1),
  filesRequested: z.array(z.string()),
  filesScanned: z.array(z.string()),
  unitsEmitted: z.number().int().nonnegative(),
  limits: LimitsSchema,
  truncated: z.boolean(),
  strategy: z.enum(["static", "llm-assisted", "mixed"]).optional(),
  createdAt: z.string().datetime(),
  schemaVersion: z.literal("code-atlas-run-v0"),
});

export type CodeAtlasRun = z.infer<typeof CodeAtlasRunSchema>;

/**
 * Parse and validate a CodeAtlasRun object
 * @param data - The data to parse
 * @returns Validated CodeAtlasRun object
 * @throws ZodError if validation fails
 */
export function parseCodeAtlasRun(data: unknown): CodeAtlasRun {
  return CodeAtlasRunSchema.parse(data);
}

/**
 * Validate a CodeAtlasRun object without throwing
 * @param data - The data to validate
 * @returns Validation result with success flag and optional data/error
 */
export function validateCodeAtlasRun(
  data: unknown
): { success: true; data: CodeAtlasRun } | { success: false; error: z.ZodError } {
  const result = CodeAtlasRunSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
