/**
 * Hint Registry for Compact Error Responses
 *
 * Per AX-012, provides stable, cacheable advice snippets that agents can fetch once and reuse.
 * Hints are referenced by stable IDs in compact error envelopes.
 *
 * @module shared/errors/hint-registry
 */

/**
 * Hint advice structure
 */
export interface Hint {
  /** Recommended action to resolve the error */
  action: string;
  /** Tool or command to use (optional) */
  tool?: string;
  /** Specific field to check or introspect (optional) */
  field?: string;
}

/**
 * Type for all valid hint IDs
 */
export type HintId = string;

/**
 * Hint registry mapping stable hint IDs to advice snippets
 */
export const HINT_REGISTRY: Record<HintId, Hint> = {
  // Module validation hints
  hint_mod_invalid_001: {
    action: "Check module ID spelling",
    tool: "introspect",
    field: "policy.modules",
  },
  hint_mod_empty_001: {
    action: "Provide at least one module ID",
    field: "module_scope",
  },

  // Policy hints
  hint_policy_not_found_001: {
    action: "Initialize workspace with policy file",
    tool: "lex init",
  },
  hint_policy_invalid_001: {
    action: "Validate policy file structure",
    tool: "lex policy check",
  },

  // Frame hints
  hint_frame_not_found_001: {
    action: "List recent frames",
    tool: "lex timeline",
  },
  hint_frame_invalid_001: {
    action: "Check frame schema requirements",
    field: "status_snapshot.next_action",
  },

  // Required field hints
  hint_required_field_001: {
    action: "Provide required field",
  },

  // Storage hints
  hint_storage_write_001: {
    action: "Retry operation",
  },
  hint_storage_read_001: {
    action: "Check database connection",
  },

  // Configuration hints
  hint_config_not_found_001: {
    action: "Check lex.yaml exists",
    tool: "lex init",
  },
  hint_config_invalid_001: {
    action: "Validate configuration syntax",
  },
};

/**
 * Map error codes to hint IDs
 * Supports both LexErrorCode and MCP error code strings
 */
export const ERROR_CODE_TO_HINT_ID: Record<string, HintId> = {
  // Module validation errors
  VALIDATION_INVALID_MODULE_ID: "hint_mod_invalid_001",
  VALIDATION_EMPTY_MODULE_SCOPE: "hint_mod_empty_001",

  // Policy errors
  POLICY_NOT_FOUND: "hint_policy_not_found_001",
  POLICY_INVALID: "hint_policy_invalid_001",
  POLICY_MODULE_NOT_FOUND: "hint_mod_invalid_001",

  // Frame errors
  FRAME_NOT_FOUND: "hint_frame_not_found_001",
  FRAME_INVALID: "hint_frame_invalid_001",

  // Validation errors
  VALIDATION_REQUIRED_FIELD: "hint_required_field_001",

  // Storage errors (MCP)
  STORAGE_WRITE_FAILED: "hint_storage_write_001",
  STORAGE_READ_FAILED: "hint_storage_read_001",

  // Config errors
  CONFIG_NOT_FOUND: "hint_config_not_found_001",
  CONFIG_INVALID: "hint_config_invalid_001",
};

/**
 * Get hint by ID
 */
export function getHint(hintId: HintId): Hint | undefined {
  return HINT_REGISTRY[hintId];
}

/**
 * Get multiple hints by IDs
 */
export function getHints(hintIds: HintId[]): Record<HintId, Hint> {
  const result: Record<HintId, Hint> = {};
  for (const id of hintIds) {
    const hint = HINT_REGISTRY[id];
    if (hint) {
      result[id] = hint;
    }
  }
  return result;
}

/**
 * Get hint ID for an error code
 */
export function getHintIdForErrorCode(code: string): HintId | undefined {
  return ERROR_CODE_TO_HINT_ID[code];
}

/**
 * Check if a hint ID exists in the registry
 */
export function isValidHintId(hintId: string): hintId is HintId {
  return hintId in HINT_REGISTRY;
}

/**
 * Get all available hint IDs
 */
export function getAvailableHintIds(): HintId[] {
  return Object.keys(HINT_REGISTRY);
}

/**
 * Get hints for codes (alias for getHints with text formatting for CLI/MCP)
 * Returns hints with 'text' field combining action, tool, and field info
 */
export function getHintsForCodes(
  hintIds: HintId[]
): Record<HintId, { text: string; docLink?: string }> {
  const result: Record<HintId, { text: string; docLink?: string }> = {};
  for (const id of hintIds) {
    const hint = HINT_REGISTRY[id];
    if (hint) {
      // Build text from hint components
      let text = hint.action;
      if (hint.tool) {
        text += ` (use: ${hint.tool})`;
      }
      if (hint.field) {
        text += ` [check: ${hint.field}]`;
      }
      result[id] = { text };
    }
  }
  return result;
}
