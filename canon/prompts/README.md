# Lex Prompts

This directory contains default prompt templates for Lex CLI commands. These prompts are designed to be **generic and extensible**, providing a foundation that users can customize.

## Customization via Precedence Chain

Lex uses a 4-level precedence chain for prompts:

1. **Environment** (highest): `LEX_PROMPTS_DIR=/custom/prompts`
2. **Shared overlay**: `.smartergpt/prompts/` (organization-level, gitignored)
3. **Package defaults**: `prompts/` (shipped with package)
4. **Development source**: `canon/prompts/` (lowest, development only)

## How to Customize

### Option 1: Shared Overlay (Recommended)

Copy a prompt to your shared overlay and edit:

```bash
# Create shared overlay directory (organization-level)
mkdir -p .smartergpt/prompts/

# Copy and customize
cp canon/prompts/remember.md .smartergpt/prompts/
vim .smartergpt/prompts/remember.md
```

Your customized version will be used instead of the package default.

### Option 2: Custom Prompts Directory

Point to a completely custom prompt directory:

```bash
export LEX_PROMPTS_DIR=/path/to/my/custom/prompts
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
