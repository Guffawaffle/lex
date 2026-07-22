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

const REPO_RELATIVE_SOURCE_PATH =
  /^(?!\/)(?![a-z]:\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*[*?\[\]{}!]).+\.md$/i;

/** Exact, repo-relative Markdown sources explicitly opted into knowledge compilation. */
export const KnowledgeSchema = z.object({
  sources: z
    .array(
      z
        .string()
        .min(1)
        .max(512)
        .refine((value) => REPO_RELATIVE_SOURCE_PATH.test(value.replaceAll("\\", "/")), {
          message: "must be an exact repo-relative Markdown path without traversal or glob syntax",
        })
    )
    .max(256)
    .refine(
      (sources) =>
        new Set(sources.map((source) => source.replaceAll("\\", "/"))).size === sources.length,
      { message: "must not contain duplicate source paths" }
    ),
});

export type KnowledgeConfig = z.infer<typeof KnowledgeSchema>;

/**
 * LexYaml schema - Root configuration for lex.yaml
 *
 * @property version - Schema version (must be 1)
 * @property instructions - Optional instructions generation configuration
 */
export const LexYamlSchema = z.object({
  version: z.literal(1),
  instructions: InstructionsSchema.optional(),
  knowledge: KnowledgeSchema.optional(),
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
