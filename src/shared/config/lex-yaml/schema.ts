/**
 * lex.yaml Zod Schema v0.1
 *
 * Defines the schema for repo-local AI workflow configuration.
 * See ADR-0008 for specification details.
 *
 * @module lex-yaml/schema
 */

import { z } from "zod";

// =============================================================================
// Provider Schema
// =============================================================================

/**
 * Provider configuration - logical provider/model identifier.
 * Executors map `id` to concrete API + model.
 */
export const ProviderSchema = z.object({
  /** Logical provider name; mapping is executor-specific */
  id: z.string().default("default"),
  /** Soft cap for output tokens; executor decides enforcement */
  max_tokens: z.number().int().positive().optional(),
});

export type Provider = z.infer<typeof ProviderSchema>;

// =============================================================================
// Tools Schema
// =============================================================================

/**
 * Command definition - named shell command the workflow may invoke.
 */
export const CommandSchema = z.object({
  /** Logical name for the command */
  name: z.string(),
  /** Shell command to run */
  cmd: z.string(),
});

export type Command = z.infer<typeof CommandSchema>;

/**
 * Tools configuration - capability allowlist.
 * Names what the agent may use, not how capabilities are provided.
 */
export const ToolsSchema = z.object({
  /** Logical capability/service identifiers (e.g., MCP servers) */
  servers: z.array(z.string()).default([]),
  /** Named shell commands the workflow may invoke */
  commands: z.array(CommandSchema).default([]),
});

export type Tools = z.infer<typeof ToolsSchema>;

// =============================================================================
// Policy Schema
// =============================================================================

/**
 * Policy configuration - access control for the workflow.
 * Executors enforce policy at tool invocation time.
 */
export const PolicySchema = z.object({
  /**
   * Path to LexMap policy file, or boolean.
   * - string: relative path to lexmap.policy.json
   * - true: auto-discover default location
   * - false/omitted: no LexMap integration
   */
  lexmap: z.union([z.string(), z.boolean()]).optional(),
  /** Glob patterns where edits are allowed */
  allowed_paths: z.array(z.string()).default([]),
  /** Glob patterns where edits are forbidden (takes precedence) */
  denied_paths: z.array(z.string()).default([]),
});

export type Policy = z.infer<typeof PolicySchema>;

// =============================================================================
// Limits Schema
// =============================================================================

/**
 * Limits configuration - advisory runtime constraints.
 * Agents should treat as budget guidance; executors may or may not enforce strictly.
 */
export const LimitsSchema = z.object({
  /** Soft limit on file edit operations per run */
  max_edits: z.number().int().positive().optional(),
  /** Soft limit on distinct files that can be edited */
  max_files: z.number().int().positive().optional(),
  /** Recommended upper bound on runtime in seconds */
  timeout_seconds: z.number().int().positive().optional(),
});

export type Limits = z.infer<typeof LimitsSchema>;

// =============================================================================
// Checks Schema
// =============================================================================

/**
 * Check definition - command the executor runs after workflow completes.
 * Checks are not agent-invoked; exit code 0 = pass.
 */
export const CheckSchema = z.object({
  /** Stable identifier for logs/receipts/status */
  id: z.string(),
  /** Human-readable description */
  description: z.string().optional(),
  /** Shell command to execute */
  cmd: z.string(),
  /** Classification for reporting (lint, test, build, custom) */
  type: z.string().optional(),
  /** If true, failing check blocks workflow success */
  required: z.boolean().default(true),
});

export type Check = z.infer<typeof CheckSchema>;

// =============================================================================
// Inputs Schema
// =============================================================================

/**
 * Inputs configuration - workflow parameter contract.
 * Required inputs must be provided at invocation; agents should not hallucinate them.
 */
export const InputsSchema = z.object({
  /** Names of required input parameters */
  required: z.array(z.string()).default([]),
  /** Names of optional input parameters */
  optional: z.array(z.string()).default([]),
});

export type Inputs = z.infer<typeof InputsSchema>;

// =============================================================================
// Workflow Schema
// =============================================================================

/**
 * Workflow definition - a named AI workflow with its constraints.
 */
export const WorkflowSchema = z.object({
  /** Short human-readable summary */
  description: z.string().optional(),
  /** Input parameter contract */
  inputs: InputsSchema.optional(),
  /** Provider configuration (overrides defaults) */
  provider: ProviderSchema.optional(),
  /** Tools configuration (overrides defaults) */
  tools: ToolsSchema.optional(),
  /** Policy configuration (overrides defaults) */
  policy: PolicySchema.optional(),
  /** Limits configuration (overrides defaults) */
  limits: LimitsSchema.optional(),
  /** Checks to run after workflow (overrides defaults) */
  checks: z.array(CheckSchema).optional(),
});

export type Workflow = z.infer<typeof WorkflowSchema>;

// =============================================================================
// Defaults Schema
// =============================================================================

/**
 * Defaults configuration - shared settings inherited by all workflows.
 */
export const DefaultsSchema = z.object({
  provider: ProviderSchema.optional(),
  tools: ToolsSchema.optional(),
  policy: PolicySchema.optional(),
  limits: LimitsSchema.optional(),
  checks: z.array(CheckSchema).optional(),
});

export type Defaults = z.infer<typeof DefaultsSchema>;

// =============================================================================
// Top-Level Schema
// =============================================================================

/**
 * lex.yaml top-level schema v0.1
 */
export const LexYamlSchema = z.object({
  /** Schema version for lex.yaml */
  version: z.union([z.literal("0.1"), z.literal(0.1)]),
  /** Shared defaults for all workflows */
  defaults: DefaultsSchema.optional(),
  /** Named workflow definitions */
  workflows: z.record(z.string(), WorkflowSchema),
  /** Reserved for future use - paths to additional config fragments */
  includes: z.array(z.string()).optional(),
});

export type LexYamlConfig = z.infer<typeof LexYamlSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Parse and validate a lex.yaml config object.
 * @param data - Raw parsed YAML object
 * @returns Validated and typed config
 * @throws ZodError if validation fails
 */
export function parseLexYaml(data: unknown): LexYamlConfig {
  return LexYamlSchema.parse(data);
}

/**
 * Safely validate a lex.yaml config object.
 * @param data - Raw parsed YAML object
 * @returns Result object with success/error
 */
export function validateLexYaml(data: unknown) {
  return LexYamlSchema.safeParse(data);
}

/**
 * Check if data is a valid lex.yaml config.
 * @param data - Raw parsed YAML object
 * @returns true if valid
 */
export function isValidLexYaml(data: unknown): data is LexYamlConfig {
  return LexYamlSchema.safeParse(data).success;
}
