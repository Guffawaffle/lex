/**
 * CodeUnit Schema - Atomic unit of the Code Atlas
 *
 * Zod schema with TypeScript type exports for code discovery and indexing.
 * Part of Code Atlas Epic (CA-001) - Layer 0: Schema
 */

import { z } from "zod";

/**
 * Code unit kind enumeration
 */
export const CodeUnitKindSchema = z.enum(["module", "class", "function", "method"]);

export type CodeUnitKind = z.infer<typeof CodeUnitKindSchema>;

/**
 * Code span within a file (line range)
 */
export const CodeUnitSpanSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

export type CodeUnitSpan = z.infer<typeof CodeUnitSpanSchema>;

/**
 * CodeUnit schema - Represents a discoverable code element
 *
 * @property id - Stable hash of (repo, file, symbol, kind)
 * @property repoId - Opaque repository identifier
 * @property filePath - Relative path within repository (e.g., "src/foo/bar.ts")
 * @property language - Language identifier (e.g., "ts", "js", "py")
 * @property kind - Type of code unit
 * @property symbolPath - Fully qualified symbol path (e.g., "src/foo/bar.ts::MyClass.myMethod")
 * @property name - Simple name of the code unit (e.g., "myMethod")
 * @property span - Line range in the file
 * @property tags - Optional categorization tags (e.g., ["test", "ui", "infra"])
 * @property docComment - Optional documentation extract
 * @property discoveredAt - ISO 8601 timestamp of discovery
 * @property schemaVersion - Schema version identifier
 */
export const CodeUnitSchema = z.object({
  id: z.string(),
  repoId: z.string(),
  filePath: z.string(),
  language: z.string(),

  kind: CodeUnitKindSchema,
  symbolPath: z.string(),
  name: z.string(),

  span: CodeUnitSpanSchema,

  tags: z.array(z.string()).optional(),
  docComment: z.string().optional(),

  discoveredAt: z.string().datetime(),
  schemaVersion: z.literal("code-unit-v0"),
});

export type CodeUnit = z.infer<typeof CodeUnitSchema>;

/**
 * Parse and validate a CodeUnit object
 *
 * @param data - Raw data to validate
 * @returns Validated CodeUnit
 * @throws {z.ZodError} If validation fails
 *
 * @example
 * ```typescript
 * const codeUnit = parseCodeUnit({
 *   id: "abc123",
 *   repoId: "repo-1",
 *   filePath: "src/foo/bar.ts",
 *   language: "ts",
 *   kind: "method",
 *   symbolPath: "src/foo/bar.ts::MyClass.myMethod",
 *   name: "myMethod",
 *   span: { startLine: 10, endLine: 20 },
 *   discoveredAt: "2025-11-26T14:00:00Z",
 *   schemaVersion: "code-unit-v0"
 * });
 * ```
 */
export function parseCodeUnit(data: unknown): CodeUnit {
  return CodeUnitSchema.parse(data);
}

/**
 * Validate a CodeUnit object (safe parse)
 *
 * @param data - Raw data to validate
 * @returns Validation result with success flag
 *
 * @example
 * ```typescript
 * const result = validateCodeUnit(rawData);
 * if (result.success) {
 *   console.log("Valid code unit:", result.data);
 * } else {
 *   console.error("Validation errors:", result.error);
 * }
 * ```
 */
export function validateCodeUnit(
  data: unknown
): { success: true; data: CodeUnit } | { success: false; error: z.ZodError } {
  const result = CodeUnitSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
