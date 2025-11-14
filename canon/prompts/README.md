# Prompts Directory

This directory contains prompt templates used by the Lex CLI and tools.

## Precedence Chain

Prompts are loaded with the following precedence:

1. **LEX_PROMPTS_DIR** - Explicit environment override
2. **.smartergpt.local/prompts/** - Local overlay (untracked)
3. **prompts/** - Published package location (this directory)

## Usage

```typescript
import { loadPrompt, listPrompts, loadPromptTemplate, renderPrompt } from '@app/shared/prompts';

// Load a simple prompt (raw content)
const prompt = loadPrompt('example.md');

// Load a prompt with metadata
const template = loadPromptTemplate('conflict-resolution.md');
console.log(template.metadata.title); // "Merge Conflict Resolution Guide"

// Render a template with variables
const rendered = renderPrompt(template.content, {
  fileName: 'src/cli.ts',
  conflictCount: 3,
  branch: 'main'
});

// List all available prompts
const prompts = listPrompts();
```

## Files in this Directory

- `test.md` - Test prompt for testing purposes
- `example.md` - Example prompt template
- `conflict-resolution.md` - Merge conflict resolution guide
- `gate-failure.md` - Gate failure recovery strategies
- `post-plan.md` - Post-plan creation workflow
- `error-recovery.md` - General error recovery guide

## Authoring Guide

### Frontmatter (Required for Templates)

All prompt templates must include YAML frontmatter with required fields:

```markdown
---
schemaVersion: 1
id: unique-prompt-id
title: Human Readable Title
description: Brief description of prompt's purpose
variables: [var1, var2, var3]
tags: [category, topic]
requires: []  # Optional: dependencies on other prompts
---

# Prompt Content Here

Use {{variables}} in your template...
```

### Required Fields

- **schemaVersion** - Must be `1` (integer)
- **id** - Unique identifier (kebab-case)
- **title** - Human-readable title
- **variables** - Array of variable names used in template
- **tags** - Array of categorization tags

### Template Syntax

#### Variables
```markdown
Hello {{name}}!
```

#### Conditionals
```markdown
{{#if hasErrors}}
⚠ Errors detected: {{errorCount}}
{{else}}
✓ All checks passed
{{/if}}
```

#### Loops
```markdown
{{#each items}}
- {{this}}
{{/each}}
```

#### Raw Output (no HTML escaping)
```markdown
{{{htmlContent}}}
```

### Best Practices

1. **Keep prompts focused** - One purpose per prompt
2. **Max length ~10KB** - Prompts over 100KB will be rejected
3. **Clear variable names** - Use descriptive names
4. **Document all variables** - List them in frontmatter
5. **Test your prompts** - Verify they render correctly
6. **No imperative logic** - Keep prompts declarative
7. **Escape by default** - Use `{{{raw}}}` only when needed

### Validation

Prompts are validated on load:
- ✅ Frontmatter schema must be valid
- ✅ All `{{variables}}` must be declared in frontmatter
- ✅ Files must be under 100KB
- ✅ No binary files allowed
- ✅ Path traversal attempts are rejected

### Testing Templates

Create test fixtures in `test/shared/prompts/`:

```typescript
import { loadPromptTemplate, renderPrompt } from '@app/shared/prompts';

const template = loadPromptTemplate('your-prompt.md');
const rendered = renderPrompt(template.content, {
  // your test context
});

assert.ok(rendered.includes('expected content'));
```

## Local Development

To override prompts locally without modifying the package:

1. Create `.smartergpt.local/prompts/` in your repository root
2. Add your custom prompt files there
3. They will take precedence over the package prompts

For more information, see `src/shared/prompts/loader.ts` and `src/shared/prompts/renderer.ts`.
