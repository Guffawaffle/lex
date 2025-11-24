# Lex Prompts

This directory contains default prompt templates for Lex CLI commands. These prompts are designed to be **generic and extensible**, providing a foundation that users can customize.

## Customization via Precedence Chain

Lex uses a 3-level precedence chain for prompts:

1. **Environment** (highest): `LEX_CANON_DIR=/custom/canon lex remember ...`
2. **Local overlay**: `.smartergpt.local/prompts/`
3. **Package defaults**: `prompts/` (this directory, lowest)

## How to Customize

### Option 1: Local Overlay (Recommended)

Copy a prompt to your local overlay and edit:

```bash
# Create local overlay directory
mkdir -p .smartergpt.local/prompts/

# Copy and customize
cp prompts/remember.md .smartergpt.local/prompts/
vim .smartergpt.local/prompts/remember.md
```

Your customized version will be used instead of the package default.

### Option 2: Custom Canon Directory

Point to a completely custom prompt directory:

```bash
export LEX_CANON_DIR=/path/to/my/custom/canon
lex remember ...
```

## Available Prompts

- `remember.md` - Template for capturing work session Frames
- `recall.md` - Template for Frame retrieval with context
- `example.md` - Example/demonstration prompt

## Prompt Format

Prompts support token substitution:

- `{{today}}` - Current date (YYYY-MM-DD)
- `{{now}}` - Current timestamp (ISO 8601)
- `{{branch}}` - Current git branch
- `{{commit}}` - Current git commit hash
- `{{user}}` - Git user name
- `{{email}}` - Git user email

See [Token Expansion Documentation](../src/shared/tokens/README.md) for full list.

## Design Philosophy

**These prompts are intentionally generic** to serve as a foundation. They contain:

- ✅ Clear instructions for the AI assistant
- ✅ Token substitution placeholders
- ✅ Minimal opinionated guidance
- ❌ No proprietary orchestration logic
- ❌ No specific workflow assumptions

Users are encouraged to create customized versions tailored to their workflows.
