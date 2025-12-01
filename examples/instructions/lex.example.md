# Example Canonical Instructions Template

> **This is an example template for creating your own canonical instruction file.**
> Copy this to `.smartergpt/instructions/lex.md` and customize for your project.

Note: When `lex instructions generate` runs, it creates a canonical file with 
YAML frontmatter. The actual generated file looks like this:

```yaml
---
lex_version: "2.0.0"
generated_by: "lex instructions generate"
schema_version: "1"
---
```

Below is example content you can use as a starting point:

---

## What This Project Does

[Describe your project's purpose and main functionality]

---

## Key Files

| File | Purpose |
|------|---------|
| `lexmap.policy.json` | Module ownership and dependency rules |
| `lex.yaml` | Configuration for Lex features |
| `src/` | Main source code |
| `docs/` | Documentation |

---

## Architecture

[Describe your project's architecture at a high level]

### Module Structure

- `src/api/` — API endpoints and handlers
- `src/core/` — Core business logic
- `src/ui/` — User interface components
- `src/shared/` — Shared utilities

---

## Situational Guidance

### When Planning Work

1. Check existing context: `lex recall "topic"`
2. Review recent work: `lex timeline`
3. Understand module boundaries in `lexmap.policy.json`

### When Editing Code

1. Respect module boundaries defined in policy
2. Follow existing code patterns and style
3. Add tests for new functionality
4. Update documentation when changing behavior

### When Reviewing Code

1. Check for policy violations
2. Verify tests cover new functionality
3. Ensure documentation is updated

---

## Coding Standards

### Style

- Use consistent formatting (Prettier/ESLint)
- Prefer explicit types over `any`
- Write descriptive variable and function names

### Testing

- Write unit tests for new functions
- Add integration tests for API endpoints
- Maintain test coverage

### Documentation

- Update README when adding features
- Document public API changes
- Include examples in documentation

---

## Memory Commands

```bash
# Capture work context
lex remember \
  --reference-point "feature-name" \
  --summary "What was accomplished" \
  --next "Next action to take" \
  --modules "module1,module2"

# Retrieve context
lex recall "search query"

# View work timeline
lex timeline

# Check policy compliance
lex check
```

---

## See Also

- [Instructions Documentation](../../docs/INSTRUCTIONS.md)
- [Canonical Format Specification](../../docs/specs/canonical-instruction-format.md)
