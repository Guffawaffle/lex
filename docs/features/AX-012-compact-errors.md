# AX-012: Compact Error Envelope with Hint IDs

## Overview

This document describes the compact error envelope feature (AX-012) that provides token-efficient error responses for AI agents with minimal context windows.

## Problem

Standard error responses are verbose and consume significant tokens:

```json
{
  "error": {
    "code": "VALIDATION_INVALID_MODULE_ID",
    "message": "Module 'auth/invalid' not found in policy. Did you mean 'auth/core'? Available modules: auth/core, auth/password, memory/store, ...",
    "metadata": {
      "invalidIds": ["auth/invalid"],
      "suggestions": ["auth/core", "auth/password"],
      "availableModules": ["auth/core", "auth/password", "memory/store", ...]
    }
  }
}
```

This can consume 200+ tokens for a single error.

## Solution

### 1. Compact Error Envelope

The compact error format uses short field names and minimal data:

```json
{
  "err": {
    "code": "VALIDATION_INVALID_MODULE_ID",
    "msg": "Module 'auth/invalid' not found.",
    "retry": false,
    "hintId": "hint_mod_invalid_001"
  }
}
```

**Field Descriptions:**

- `err`: Error details (short for "error")
- `code`: Stable error code (same as full format)
- `msg`: Truncated message (first sentence or ~100 chars)
- `retry`: Boolean indicating if the error is retryable
- `hintId`: Reference to cached hint for recovery advice

**Token Savings:** 30-50% reduction compared to full error format.

### 2. Hint Registry

Hints are stable, cacheable advice snippets that agents can fetch once and reuse:

```json
{
  "hint_mod_invalid_001": {
    "action": "Check module ID spelling",
    "tool": "introspect",
    "field": "policy.modules"
  }
}
```

**Benefits:**

- Hints are stable across versions
- Agents can cache hints client-side
- Reduces token usage on repeated errors

### 3. `get_hints` MCP Tool

Retrieve hint details by hint ID:

```typescript
// Request
{
  "name": "get_hints",
  "arguments": {
    "hintIds": ["hint_mod_invalid_001", "hint_policy_not_found_001"]
  }
}

// Response
{
  "data": {
    "hints": {
      "hint_mod_invalid_001": {
        "action": "Check module ID spelling",
        "tool": "introspect",
        "field": "policy.modules"
      },
      "hint_policy_not_found_001": {
        "action": "Initialize workspace with policy file",
        "tool": "lex init"
      }
    }
  }
}
```

## Usage

### Converting AXError to Compact Format

```typescript
import { createAXError, axErrorToCompactEnvelope } from "@app/shared/errors";

const axError = createAXError(
  "VALIDATION_INVALID_MODULE_ID",
  "Module 'auth/invalid' not found in policy...",
  ["Check module ID spelling", "Run introspect"],
  { invalidIds: ["auth/invalid"] }
);

// Convert to compact format
const compact = axErrorToCompactEnvelope(axError);
// Result: { err: { code: "...", msg: "...", retry: false, hintId: "..." } }
```

### Converting MCP Error to Compact Format

```typescript
import { mcpErrorToCompactEnvelope } from "@app/shared/errors";

const compact = mcpErrorToCompactEnvelope(
  "STORAGE_WRITE_FAILED",
  "Failed to write to database: connection timeout",
  { operation: "saveFrame" }
);
// Result: { err: { code: "...", msg: "...", retry: true, hintId: "..." } }
```

### Fetching Hints

```typescript
// In an MCP client
const response = await mcpClient.callTool({
  name: "get_hints",
  arguments: {
    hintIds: ["hint_mod_invalid_001", "hint_storage_write_001"],
  },
});

const hints = response.data.hints;
// Cache these hints for future use
```

## Hint ID Naming Convention

Hint IDs follow the pattern: `hint_<category>_<subcategory>_<number>`

Examples:

- `hint_mod_invalid_001` - Module validation errors
- `hint_policy_not_found_001` - Policy file not found
- `hint_storage_write_001` - Storage write failures

The three-digit number allows for versioning while maintaining stability.

## Error Code to Hint ID Mapping

The system automatically maps error codes to hint IDs. See `src/shared/errors/hint-registry.ts` for the complete mapping.

Common mappings:

- `VALIDATION_INVALID_MODULE_ID` → `hint_mod_invalid_001`
- `POLICY_NOT_FOUND` → `hint_policy_not_found_001`
- `FRAME_NOT_FOUND` → `hint_frame_not_found_001`
- `STORAGE_WRITE_FAILED` → `hint_storage_write_001`

## Backward Compatibility

The compact error format is **opt-in**. Existing error handling continues to work unchanged. The full error format is still the default for:

- AXErrorException responses
- MCPError responses
- CLI --json output

Compact format is intended for:

- Small-context AI agents
- Token-constrained environments
- High-frequency error scenarios

## Future Enhancements

1. **Compact mode flag**: Add a parameter to MCP tools to request compact error format
2. **Hint versioning**: Support multiple versions of hints as advice evolves
3. **Localized hints**: Support hint translations for different languages
4. **Custom hints**: Allow workspaces to define custom hints for domain-specific errors

## Related Files

- **Implementation:**

  - `src/shared/errors/compact-error.ts` - Compact error utilities
  - `src/shared/errors/hint-registry.ts` - Hint registry and mappings
  - `src/memory/mcp_server/server.ts` - `get_hints` tool handler

- **Tests:**
  - `test/shared/errors/compact-error.test.ts` - Compact error tests
  - `test/shared/errors/hint-registry.test.ts` - Hint registry tests
  - `test/memory/mcp_server/get-hints.test.ts` - MCP tool tests

## References

- [AX Contract v0.1](../specs/AX-CONTRACT.md) - §2.3 Recoverable Errors
- [AXError Schema](../../src/shared/errors/ax-error.ts) - Full error format
- [Error Code Catalog](../../src/shared/errors/error-codes.ts) - All error codes
