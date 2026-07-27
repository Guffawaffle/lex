# Policy Neighborhood and Code Index

This compatibility guide covers two independent systems whose existing APIs still use Atlas
names. A **Policy Neighborhood** gives an agent bounded nearby-module context around recalled
work. The experimental **Code Index** extracts source symbols and provenance. The historical
**Frame Graph** is a third system and is not part of either workflow below.

Policy Neighborhood enrichment is optional. Frame capture and recall still work when no policy
exists; the result simply does not include policy-backed nearby-module context.

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

Recall expands the module scope into a Policy Neighborhood. Current output and APIs retain the
legacy `AtlasFrame` name:

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
without pretending a Policy Neighborhood was validated.

## Code Index extraction

The legacy-named `code-atlas` command is a separate, experimental Code Index surface. It discovers
source units and can emit a policy seed for review:

```bash
lex code-atlas --repo . --max-files 500 --out ./code-atlas.json
lex code-atlas --repo . --policy-seed ./policy-seed.yaml
```

The extractor currently recognizes TypeScript/JavaScript and Python source patterns. Generated
output is evidence, not authority: review ownership, module names, and relationships before using
a seed as repository policy.

`CodeUnit` and `CodeAtlasRun` retain compatibility names as provenance schemas for extraction. They
do not by themselves grant access or enforce module boundaries.

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

`@smartergpt/lex/atlas` is a legacy compatibility barrel containing Policy Neighborhood, Frame
Graph, and Code Index symbols. `@smartergpt/lex/atlas/schemas` contains Code Index extraction-run
and policy-seed schemas. Historical source imports such as `@smartergpt/lex/shared/atlas` are not
public.

## Frame Graph boundary

The Frame Graph derives relationships among historical Frames. Its existing `rebuildAtlas`,
validation, queue, and manager APIs are compatibility surfaces with no identified first-party
production caller. It is unrelated to policy-neighborhood enrichment and Code Index extraction;
see the [terminology map](../ATLAS_TERMINOLOGY.md) before using those APIs.

## Security boundary

Policy Neighborhood, Code Index, and Frame Graph data describes or derives context; none authorizes
tenant, workspace, repository, or filesystem access. A trusted host must first resolve an
`AuthorizedScope` and authorized request-local inputs. It must not fall back to ambient paths or
process-global policy when serving multiple workspaces.

## See also

- [Repository Policy Guide](../API_USAGE.md)
- [Terminology and compatibility map](../ATLAS_TERMINOLOGY.md)
- [Runtime Scope Contract](../RUNTIME_SCOPE_CONTRACT.md)
- [Public Package API](../PUBLIC_API.md)
- [Current Limitations](../LIMITATIONS.md)
