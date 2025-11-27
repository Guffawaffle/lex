# ADR-0007: Safety-First Defaults

**Status:** Proposed
**Date:** 2025-11-25
**Authors:** Lex, Guff, Opie

---

## Context

AI development workflows involve significant risk: models can make confident but incorrect changes, tests can be skipped, and blast radius can exceed intent. The question: what should the default posture be?

Two approaches:
1. **Permissive defaults** — Everything optional, user opts into constraints
2. **Safe defaults** — Everything required, user explicitly relaxes

---

## Decision

We adopt **safety-first defaults**: constraints are on by default, and users must explicitly opt out.

### Required Gates by Default

```yaml
gates:
  - name: lint
    run: npm run lint
    required: true  # DEFAULT - explicit override needed to make optional

  - name: e2e
    run: npm run e2e
    required: false  # User explicitly chose to make this optional
```

**Principle:** If `required` is not specified, the gate is required. This prevents accidental skips.

### Extension Namespace for Engine-Specific Features

Base spec fields are public and engine-agnostic. Engine-specific extensions use namespaced fields:

```yaml
gates:
  - name: lint
    run: npm run lint
    x-lexrunner-retry:
      maxAttempts: 2
      backoffSeconds: 30
```

**Principle:** Extensions never pollute the base spec. Other engines ignore `x-lexrunner-*` fields.

### Fail-Closed on Unknown Fields

When a spec parser encounters unknown top-level fields (not in `x-*` namespace):
- **Warn** at minimum
- **Fail** if strict mode is enabled

This prevents typos from silently disabling expected behavior.

### Explicit Override Policy

Override mechanisms (e.g., admin-green, skip-gate) must:
1. Be declared in policy, not ad-hoc
2. Require explicit justification
3. Be logged in receipts

```yaml
overrides:
  admin-green:
    allowed_users: ["repo-admins"]
    require_reason: true
    audit: always
```

---

## Consequences

### Positive

- **Safe by default** — New users get the safest configuration
- **Visible relaxation** — Every opt-out is explicit and auditable
- **Reduced accidents** — Typos and omissions don't create security gaps
- **Trust gradient** — Start strict, relax as confidence builds

### Negative

- **More verbose** — Safe configs may require more explicit fields
- **Learning curve** — Users must understand the required/optional model
- **Migration friction** — Existing permissive configs need updates

---

## Implementation Status

- ✅ Required gates concept documented
- ✅ Extension namespace (`x-*`) pattern established
- ⏳ Zod schema enforcement of defaults pending
- ⏳ Strict mode for unknown fields pending
