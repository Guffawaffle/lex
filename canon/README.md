# Canon Directory

This directory contains the canonical source for prompts and schemas that are published with the `@guffawaffle/lex` package.

## Structure

```
canon/
├── prompts/         # Prompt templates (Markdown)
└── schemas/         # JSON schemas and TypeScript validators
```

## Build Process

During the build process (`npm run build`):

1. TypeScript code is compiled to `dist/`
2. `canon/prompts/` is copied to `prompts/` (via `npm run copy-canon`)
3. `canon/schemas/` is copied to `schemas/` (via `npm run copy-canon`)

The generated `prompts/` and `schemas/` directories are:
- Published in the npm package
- Excluded from git (via `.gitignore`)
- Used as default locations for prompt/schema loading

## Publishing

The `canon/` directory itself is **NOT** published to npm (excluded via `.npmignore`). Only the copied `prompts/` and `schemas/` directories are included in the package.

## Validation

JSON schemas are validated during CI using AJV:

```bash
npm run validate-schemas
```

All schemas must:
- Use JSON Schema draft-07
- Be valid according to the JSON Schema meta-schema
- Not include build artifacts (`.js`, `.d.ts`, `.tsbuildinfo`)

## Precedence Chain

When the package is installed, prompts and schemas are loaded with this precedence:

1. **Environment override:** `LEX_CANON_DIR=/path/to/custom-canon` (loads from `/path/to/custom-canon/prompts/` and `/path/to/custom-canon/schemas/`)
2. **Local overlay:** `.smartergpt.local/prompts/` and `.smartergpt.local/schemas/` (user customizations, not tracked)
3. **Package defaults:** `prompts/` and `schemas/` (from this canon/ directory)

## Adding New Prompts

1. Create a new `.md` file in `canon/prompts/`
2. Build the package: `npm run build`
3. The prompt will be copied to `prompts/` and included in the package

## Adding New Schemas

1. Create or update `.json` schema files in `canon/schemas/`
2. Optionally create TypeScript validators (`.ts` files)
3. Validate schemas: `npm run validate-schemas`
4. Build the package: `npm run build`
5. The schemas will be copied to `schemas/` and included in the package

## Determinism

The build is tested for determinism in CI. Multiple builds with the same source must produce identical `prompts/` and `schemas/` directories.
