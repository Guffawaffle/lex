# Atlas

Atlas gives an agent a bounded view of the code around the work it recalled. Instead of loading a
whole dependency graph, Lex starts with the Frame's module scope and expands only the nearby
relationships declared by repository policy.

Atlas is optional. Frame capture and recall still work when no policy exists; the result simply
does not include a policy-backed architectural neighborhood.

## Policy-backed Frame context

First define stable module IDs and relationships in `.smartergpt/lex/lexmap.policy.json` or
`canon/policy/lexmap.policy.json`. See the [Repository Policy Guide](../API_USAGE.md).

Capture a Frame with exact policy IDs:

```bash
lex remember \
  --reference-point "Authentication refresh" \
  --summary "Added JWT validation to API middleware" \
  --next "Wire up password reset" \
  --modules "services/auth,api/middleware"
```

Recall expands the module scope into an Atlas Frame:

```bash
lex recall "authentication"
lex recall "authentication" --fold-radius 2
lex recall "authentication" --auto-radius --max-tokens 5000
```

- radius `0` returns only the seed modules;
- radius `1` adds direct policy neighbors;
- larger radii walk more relationships and consume more context;
- `--auto-radius` selects a radius using Lex's approximate token estimate.

When the policy is missing or unreadable, recall reports that state and returns the core Frame
without pretending an Atlas neighborhood was validated.

## Code Atlas extraction

The `code-atlas` command is a separate static-analysis surface. It discovers source units and can
emit a policy seed for review:

```bash
lex code-atlas --repo . --max-files 500 --out ./code-atlas.json
lex code-atlas --repo . --policy-seed ./policy-seed.yaml
```

The extractor currently recognizes TypeScript/JavaScript and Python source patterns. Generated
output is evidence, not authority: review ownership, module names, and relationships before using
a seed as repository policy.

`CodeUnit` and `CodeAtlasRun` are provenance schemas for extraction. They do not by themselves
grant access or enforce module boundaries.

## Programmatic use

Use only declared package entry points:

```typescript
import {
  generateAtlasFrame,
  parseCodeUnit,
} from "@smartergpt/lex/atlas";
import { parseCodeAtlasRun } from "@smartergpt/lex/atlas/schemas";

const neighborhood = generateAtlasFrame(
  ["services/auth", "api/middleware"],
  1,
  ".smartergpt/lex/lexmap.policy.json",
);

const unit = parseCodeUnit({
  id: "auth-validator",
  repoId: "repo-1",
  filePath: "src/auth/validator.ts",
  language: "ts",
  kind: "class",
  symbolPath: "src/auth/validator.ts::JWTValidator",
  name: "JWTValidator",
  span: { startLine: 10, endLine: 50 },
  discoveredAt: new Date().toISOString(),
  schemaVersion: "code-unit-v0",
});

declare const serializedRun: unknown;
const run = parseCodeAtlasRun(serializedRun);

console.log(neighborhood.modules.length, unit.name, run);
```

`@smartergpt/lex/atlas` contains policy-graph and CodeUnit APIs.
`@smartergpt/lex/atlas/schemas` contains the extraction-run and policy-seed schemas. Historical
source imports such as `@smartergpt/lex/shared/atlas` are not public.

## Security boundary

Atlas describes nearby architecture; it does not authorize tenant, workspace, repository, or
filesystem access. A trusted host must first resolve an `AuthorizedScope` and an authorized policy
snapshot, then generate Atlas context from that request-local input. It must not fall back to
ambient paths or process-global policy when serving multiple workspaces.

## See also

- [Repository Policy Guide](../API_USAGE.md)
- [Runtime Scope Contract](../RUNTIME_SCOPE_CONTRACT.md)
- [Public Package API](../PUBLIC_API.md)
- [Current Limitations](../LIMITATIONS.md)
