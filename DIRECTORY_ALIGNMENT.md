# Directory Alignment

This document describes the directory structure and file organization for the Lex repository, with special focus on configuration, schemas, and prompt templates.

## Configuration Directories

### `canon/` (Tracked Canon)

Tracked directory containing canonical schemas and prompt templates. These files are version controlled and provide the default behavior. During the build process, canon assets are copied to `prompts/` and `schemas/` directories for npm publishing.

```
canon/
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
    ├── cli-output.v1.schema.json       # CLI output event schema (v1)
    ├── profile.schema.json             # Profile configuration schema (v1)
    ├── gates.schema.json               # Safety gates schema (v1)
    ├── runner.stack.schema.json        # Runner stack schema (v1)
    └── runner.scope.schema.json        # Runner scope schema (v1)
```

### Build Process: Canon → Package

The build process copies canon assets to package directories for npm publishing:

1. **`npm run prebuild`** (runs automatically before build)
   - Executes `npm run copy-canon`
   - Copies `canon/prompts/` → `prompts/`
   - Copies `canon/schemas/` → `schemas/`

2. **`npm run build`**
   - Compiles TypeScript to `dist/`
   - Published package includes `prompts/` and `schemas/` directories

3. **Published Package Structure**
   ```
   lex/
   ├── dist/                   # Compiled code
   ├── prompts/                # Published prompt templates
   │   ├── idea.md
   │   └── create-project.md
   └── schemas/                # Published schemas
       ├── *.json              # JSON schemas
       ├── *.ts                # Zod TypeScript schemas
       ├── *.js                # Compiled Zod schemas
       └── *.d.ts              # Type declarations
   ```

4. **Package Exports**
   - `lex/prompts/*` → `./prompts/*`
   - `lex/schemas/*` → `./schemas/*`
   - `lex/schemas/*.json` → `./schemas/*.json`
   - `lex/schemas/feature-spec-v0` → Zod schema with types
   - `lex/schemas/execution-plan-v1` → Zod schema with types

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

3. **runner.stack.schema.json** - Runner execution stack configuration
   - Stack component definitions
   - Timeout and retry settings

4. **runner.scope.schema.json** - Runner execution scope and boundaries
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

3. **`canon/prompts/`** (lowest priority) - Tracked canon
   - Version-controlled default templates
   - Always available as fallback

### Examples

**Use canon prompt:**
```typescript
import { loadPrompt } from 'lex/shared/prompts/loader';

const prompt = loadPrompt('idea.md');
// Loads from canon/prompts/idea.md (or published prompts/ in installed package)
```

**Override with local version:**
```bash
# Create local override
mkdir -p .smartergpt.local/prompts
cp canon/prompts/idea.md .smartergpt.local/prompts/idea.md
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

# Build artifacts (copied from canon/)
/prompts/
/schemas/
```

Canon files in `canon/` are tracked in git. The `prompts/` and `schemas/` directories are build artifacts generated from canon during the build process and are not tracked.

## Adding New Schemas

To add a new schema:

1. Create the schema file in `canon/schemas/`
2. Follow JSON Schema draft-07 or draft/2020-12 format
3. Include `$schema` and `$id` properties
4. Stage and commit: `git add canon/schemas/your-schema.json`
5. Update this document with schema details
6. Add validation tests in `test/schemas/`
7. Run build to copy to package directory: `npm run build`

## Cross-Repository Usage

From LexRunner or other repositories:

```typescript
// Import schemas (Zod)
import { FeatureSpecV0Schema } from 'lex/schemas/feature-spec-v0';
import { ExecutionPlanV1Schema } from 'lex/schemas/execution-plan-v1';

// Import JSON schemas
import profileSchema from 'lex/schemas/profile.schema.json';
import gatesSchema from 'lex/schemas/gates.schema.json';

// Access prompts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ideaPrompt = fs.readFileSync(
  path.join(__dirname, 'node_modules/lex/prompts/idea.md'),
  'utf-8'
);
```

## References

- Canon source files: `canon/prompts/`, `canon/schemas/`
- Published package directories: `prompts/`, `schemas/` (build artifacts)
- `src/shared/prompts/loader.ts` - Prompt loader implementation
- `src/shared/policy/loader.ts` - Policy loader implementation
- `src/memory/store/db.ts` - Database initialization
- `scripts/copy-canon.sh` - Build script to copy canon → package directories
