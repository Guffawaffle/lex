import { z } from "zod";

/**
 * Schema for canonical instruction file frontmatter.
 *
 * The canonical instruction file at `.smartergpt/instructions/lex.md` contains
 * YAML frontmatter with metadata about the generated file. This schema validates
 * that frontmatter.
 *
 * @see docs/specs/canonical-instruction-format.md
 */

/**
 * SemVer version string pattern.
 * Matches versions like "2.0.0", "1.0.0-beta.1", etc.
 */
const semverPattern = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

/**
 * Frontmatter schema for canonical instruction files.
 *
 * Required fields:
 * - lex_version: The Lex version that generated this file
 * - generated_by: The command that generated this file
 * - schema_version: The schema version for this format
 */
export const CanonicalInstructionFrontmatterSchema = z
  .object({
    /**
     * The Lex version that generated this file.
     * Must be a valid SemVer string.
     */
    lex_version: z
      .string()
      .regex(semverPattern, "lex_version must be a valid SemVer string (e.g., '2.0.0')"),

    /**
     * The command that generated this file.
     * Typically "lex instructions generate".
     */
    generated_by: z.string().min(1, "generated_by must not be empty"),

    /**
     * The schema version for this format.
     * Used for future compatibility when the format evolves.
     */
    schema_version: z.string().min(1, "schema_version must not be empty"),

    /**
     * Optional repository name.
     * May be used in multi-repo scenarios.
     */
    repo_name: z.string().optional(),
  })
  .strict();

/**
 * TypeScript type inferred from the frontmatter schema.
 */
export type CanonicalInstructionFrontmatter = z.infer<typeof CanonicalInstructionFrontmatterSchema>;

/**
 * Validates frontmatter data against the canonical instruction schema.
 *
 * @param data - The frontmatter object to validate
 * @returns The validated frontmatter if valid
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * const frontmatter = validateFrontmatter({
 *   lex_version: "2.0.0",
 *   generated_by: "lex instructions generate",
 *   schema_version: "1"
 * });
 * ```
 */
export function validateFrontmatter(data: unknown): CanonicalInstructionFrontmatter {
  return CanonicalInstructionFrontmatterSchema.parse(data);
}

/**
 * Safely validates frontmatter data, returning a result object instead of throwing.
 *
 * @param data - The frontmatter object to validate
 * @returns Object with success/data or error details
 *
 * @example
 * ```typescript
 * const result = safeParseFrontmatter(data);
 * if (result.success) {
 *   console.log(result.data.lex_version);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function safeParseFrontmatter(
  data: unknown
):
  | { success: true; data: CanonicalInstructionFrontmatter }
  | { success: false; error: z.ZodError } {
  const result = CanonicalInstructionFrontmatterSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
