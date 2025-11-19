# Prepare lex 0.4.0-alpha for npm (scanner relocation & packaging cleanup)

## Summary

This PR finishes preparing `lex` for the `0.4.0-alpha` npm release.

It relocates external scanners into clearly optional examples, cleans up internal artifacts, aligns the published tarball with the documented surface, and tightens package metadata so new users can install and experiment without tripping over internal infrastructure.

---

## Changes

### 1. Scanner relocation and tests

- Moved Python/PHP scanners to `examples/scanners/` and added a dedicated README:
  - TypeScript scanner is the primary supported implementation.
  - Python/PHP scanners are optional examples that require their own runtimes.
  - `lex check` consumes scanner JSON output; it does not run scanners directly.
- Updated `src/policy/scanners/README.md` to focus on the TypeScript scanner and point to `examples/scanners/`.
- Updated `src/policy/scanners/test_scanners.ts`:
  - Always runs the TypeScript scanner tests.
  - Gates external scanner integration tests behind `LEX_ENABLE_EXTERNAL_SCANNER_TESTS=1`.
  - Uses an ESM-safe `__dirname` replacement via `fileURLToPath`.
  - Skips external tests cleanly when the env flag is not set with explicit messaging.

### 2. Lint baseline and artifact cleanup

- Removed `lint-baseline.json` from git (was a large but effectively empty array).
- Added `lint-baseline.json` to `.gitignore` alongside `current-lint.json`.
- Confirmed `npm run lint` passes with 107 warnings and 0 errors, without hiding issues behind a baseline.
- Confirmed no other tracked-but-gitignored artifacts remain.

### 3. CLI TODOs and frame types

- Cleaned `src/shared/cli/index.ts`:
  - Removed commented-out CLI wiring for `db` and `frames export` commands that are not shipping in 0.4.0-alpha.
  - Eliminated ghost commands from the help surface while keeping the feature space as backlog items instead of TODO comments in user-facing code.
- Clarified `src/memory/frames/types.ts`:
  - Replaced a vague TODO with an explicit note about the split between:
    - Zod schemas (runtime validation), and
    - Shared TypeScript types (canonical static typing).
  - Left a clear path for future unification without blocking this release.

### 4. MCP symlink and launcher behavior

- Tracked `memory/mcp_server/frame-mcp.mjs` symlink in git:
  - This is the stable MCP server entrypoint required by `lex-launcher.sh`.
  - Ensures the documented MCP launch path works from a clean checkout and in the published package.
- Verified `.gitignore` still only ignores build outputs under `memory/frames/*.js` and `*.d.ts`, not the MCP entrypoint.

### 5. Packaging and tarball layout

- Updated `.npmignore` and `package.json` `files` to produce a sane tarball:
  - Excluded `.smartergpt/` and other internal dev plumbing.
  - Included:
    - `dist/` compiled JS and type declarations.
    - `README.md`, `CHANGELOG.md`, `LICENSE`.
    - `prompts/`, `schemas/`, and `policy/` user-facing assets.
    - `examples/`, including `examples/scanners/` and its README.
- Removed a broken schema export for a non-existent `execution-plan-v1` file.
- Updated README references to point at `schemas/` instead of legacy `.smartergpt/schemas` paths.

### 6. package.json metadata

- Set the version explicitly to `0.4.0-alpha`.
- Improved description to match the current surface (frames, policy scanners, MCP, atlas/fold-radius).
- Added standard metadata:
  - `repository`
  - `bugs`
  - `homepage`
- Expanded keywords for better discovery (memory, policy, frames, atlas, fold-radius, MCP, TypeScript, policy-scanner).

### 7. CHANGELOG updates

- Added a concise "Repository Cleanup" entry for 0.4.0-alpha summarizing:
  - Scanner relocation and clarification.
  - Removal of deprecated FrameStore class and internal artifacts.
  - Packaging and MCP entrypoint cleanup.
  - Lint baseline removal.

---

## Lint triage and tech debt (post-alpha)

Lint is intentionally not "perfect" for this alpha, but nothing is hidden:

- 107 warnings across a small number of rules:
  - `no-unused-vars` on tests and some helpers.
  - `no-explicit-any` and related `no-unsafe-*` rules in MCP server, queries, and renderers.
- Follow-up work is tracked conceptually as:
  - Clean up unused vars/imports.
  - Add proper types for MCP tool arguments.
  - Add types for DB query results.
  - Add types for template renderer inputs.

These are non-blocking for the alpha, but represent clear next steps.

---

## Verification

All commands run from a clean working tree:

- `npm test` → 123 / 123 passing.
- `npm run lint` → 107 warnings, 0 errors (no baseline).
- `npm run build` → successful.
- `npm pack --dry-run` → ~270 files, ~207 kB; no internal `.smartergpt/` contents; scanners and CHANGELOG included.

---

## Release notes

Once merged, the release flow for 0.4.0-alpha should be:

1. Tag the commit: `git tag v0.4.0-alpha`
2. Build and smoke test: `npm run build && npm test`
3. Publish to npm with alpha tag: `npm publish --tag alpha`
4. Open follow-up issues for lint/typing cleanup as needed.
