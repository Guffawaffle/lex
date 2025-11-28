/**
 * lex.yaml Configuration Module
 *
 * Provides schema, parsing, discovery, and merge utilities for lex.yaml.
 *
 * @module lex-yaml
 */

// Schema and types
export {
  // Schemas
  LexYamlSchema,
  WorkflowSchema,
  DefaultsSchema,
  ProviderSchema,
  ToolsSchema,
  PolicySchema,
  LimitsSchema,
  CheckSchema,
  CommandSchema,
  InputsSchema,
  // Types
  type LexYamlConfig,
  type Workflow,
  type Defaults,
  type Provider,
  type Tools,
  type Policy,
  type Limits,
  type Check,
  type Command,
  type Inputs,
  // Validation helpers
  parseLexYaml,
  validateLexYaml,
  isValidLexYaml,
} from "./schema.js";

// Discovery
export {
  LEX_YAML_FILENAME,
  LEX_YAML_ALT_FILENAME,
  hasLexYaml,
  getLexYamlPath,
  findLexYaml,
  findRepoRoot,
  discoverLexYaml,
  type DiscoveryResult,
} from "./discovery.js";
