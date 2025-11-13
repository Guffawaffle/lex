# Directory Alignment

This document describes the directory structure and file organization for the Lex repository, with special focus on configuration, schemas, and prompt templates.

## Configuration Directories

### `.smartergpt/` (Tracked Canon)

Tracked directory containing canonical schemas and prompt templates. These files are version controlled and provide the default behavior.

```
.smartergpt/
├── README.md                           # Overview of L-SCHEMAS implementation
├── prompts/                            # Canonical prompt templates (tracked)
│   ├── idea.md                         # Template for `lex-pr idea` command
│   └── create-project.md               # Template for `lex-pr create-project` command
└── schemas/                            # JSON Schema definitions (tracked)
    ├── execution-plan-v1.json          # Execution plan schema (v1)
    ├── execution-plan-v1.ts            # Zod schema (TypeScript)
    ├── execution-plan-v1.js            # Compiled JavaScript
    ├── execution-plan-v1.d.ts          # TypeScript declarations
    ├── feature-spec-v0.json            # Feature spec schema (v0)
    ├── feature-spec-v0.ts              # Zod schema (TypeScript)
    ├── feature-spec-v0.js              # Compiled JavaScript
    ├── feature-spec-v0.d.ts            # TypeScript declarations
    ├── profile.schema.json             # Profile configuration schema (v1)
    └── gates.schema.json               # Safety gates schema (v1)

Note: Runner schemas (runner.stack.schema.*, runner.scope.schema.*) are sourced from
the `lex-pr-runner` package. See "Schema Locations" section below.
```

### `.smartergpt.local/` (Local Overlay - Untracked)

Untracked directory for local development customizations and working files. Files here take precedence over their canon equivalents.

```
.smartergpt.local/
├── lex/
│   ├── lexmap.policy.json              # Working policy file (overrides example)
│   └── memory.db                       # Local Frame storage database
└── prompts/                            # Local prompt overrides (optional)
    ├── idea.md                         # Local override of idea prompt (if present)
    └── create-project.md               # Local override of create-project prompt (if present)
```

## Schema Locations

### Core Schemas (v1)

All schema files are stored in `.smartergpt/schemas/` and are tracked in version control:

1. **profile.schema.json** - Profile configuration for runtime environments
   - Defines roles: development, local, example, ci, custom
   - Project types: nodejs, python, generic

2. **gates.schema.json** - Safety gates and validation rules
   - Gate types: validation, approval, check
   - Configurable per-gate settings

### Runner Schemas (v1)

Runner schemas are owned and maintained by the `lex-pr-runner` package and imported as a devDependency:

3. **runner.stack.schema.json** - Runner execution stack configuration (from lex-pr-runner)
   - Stack component definitions
   - Timeout and retry settings

4. **runner.scope.schema.json** - Runner execution scope and boundaries (from lex-pr-runner)
   - Module/directory/file scoping
   - Permission requirements
   - Resource limits (maxFiles, maxLines, maxDuration)

### Using Schemas in YAML Files

Reference schemas in your YAML configuration files using the `$schema` property:

```yaml
# Example: profile.yml
$schema: "../.smartergpt/schemas/profile.schema.json"
role: development
name: "Local Development"
version: "1.0.0"
projectType: nodejs
created: "2025-11-09T12:00:00Z"
owner: "username"
```

This enables:
- Schema validation in compatible editors (VS Code, IntelliJ, etc.)
- Autocompletion for configuration properties
- Inline documentation and validation errors

## Prompt Template Precedence

Prompt templates are loaded using a precedence chain, allowing for local customization without modifying tracked files.

### Precedence Order

1. **`LEX_PROMPTS_DIR`** (highest priority) - Environment variable override
   - Explicit path to custom prompts directory
   - Use: `export LEX_PROMPTS_DIR=/custom/prompts`

2. **`.smartergpt.local/prompts/`** - Local overlay
   - Untracked directory for local customizations
   - Overrides canon without modifying tracked files

3. **`.smartergpt/prompts/`** (lowest priority) - Tracked canon
   - Version-controlled default templates
   - Always available as fallback

### Examples

**Use canon prompt:**
```typescript
import { loadPrompt } from 'lex/shared/prompts/loader';

const prompt = loadPrompt('idea.md');
// Loads from .smartergpt/prompts/idea.md
```

**Override with local version:**
```bash
# Create local override
mkdir -p .smartergpt.local/prompts
cp .smartergpt/prompts/idea.md .smartergpt.local/prompts/idea.md
# Edit .smartergpt.local/prompts/idea.md as needed
```

```typescript
const prompt = loadPrompt('idea.md');
// Now loads from .smartergpt.local/prompts/idea.md
```

**Override with environment variable:**
```bash
export LEX_PROMPTS_DIR=/path/to/custom/prompts
```

```typescript
const prompt = loadPrompt('idea.md');
// Loads from /path/to/custom/prompts/idea.md
```

## Policy Files

Policy files follow a similar precedence pattern:

1. **`LEX_POLICY_PATH`** - Environment variable override
2. **`.smartergpt.local/lex/lexmap.policy.json`** - Working file
3. **`src/policy/policy_spec/lexmap.policy.json.example`** - Example template

See `src/shared/policy/loader.ts` for implementation details.

## Database Storage

Frame storage uses SQLite databases located at:

1. **`LEX_DB_PATH`** - Environment variable override
2. **`.smartergpt.local/lex/memory.db`** - Working database (repo root)
3. **`~/.lex/frames.db`** - Fallback (home directory)

See `src/memory/store/db.ts` for implementation details.

## .gitignore Rules

The repository `.gitignore` includes:

```gitignore
# Local working files (untracked)
.smartergpt.local/**

# Canon files are force-added and tracked
# despite the pattern below
.smartergpt/**
```

Canon files in `.smartergpt/` are explicitly tracked using `git add -f` to override the ignore pattern.

## Adding New Schemas

To add a new schema:

1. Create the schema file in `.smartergpt/schemas/`
2. Follow JSON Schema draft-07 or draft/2020-12 format
3. Include `$schema` and `$id` properties
4. Force-add to git: `git add -f .smartergpt/schemas/your-schema.json`
5. Update this document with schema details
6. Add validation tests in `test/schemas/`

## Cross-Repository Usage

From LexRunner or other repositories:

```typescript
// Import schemas
import { FeatureSpecV0Schema } from 'lex/schemas/feature-spec-v0';
import { ExecutionPlanV1Schema } from 'lex/schemas/execution-plan-v1';

// Import prompt loader
import { loadPrompt } from 'lex/shared/prompts/loader';

// Load prompts
const ideaPrompt = loadPrompt('idea.md');
```

## References

- `.smartergpt/README.md` - L-SCHEMAS implementation overview
- `src/shared/prompts/loader.ts` - Prompt loader implementation
- `src/shared/policy/loader.ts` - Policy loader implementation
- `src/memory/store/db.ts` - Database initialization
- `test/shared/prompts/loader.test.ts` - Prompt loader tests
