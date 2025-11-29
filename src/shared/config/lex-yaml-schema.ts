/**
 * Lex YAML Configuration Schema
 *
 * Zod schema with TypeScript type exports for lex.yaml configuration file.
 * Defines the structure for instruction generation settings.
 */

import { z } from "zod";

/**
 * Projections configuration schema
 */
export const ProjectionsSchema = z.object({
  copilot: z.boolean().default(true),
  cursor: z.boolean().default(true),
});

export type Projections = z.infer<typeof ProjectionsSchema>;

/**
 * Instructions configuration schema
 */
export const InstructionsSchema = z.object({
  canonical: z.string().default(".smartergpt/instructions/lex.md"),
  projections: ProjectionsSchema.optional(),
});

export type Instructions = z.infer<typeof InstructionsSchema>;

/**
 * LexYaml schema - Root configuration for lex.yaml
 *
 * @property version - Schema version (must be 1)
 * @property instructions - Optional instructions generation configuration
 */
export const LexYamlSchema = z.object({
  version: z.literal(1),
  instructions: InstructionsSchema.optional(),
});

export type LexYaml = z.infer<typeof LexYamlSchema>;

/**
 * Parse and validate a LexYaml configuration object
 *
 * @param data - Raw data to validate
 * @returns Validated LexYaml configuration
 * @throws {z.ZodError} If validation fails
 *
 * @example
 * ```typescript
 * const config = parseLexYaml({
 *   version: 1,
 *   instructions: {
 *     canonical: '.smartergpt/instructions/lex.md',
 *     projections: {
 *       copilot: true,
 *       cursor: true
 *     }
 *   }
 * });
 * ```
 */
export function parseLexYaml(data: unknown): LexYaml {
  return LexYamlSchema.parse(data);
}

/**
 * Validate a LexYaml configuration object (safe parse)
 *
 * @param data - Raw data to validate
 * @returns Validation result with success flag
 *
 * @example
 * ```typescript
 * const result = validateLexYaml(rawData);
 * if (result.success) {
 *   console.log("Valid config:", result.data);
 * } else {
 *   console.error("Validation errors:", result.error);
 * }
 * ```
 */
export function validateLexYaml(
  data: unknown
): { success: true; data: LexYaml } | { success: false; error: z.ZodError } {
  const result = LexYamlSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
