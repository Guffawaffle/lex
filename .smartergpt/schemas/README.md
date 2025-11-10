# JSON Schema Validation

This directory contains JSON schemas and corresponding Zod schemas for runtime validation and type safety.

## Schema Files

Each schema typically has three files:
- `*.schema.json` - JSON Schema (draft-07) for validation
- `*.schema.ts` - Zod schema for TypeScript validation
- `*.schema.js` + `*.schema.d.ts` - Compiled TypeScript outputs

## Available Schemas

### Profile Configuration (`profile.schema.json`)
Runtime profile configuration (development, local, CI, etc.)

**Required fields:**
- `role`: Runtime environment (`development`, `local`, `example`, `ci`, `custom`)

**Optional fields:**
- `name`: Human-readable name
- `version`: Profile version
- `projectType`: Project type (`nodejs`, `python`, `generic`)
- `created`: ISO 8601 timestamp
- `owner`: Owner or creator

### Gates Configuration (`gates.schema.json`)
Safety gates and validation rules

**Optional fields:**
- `version`: Schema version
- `gates`: Array of gate definitions
  - `id`: Unique identifier (required)
  - `type`: Gate type - `validation`, `approval`, or `check` (required)
  - `enabled`: Whether gate is enabled (required)
  - `description`: Human-readable description
  - `config`: Gate-specific configuration (loose object)

### Runner Stack Configuration (`runner.stack.schema.json`)
Runner execution stack configuration

**Optional fields:**
- `version`: Schema version
- `stack`: Array of stack components
  - `name`: Component name (required)
  - `type`: Component type (required)
  - `enabled`: Whether component is enabled
  - `config`: Component-specific configuration (loose object)
- `timeout`: Default timeout in seconds
- `retries`: Number of retry attempts

### Runner Scope Configuration (`runner.scope.schema.json`)
Runner execution scope and boundaries

**Optional fields:**
- `version`: Schema version
- `scope`: Scope boundaries
  - `modules`: List of modules in scope
  - `directories`: List of directories in scope
  - `files`: List of specific files in scope
  - `exclude`: Patterns to exclude from scope
- `permissions`: Required permissions
- `limits`: Resource limits
  - `maxFiles`: Maximum number of files
  - `maxLines`: Maximum number of lines
  - `maxDuration`: Maximum execution duration in seconds

### Feature Spec v0 (`feature-spec-v0.json`)
Feature specification for idea capture

**Required fields:**
- `schemaVersion`: Must be `"0.1.0"`
- `title`: Feature title (1-200 characters)
- `description`: Feature description (1-2000 characters)
- `acceptanceCriteria`: Array of testable criteria (1-20 items)
- `repo`: Target repository (`owner/repo` format)
- `createdAt`: ISO 8601 timestamp

**Optional fields:**
- `technicalContext`: Technical details (max 2000 characters)
- `constraints`: Constraints or limitations (max 1000 characters)

### Execution Plan v1 (`execution-plan-v1.json`)
Project execution plan with Epic and Sub-Issues

**Required fields:**
- `schemaVersion`: Must be `"1.0.0"`
- `sourceSpec`: Source Feature Spec v0
- `epic`: Epic definition
  - `title`: Epic title
  - `description`: Epic description
  - `acceptanceCriteria`: Array of criteria
- `subIssues`: Array of sub-issues (min 1)
  - `id`: Unique identifier (lowercase, numbers, hyphens)
  - `title`: Sub-issue title
  - `description`: Sub-issue description
  - `type`: Type (`feature`, `testing`, `docs`)
  - `acceptanceCriteria`: Array of criteria
  - `dependsOn`: Array of dependency IDs
- `createdAt`: ISO 8601 timestamp

## Schema Validation

All schemas enforce:
- `$id`: Unique schema identifier (`https://guffawaffle.dev/schemas/lex/*`)
- `$schema`: Draft-07 JSON Schema
- `additionalProperties: false`: Strict validation (except for config objects marked as intentionally loose)
- `format: "date-time"`: ISO 8601 timestamps

## Usage

### TypeScript/JavaScript (Zod)

```typescript
import { ProfileSchema } from '@guffawaffle/lex/schemas/profile.schema.js';

const profile = {
  role: 'development',
  name: 'Dev Profile'
};

const result = ProfileSchema.safeParse(profile);
if (result.success) {
  console.log('Valid:', result.data);
} else {
  console.error('Invalid:', result.error.errors);
}
```

### JSON Schema Validation (AJV)

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import profileSchema from '@guffawaffle/lex/schemas/profile.schema.json';

const ajv = new Ajv({ strict: true });
addFormats(ajv);
const validate = ajv.compile(profileSchema);

if (validate(profile)) {
  console.log('Valid');
} else {
  console.error('Invalid:', validate.errors);
}
```

## Testing

Run schema validation tests:
```bash
npm run test:schemas
```

Tests include:
- JSON Schema validation with AJV (29 tests)
- Zod schema validation (21 tests)  
- Round-trip Zod ↔ JSON Schema compatibility (14 tests)

## Development

When modifying schemas:

1. Update the JSON schema (`.schema.json`)
2. Update the corresponding Zod schema (`.schema.ts`)
3. Compile TypeScript: `npx tsc .smartergpt/schemas/*.schema.ts --module es2022 --target es2022 --declaration --moduleResolution bundler`
4. Run tests: `npx tsx --test test/schemas/validation.test.ts test/schemas/round-trip.test.ts`
5. Ensure Zod and JSON schemas are aligned (required fields, types, enums)

## References

- [JSON Schema Draft-07](https://json-schema.org/draft-07/json-schema-release-notes.html)
- [Zod Documentation](https://zod.dev/)
- [AJV JSON Schema Validator](https://ajv.js.org/)
