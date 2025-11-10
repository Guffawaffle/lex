# L-SCHEMAS Implementation

This directory contains Zod schemas and prompt templates for the LexRunner integration.

## Schemas

### Feature Spec v0 (`feature-spec-v0`)

Captures feature ideas with title, description, acceptance criteria, and technical context.

**Usage:**
```typescript
import { FeatureSpecV0Schema, type FeatureSpecV0 } from 'lex/schemas/feature-spec-v0';

const spec: FeatureSpecV0 = {
  schemaVersion: '0.1.0',
  title: 'My Feature',
  description: 'Feature description',
  acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
  repo: 'owner/repo',
  createdAt: new Date().toISOString()
};

// Validate
FeatureSpecV0Schema.parse(spec);
```

**Schema Version:** `0.1.0`

**Required Fields:**
- `schemaVersion` - Must be "0.1.0"
- `title` - Feature title (1-200 chars)
- `description` - Brief description (1-2000 chars)
- `acceptanceCriteria` - Array of testable criteria (1-20 items)
- `repo` - Target repository in format "owner/repo"
- `createdAt` - ISO 8601 timestamp

**Optional Fields:**
- `technicalContext` - Technical context (max 2000 chars)
- `constraints` - Constraints or limitations (max 1000 chars)

### Execution Plan v1 (`execution-plan-v1`)

Defines Epic + Sub-Issues with dependency graph for project creation.

**Usage:**
```typescript
import { ExecutionPlanV1Schema, type ExecutionPlanV1 } from 'lex/schemas/execution-plan-v1';

const plan: ExecutionPlanV1 = {
  schemaVersion: '1.0.0',
  sourceSpec: { /* FeatureSpecV0 */ },
  epic: {
    title: 'Epic Title',
    description: 'Epic description',
    acceptanceCriteria: ['AC1']
  },
  subIssues: [
    {
      id: 'feature-impl',
      title: 'Implement feature',
      description: 'Implementation details',
      type: 'feature',
      acceptanceCriteria: ['AC1'],
      dependsOn: []
    }
  ],
  createdAt: new Date().toISOString()
};

// Validate
ExecutionPlanV1Schema.parse(plan);
```

**Schema Version:** `1.0.0`

**Sub-Issue Types:**
- `feature` - Core implementation work
- `testing` - Unit, integration, E2E tests
- `docs` - User-facing documentation

## Prompts

### Idea Prompt (`prompts/idea.md`)

Template for the `lex-pr idea` command. Guides the AI to:
1. Clarify acceptance criteria
2. Identify technical context
3. Flag risks & blockers
4. Suggest implementation approach

### Create Project Prompt (`prompts/create-project.md`)

Template for the `lex-pr create-project` command. Guides the AI to:
1. Break down feature into Epic + Sub-Issues
2. Define dependency graph
3. Apply dependency rules (testing depends on feature, docs depends on feature)

## Files

```
.smartergpt/
├── schemas/
│   ├── feature-spec-v0.json        # JSON Schema (draft-07)
│   ├── feature-spec-v0.ts          # Zod schema (TypeScript)
│   ├── feature-spec-v0.js          # Compiled JavaScript
│   ├── feature-spec-v0.d.ts        # TypeScript declarations
│   ├── execution-plan-v1.json      # JSON Schema (draft-07)
│   ├── execution-plan-v1.ts        # Zod schema (TypeScript)
│   ├── execution-plan-v1.js        # Compiled JavaScript
│   └── execution-plan-v1.d.ts      # TypeScript declarations
└── prompts/
    ├── idea.md                     # Prompt for idea command
    └── create-project.md           # Prompt for create-project command
```

## Testing

Run schema tests:
```bash
npx tsx --test test/schemas/*.test.ts
```

Validate examples:
```bash
node examples/schemas/validate-examples.mjs
```

## Cross-Repo Usage

From LexRunner repository:

```typescript
// Import schemas
import { FeatureSpecV0Schema } from 'lex/schemas/feature-spec-v0';
import { ExecutionPlanV1Schema } from 'lex/schemas/execution-plan-v1';

// Import types
import type { FeatureSpecV0 } from 'lex/schemas/feature-spec-v0';
import type { ExecutionPlanV1, SubIssue } from 'lex/schemas/execution-plan-v1';
```

## Dependencies

This implementation blocks:
- Guffawaffle/lex-pr-runner#359 — X-VALIDATION
- Guffawaffle/lex-pr-runner#355 — R1: `lex-pr idea`
- Guffawaffle/lex-pr-runner#356 — R2: `lex-pr create-project`
- Guffawaffle/lex-pr-runner#357 — R3: Safety gates
- Guffawaffle/lex-pr-runner#358 — R4: Documentation
