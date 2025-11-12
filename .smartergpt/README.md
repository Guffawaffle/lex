# L-SCHEMAS Implementation

This directory contains hardened JSON Schemas and TypeScript Zod schemas for the LexRunner integration.

## Schemas

### Configuration Schemas (JSON Schema draft-07)

All JSON Schema files use **draft-07** with strict validation (`additionalProperties: false`) and proper `$id` URLs.

#### Profile Schema v1 (`profile.schema.json`)

Defines runtime profile configuration for different environments.

**Schema ID:** `https://guffawaffle.dev/schemas/lex/profile.schema.json`

**Required Fields:**
- `role` - Runtime environment: "development", "local", "example", "ci", "custom"

**Optional Fields:**
- `name` - Human-readable profile name
- `version` - Profile version string
- `projectType` - Project type: "nodejs", "python", "generic"
- `created` - ISO 8601 timestamp (format: date-time)
- `owner` - Profile owner/creator

**Example Usage:**
```yaml
$schema: "../.smartergpt/schemas/profile.schema.json"
role: development
name: "Local Development"
version: "1.0.0"
projectType: nodejs
created: "2025-11-09T12:00:00Z"
owner: "username"
```

**TypeScript Usage:**
```typescript
import { ProfileSchema, type Profile } from 'lex/.smartergpt/schemas/profile.schema.js';

const profile: Profile = {
  role: 'development',
  name: 'Test Profile',
  projectType: 'nodejs'
};

// Validate
ProfileSchema.parse(profile);
```

#### Gates Schema v1 (`gates.schema.json`)

Defines safety gates and validation rules.

**Schema ID:** `https://guffawaffle.dev/schemas/lex/gates.schema.json`

**Properties:**
- `version` - Schema version
- `gates` - Array of gate definitions
  - `id` - Unique gate identifier (required)
  - `type` - Gate type: "validation", "approval", "check" (required)
  - `enabled` - Boolean flag (required)
  - `description` - Gate description (optional)
  - `config` - Gate-specific configuration (optional, intentionally loose)

**TypeScript Usage:**
```typescript
import { GatesSchema, type Gates } from 'lex/.smartergpt/schemas/gates.schema.js';
```

#### Runner Stack Schema v1 (`runner.stack.schema.json`)

Defines runner execution stack configuration.

**Schema ID:** `https://guffawaffle.dev/schemas/lex/runner.stack.schema.json`

**Properties:**
- `version` - Schema version
- `stack` - Array of stack components
  - `name` - Component name (required)
  - `type` - Component type (required)
  - `enabled` - Boolean flag (optional, default: true)
  - `config` - Component-specific configuration (optional, intentionally loose)
- `timeout` - Default timeout in seconds
- `retries` - Number of retry attempts

**TypeScript Usage:**
```typescript
import { RunnerStackSchema, type RunnerStack } from 'lex/.smartergpt/schemas/runner.stack.schema.js';
```

#### Runner Scope Schema v1 (`runner.scope.schema.json`)

Defines runner execution scope and boundaries.

**Schema ID:** `https://guffawaffle.dev/schemas/lex/runner.scope.schema.json`

**Properties:**
- `version` - Schema version
- `scope` - Scope boundaries
  - `modules` - Array of module names
  - `directories` - Array of directory paths
  - `files` - Array of file paths
  - `exclude` - Array of exclusion patterns
- `permissions` - Required permissions array
- `limits` - Resource limits
  - `maxFiles` - Maximum files to modify
  - `maxLines` - Maximum lines to change
  - `maxDuration` - Maximum execution time in seconds

**TypeScript Usage:**
```typescript
import { RunnerScopeSchema, type RunnerScope } from 'lex/.smartergpt/schemas/runner.scope.schema.js';
```

### Feature & Execution Schemas

#### Feature Spec v0 (`feature-spec-v0`)

Captures feature ideas with title, description, acceptance criteria, and technical context.

**Schema ID:** `https://guffawaffle.dev/schemas/lex/feature-spec-v0.json`

**Usage:**
```typescript
import { FeatureSpecV0Schema, type FeatureSpecV0 } from 'lex/schemas/feature-spec-v0';

const spec: FeatureSpecV0 = {
  schemaVersion: '0.1.0',
  title: 'My Feature',
  description: 'Feature description',
  acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
  technicalContext: 'Technical details',
  constraints: 'Limitations',
  repo: 'owner/repo',
  createdAt: new Date().toISOString()
};

// Validate
FeatureSpecV0Schema.parse(spec);
```

