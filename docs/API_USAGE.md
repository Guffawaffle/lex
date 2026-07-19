# Repository Policy Guide

Lex policy gives Frames and static checks a shared vocabulary for repository boundaries. It is an
optional layer: you can start with `--modules unscoped`, add a policy when module attribution is
useful, and keep the core remember/recall workflow independent of enforcement.

## When policy helps

Use policy when an agent should be able to answer questions such as:

- Which module owns this path?
- Which modules may call this boundary?
- Which architectural rule would this change violate?
- What nearby modules should accompany a recalled Frame?

Policy is not a permission system and does not authorize filesystem or database access. In a
trusted Lex 3 host, tenant and workspace authorization belongs to runtime authority and a
scope-bound store.

## Create or choose a policy

`lex init` can create `.smartergpt/lex/lexmap.policy.json` as part of the complete workspace
bootstrap. If you only need policy, create that file directly or keep a canonical checked-in copy
at `canon/policy/lexmap.policy.json`.

A small policy looks like this:

```json
{
  "modules": {
    "api/middleware": {
      "owns_paths": ["src/api/middleware/**"],
      "allowed_callers": ["app/server"],
      "forbidden_callers": ["ui/client"],
      "notes": "HTTP authentication and request validation"
    },
    "services/auth": {
      "owns_paths": ["src/services/auth/**"],
      "allowed_callers": ["api/middleware"]
    }
  },
  "global_kill_patterns": []
}
```

Module IDs may contain lowercase letters, digits, `_`, `-`, and `/`. Prefer stable architectural
names over temporary file or ticket names.

## Validate the policy

```bash
lex policy check
lex policy check --match --src-dir src
```

Use `--policy <path>` when the policy is not in the normal lookup locations. `--match` additionally
checks whether declared path ownership maps to the current codebase.

Add a module without hand-editing the container shape:

```bash
lex policy add-module services/payments
```

Review and complete its ownership and boundary fields afterward.

## Attribute Frames

Use exact policy IDs when you know them:

```bash
lex remember \
  --summary "Kept token validation in API middleware" \
  --next "Add password-reset coverage" \
  --modules "api/middleware,services/auth"
```

For a policy-backed repository, `--modules auto` asks Lex to infer a bounded scope from changed
paths, intent, branch state, and recent Frames. The stored attribution receipt records how the
scope was chosen. Use `--modules unscoped` when no useful ontology exists yet.

`--skip-policy` bypasses module validation for that write. It does not remove required Frame
fields or create an authorization boundary.

## Enforce scanned relationships

The low-level enforcement command compares merged scanner facts with a policy:

```bash
lex check merged-scanner-output.json .smartergpt/lex/lexmap.policy.json
```

Scanners emit structural facts; the checker interprets those facts against allowed and forbidden
relationships. Keep this step in CI only after the policy and scanner coverage accurately model
the repository. A false sense of coverage is worse than an explicitly partial policy.

## Use the public TypeScript API

```typescript
import {
  loadPolicy,
  validatePolicySchema,
} from "@smartergpt/lex/policy";

const policy = loadPolicy(".smartergpt/lex/lexmap.policy.json");
const result = validatePolicySchema(policy);

if (!result.valid) {
  console.error(result.errors);
}
```

Only package paths declared in the [public export inventory](./PUBLIC_API.md) are supported.
Source paths and historical imports such as `lex/memory/...` are internal. Lex does not currently
publish its internal HTTP ingestion server as a supported package entry point.

## Where policy fits

```text
repository paths ──→ module IDs ──→ Frame attribution and Atlas neighborhoods
                              └──→ scanner facts checked against boundaries
```

Policy answers architectural questions. Runtime scope answers who may access which tenant and
workspace. Keep those decisions separate.

## See also

- [Atlas guide](./atlas/README.md)
- [Runtime scope contract](./RUNTIME_SCOPE_CONTRACT.md)
- [Public package API](./PUBLIC_API.md)
- [Contract surface](./CONTRACT_SURFACE.md)
