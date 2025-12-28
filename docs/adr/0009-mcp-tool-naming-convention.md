# ADR-0009: MCP Tool Naming Convention (Resource_Action Pattern)

- Status: Accepted
- Date: 2025-12-28
- Authors: GitHub Copilot
- Tags: mcp, naming, tools, ux, ax

## 1. Context

The Lex ecosystem comprises three MCP servers (Lex, LexSona, LexRunner) that expose tools to AI agents via the Model Context Protocol. Currently, these servers use inconsistent naming conventions:

- **Lex**: `remember`, `recall`, `list_frames` (verb-heavy, inconsistent)
- **LexSona**: `persona_activate`, `rules_learn` (noun_verb)
- **LexRunner**: `plan_create`, `discover`, `health`, `executor_prepare_context` (mix of noun_verb and verb)

This inconsistency creates several problems:

1. **Reduced discoverability**: Agents trained on one pattern struggle to predict tool names in other servers
2. **Poor UX for agents**: Without a consistent pattern, agents must memorize each tool name individually
3. **Difficult maintenance**: Adding new tools requires arbitrary naming decisions
4. **Cross-repo confusion**: Users switching between servers encounter different conventions

Per AX-014, we need a standardized naming convention that enables agents to predict tool names through pattern recognition (e.g., if `rule_create` exists, agents can reasonably guess `rule_list` might exist too).

## 2. Decision

We adopt the **`resource_action`** (snake_case) pattern as the standard for all MCP tool names across the Lex ecosystem.

### Pattern Definition

```
{resource}_{action}
```

Where:
- `resource`: The primary noun/entity the tool operates on (e.g., `frame`, `persona`, `plan`)
- `action`: The verb describing what the tool does (e.g., `create`, `search`, `list`, `get`)

### Examples

| Server | Current Name | Standardized Name | Notes |
|--------|--------------|-------------------|-------|
| Lex | `remember` | `frame_create` | Primary memory storage action |
| Lex | `recall` | `frame_search` | Full-text search of frames |
| Lex | `list_frames` | `frame_list` | Already mostly compliant |
| Lex | `get_frame` | `frame_get` | Already mostly compliant |
| Lex | `validate_remember` | `frame_validate` | Validates frame input |
| Lex | `policy_check` | `policy_check` | Already compliant |
| Lex | `timeline` | `timeline_show` | Visual timeline display |
| Lex | `code_atlas` | `atlas_analyze` | Code structure analysis |
| Lex | `introspect` | `system_introspect` | System state discovery |
| Lex | `get_hints` | `hints_get` | Retrieve error hints |

### Special Cases

- **`help`**: Remains as-is (universally recognized convention)
- Single-word verbs where resource is implicit may be acceptable for high-level operations if they're self-evident

### Common Actions

To maximize predictability, we standardize on these common action verbs:

- `create`: Create a new resource
- `get`: Retrieve a specific resource by ID
- `list`: List/enumerate resources (optionally filtered)
- `search`: Full-text or fuzzy search
- `update`: Modify an existing resource
- `delete`: Remove a resource
- `validate`: Validate input without mutation
- `check`: Validate state/compliance
- `analyze`: Generate insights/analysis
- `show`/`display`: Present formatted output

## 3. Migration Strategy

To maintain backward compatibility during transition:

### Phase 1: Alias Support (Current Release)

1. **Add new standardized names** alongside existing names
2. **Register old names as deprecated aliases** in tool handling logic
3. **Log deprecation warnings** when old names are used (via structured logging)
4. **Update help tool** to document both old and new names with migration guidance

### Phase 2: Documentation (Current Release)

1. **Update all documentation** to use new names
2. **Add migration guide** in CHANGELOG
3. **Update examples** in README and tutorials

### Phase 3: Removal (Next Major Version)

1. **Remove deprecated aliases** in next major version (v3.0.0)
2. **Keep migration guide** in documentation for 1-2 versions after removal

### Implementation

The MCP server's `handleToolsCall` method will accept both names:

```typescript
switch (name) {
  // New standardized name (canonical)
  case "frame_create":
  // Old name (deprecated alias)
  case "remember":
  case "lex_remember": // Legacy v2.0.x prefix
    return await this.handleRemember(args);
}
```

Deprecation warnings will be logged for old names:

```typescript
if (name === "remember" || name === "lex_remember") {
  logger.warn(`Tool "${name}" is deprecated. Use "frame_create" instead.`);
}
```

## 4. Consequences

### Positive

1. **Predictable tool discovery**: Agents can guess `frame_list` if they know `frame_create`
2. **Consistent cross-server UX**: Same pattern in Lex, LexSona, LexRunner
3. **Better documentation**: Pattern-based organization in help text
4. **Easier onboarding**: New users learn one pattern, not three
5. **Future-proof**: Clear guidelines for adding new tools

### Negative

1. **Breaking change**: Users must update their code/prompts (mitigated by aliases)
2. **Verbose names**: `frame_create` is longer than `remember` (acceptable trade-off for clarity)
3. **Migration effort**: Documentation and examples need updates

### Neutral

1. **More boilerplate**: Maintaining aliases temporarily increases code size
2. **Deprecation noise**: Warnings in logs during transition period

## 5. Alternatives Considered

### A. Keep current mixed conventions

**Rejected**: Maintains the discoverability problem AX-014 aims to solve.

### B. Verb_Noun pattern

Example: `create_frame`, `search_frame`, `list_frames`

**Rejected**: Less natural for agents accustomed to REST/CRUD patterns. Resource_Action matches REST endpoints (`/frames/create`) and object-oriented thinking (`frame.create()`).

### C. Single verbs only

Example: `remember`, `recall`, `discover`

**Rejected**: Works for unique actions but breaks down when you need `frame_create` vs `persona_create`. Requires memorization rather than pattern recognition.

### D. Namespace prefix (redundant with VS Code)

Example: `lex_frame_create`

**Rejected**: VS Code already adds `mcp_lex_` prefix automatically. This would result in `mcp_lex_lex_frame_create`.

## 6. References

- AX-014: Original issue requesting standardization
- NAMING_CONVENTIONS.md: Ecosystem-wide naming guide
- [MCP Specification](https://modelcontextprotocol.io/specification/server/tools/): Tool naming guidance
- [GitHub MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/github): Reference implementation using verb-based names

## 7. Decision Rationale

The `resource_action` pattern strikes the optimal balance between:

- **Discoverability**: Agents can infer tool existence through patterns
- **Consistency**: One pattern across all three servers
- **Clarity**: Resource is always explicit (no ambiguity)
- **Industry alignment**: Matches REST API and CRUD conventions

This decision prioritizes **agent UX and predictability** over brevity, aligning with Lex's core mission of providing high-quality AI-native tooling.
