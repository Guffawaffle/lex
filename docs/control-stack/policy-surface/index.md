# Policy Surface

> The machine-readable encoding of human judgment.

## What it is

The **Policy Surface** is the boundary layer where human judgment about risk, scope, and acceptable behavior gets encoded into rules a control stack can enforce. It's the configuration that tells the system: what's allowed, what's forbidden, and what requires escalation.

Policy isn't enforced by hoping the model follows instructions. It's enforced by the structure around the model.

---

## Why it exists

Models don't have inherent judgment about:
- Which modules are high-risk and need extra review
- What blast radius is acceptable for different task types
- Which file patterns should never be edited automatically
- When to escalate instead of proceeding

Humans have this judgment. The policy surface captures it in a form that:
- Can be version-controlled alongside code
- Is readable by both humans and machines
- Applies consistently across sessions
- Updates without retraining the model

---

## What it defines

### Module Ownership & Risk Tiers

```yaml
modules:
  auth/:
    risk: high
    owners: ["security-team"]
    requires_review: true

  docs/:
    risk: low
    owners: ["*"]
```

### Allowed and Forbidden Edges

```yaml
boundaries:
  forbidden:
    - from: "src/**"
      to: "node_modules/**"
      action: "write"

  allowed:
    - from: "tests/**"
      to: "src/**"
      action: "read"
```

### Blast Radius Limits

```yaml
limits:
  max_files_per_operation: 5
  max_lines_changed: 200
  max_new_dependencies: 0
```

### Mode Configurations

```yaml
modes:
  conservative:
    required_gates: ["lint", "typecheck", "tests"]
    allowed_tools: ["read_file", "edit_file", "run_tests"]

  fast_lane:
    required_gates: ["lint"]
    allowed_tools: ["read_file", "edit_file"]
```

---

## How it feeds other concepts

The policy surface is the source of truth that configures everything else:

| Concept | What policy provides |
|---------|---------------------|
| [Modes](../modes/) | What's allowed in each mode, which gates required |
| [Gates](../gates/) | Which gates exist, which are required vs optional |
| [Scope & Blast Radius](../scope-and-blast-radius/) | Maximum allowable changes |
| [Epistemic Guardrails](../epistemic-guardrails/) | When to escalate vs proceed |

---

## Lex Implementation

In Lex, policy is defined in `lexmap.policy.json`:

```json
{
  "version": "1.0.0",
  "modules": { ... },
  "boundaries": { ... },
  "gates": { ... }
}
```

See the [Policy File Specification](../../specs/) for the full schema.

---

## The Key Insight

Policy surfaces externalize judgment. Instead of embedding "be careful with auth code" in a prompt and hoping the model complies, you encode it as a rule:

```yaml
auth/:
  risk: high
  requires_review: true
```

Now the control stack enforces it. The model doesn't need to remember—the structure remembers for it.

---

## Related concepts

- [Modes](../modes/) — Defined by the policy surface
- [Gates](../gates/) — Configured by the policy surface
- [Scope & Blast Radius](../scope-and-blast-radius/) — Limited by the policy surface
- [Epistemic Guardrails](../epistemic-guardrails/) — Escalation rules live here
