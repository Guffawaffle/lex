# Instructions Generation Examples

This directory contains examples for the Lex instructions generation feature.

## Overview

The instructions feature allows you to maintain a **single source of truth** for AI assistant guidance in your repository. Lex projects your canonical instructions to host-specific files.

## Quick Start Example

### 1. Create canonical instructions

Create `.smartergpt/instructions/lex.md`:

```markdown
# Project Instructions

## Overview

This project uses TypeScript with React for the frontend and Node.js for the backend.

## Key Files

| File | Purpose |
|------|---------|
| `lexmap.policy.json` | Module ownership map |
| `src/api/` | Backend API endpoints |
| `src/ui/` | React components |

## Coding Guidelines

### When Editing Code

1. Follow existing patterns in the codebase
2. Add tests for new functionality
3. Update documentation as needed

### Module Boundaries

- `ui/` components should not directly access the database
- Use the API layer for data fetching
- Shared utilities go in `src/shared/`

## Memory Commands

\`\`\`bash
lex remember --reference-point "feature" --summary "What was done"
lex recall "search term"
\`\`\`
```

### 2. Configure projection (optional)

Create `lex.yaml` if you want to customize:

```yaml
version: 1

instructions:
  # Default location - can be customized
  canonical: .smartergpt/instructions/lex.md

  # Enable/disable specific hosts
  projections:
    copilot: true   # .github/copilot-instructions.md
    cursor: true    # .cursorrules
```

### 3. Generate projections

```bash
# Preview changes
lex instructions generate --dry-run

# Apply changes
lex instructions generate
```

## Files in This Directory

- `lex.example.md` - Example canonical instruction file
- `lex.example.yaml` - Example lex.yaml configuration

## See Also

- [Instructions Documentation](../../docs/INSTRUCTIONS.md)
- [Configuration Contract](../../docs/specs/lex-yaml-config-contract.md)
- [Canonical Format Specification](../../docs/specs/canonical-instruction-format.md)