**Schema Version:** `0.1.0`

**Required Fields:**
- `schemaVersion` - Must match pattern `^\d+\.\d+\.\d+$`
- `title` - Feature title
- `description` - Brief description
- `repo` - Target repository in format "owner/repo"

**Optional Fields:**
- `acceptanceCriteria` - Array of testable criteria
- `technicalContext` - Technical context
- `constraints` - Constraints or limitations
- `createdAt` - ISO 8601 timestamp (format: date-time)

#### Execution Plan v1 (`execution-plan-v1`)

Defines Epic + Sub-Issues with dependency graph for project creation.

**Schema ID:** `https://guffawaffle.dev/schemas/lex/execution-plan-v1.json`

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
- `refactor` - Code refactoring
- `bug` - Bug fixes

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
│   ├── execution-plan-v1.d.ts      # TypeScript declarations
│   ├── profile.schema.json         # JSON Schema (draft-07)
│   ├── profile.schema.ts           # Zod schema (TypeScript)
│   ├── profile.schema.js           # Compiled JavaScript
│   ├── profile.schema.d.ts         # TypeScript declarations
│   ├── gates.schema.json           # JSON Schema (draft-07)
│   ├── gates.schema.ts             # Zod schema (TypeScript)
│   ├── gates.schema.js             # Compiled JavaScript
│   ├── gates.schema.d.ts           # TypeScript declarations
│   ├── runner.stack.schema.json    # JSON Schema (draft-07)
│   ├── runner.stack.schema.ts      # Zod schema (TypeScript)
│   ├── runner.stack.schema.js      # Compiled JavaScript
│   ├── runner.stack.schema.d.ts    # TypeScript declarations
│   ├── runner.scope.schema.json    # JSON Schema (draft-07)
│   ├── runner.scope.schema.ts      # Zod schema (TypeScript)
│   ├── runner.scope.schema.js      # Compiled JavaScript
│   ├── runner.scope.schema.d.ts    # TypeScript declarations
│   └── tsconfig.json               # TypeScript build configuration
└── prompts/
    ├── idea.md                     # Prompt for idea command
    └── create-project.md           # Prompt for create-project command
```

## Schema Validation

All schemas are hardened with:
- ✅ JSON Schema draft-07
- ✅ Strict `additionalProperties: false` (except intentionally loose config objects)
- ✅ Proper `$id` URLs using https://guffawaffle.dev/schemas/lex/
- ✅ All timestamp fields use `"format": "date-time"`
- ✅ Zod schemas align with JSON schemas for round-trip compatibility
- ✅ Comprehensive validation tests with AJV
- ✅ Round-trip tests demonstrating Zod ↔ JSON equivalence

## Testing

Run all schema tests:
```bash
npm test test/schemas
```

Run validation tests only:
```bash
npx tsx --test test/schemas/validation.test.ts
```

Run round-trip tests only:
```bash
npx tsx --test test/schemas/round-trip.test.ts
```

**Test Results:**
- 36 validation tests (AJV)
- 13 round-trip tests (Zod ↔ JSON)
- All tests passing ✅

## Cross-Repo Usage

From LexRunner repository:

```typescript
// Import schemas
import { FeatureSpecV0Schema } from 'lex/schemas/feature-spec-v0';
import { ExecutionPlanV1Schema } from 'lex/schemas/execution-plan-v1';
import { ProfileSchema } from 'lex/.smartergpt/schemas/profile.schema.js';

// Import types
import type { FeatureSpecV0 } from 'lex/schemas/feature-spec-v0';
import type { ExecutionPlanV1, SubIssue } from 'lex/schemas/execution-plan-v1';
import type { Profile } from 'lex/.smartergpt/schemas/profile.schema.js';
```

## Dependencies

This implementation blocks:
- Guffawaffle/lex-pr-runner#359 — X-VALIDATION
- Guffawaffle/lex-pr-runner#355 — R1: `lex-pr idea`
- Guffawaffle/lex-pr-runner#356 — R2: `lex-pr create-project`
- Guffawaffle/lex-pr-runner#357 — R3: Safety gates
- Guffawaffle/lex-pr-runner#358 — R4: Documentation
