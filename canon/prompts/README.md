# Prompts Directory

This directory contains prompt templates used by the Lex CLI and tools.

## Precedence Chain

Prompts are loaded with the following precedence:

1. **LEX_PROMPTS_DIR** - Explicit environment override
2. **.smartergpt.local/prompts/** - Local overlay (untracked)
3. **prompts/** - Published package location (this directory)

## Usage

```typescript
import { loadPrompt, listPrompts } from '@app/shared/prompts/loader.js';

// Load a specific prompt
const prompt = loadPrompt('example.md');

// List all available prompts
const prompts = listPrompts();
```

## Files in this Directory

- `test.md` - Test prompt for testing purposes
- `example.md` - Example prompt template

## Local Development

To override prompts locally without modifying the package:

1. Create `.smartergpt.local/prompts/` in your repository root
2. Add your custom prompt files there
3. They will take precedence over the package prompts

For more information, see `src/shared/prompts/loader.ts`.
