/**
 * Persona Schema — Foundation for AI agent personas
 *
 * This module provides the basic schema for persona definitions.
 * Personas are explicit, noun-y, human-initiated operational modes for AI agents.
 *
 * Lex provides the foundation; LexRunner builds production personas on top.
 *
 * @module
 */

import { z } from "zod";

/**
 * Role definition within a persona
 */
export const PersonaRoleSchema = z.object({
  /** Job title (e.g., "Senior Implementation Engineer") */
  title: z.string(),
  /** Brief scope description */
  scope: z.string(),
  /** Primary repository path (optional) */
  repo: z.string().optional(),
});

/**
 * Duties (invariants) for a persona
 */
export const PersonaDutiesSchema = z.object({
  /** Actions the persona MUST always do */
  must_do: z.array(z.string()),
  /** Actions the persona MUST NEVER do */
  must_not_do: z.array(z.string()),
});

/**
 * Complete persona definition schema
 *
 * Personas use YAML frontmatter in Markdown files:
 * ```yaml
 * ---
 * name: Senior Dev
 * version: 1.0.0
 * triggers: ["ok senior dev", "senior dev mode"]
 * ...
 * ---
 * # Senior Dev Persona
 * [Markdown body with detailed guidance]
 * ```
 */
export const PersonaSchema = z.object({
  /** Display name for the persona */
  name: z.string(),

  /** Schema version for forwards compatibility */
  version: z.string().default("1.0.0"),

  /** Activation trigger phrases (e.g., ["ok senior dev", "senior dev mode"]) */
  triggers: z.array(z.string()).min(1),

  /** Role definition */
  role: PersonaRoleSchema,

  /** Session ritual to print when activated (e.g., "SENIOR-DEV READY") */
  ritual: z.string().optional(),

  /** Duties (must do / must not do) */
  duties: PersonaDutiesSchema,

  /** Completion gates (e.g., ["lint", "typecheck", "test"]) */
  gates: z.array(z.string()).optional(),
});

/**
 * Type for a validated persona
 */
export type Persona = z.infer<typeof PersonaSchema>;

/**
 * Type for persona role
 */
export type PersonaRole = z.infer<typeof PersonaRoleSchema>;

/**
 * Type for persona duties
 */
export type PersonaDuties = z.infer<typeof PersonaDutiesSchema>;

/**
 * Parse and validate persona data
 *
 * @param data - Raw persona data (typically from YAML frontmatter)
 * @returns Validated Persona object
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * import { parsePersona } from './persona.js';
 * import yaml from 'js-yaml';
 *
 * const frontmatter = yaml.load(yamlString);
 * const persona = parsePersona(frontmatter);
 * console.log(persona.name); // "Senior Dev"
 * ```
 */
export function parsePersona(data: unknown): Persona {
  return PersonaSchema.parse(data);
}

/**
 * Validate persona data without throwing
 *
 * @param data - Raw persona data
 * @returns Result object with success flag and data/error
 *
 * @example
 * ```typescript
 * const result = validatePersona(data);
 * if (result.success) {
 *   console.log(result.data.name);
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function validatePersona(data: unknown) {
  return PersonaSchema.safeParse(data);
}
