# Epistemic Guardrails

> Making "I don't know" a valued output, not a failure.

## What it is

**Epistemic Guardrails** are mechanisms that reward honest uncertainty over false confidence. They create space for a model to say "I'm not sure" or "I need clarification" instead of producing plausible-sounding but potentially wrong outputs.

These guardrails address one of the deepest failure modes in AI systems: the pressure to always produce an answer, even when the right response is a question.

---

## Why it exists

Models face a fundamental tension:
- Users expect confident, helpful responses
- Many situations genuinely warrant uncertainty
- Ambiguous prompts push models toward hallucination

Without epistemic guardrails, models optimize for *appearing* competent rather than *being* accurate. They'll pick an interpretation instead of asking which one you meant. They'll fabricate details instead of admitting gaps.

Epistemic guardrails flip this incentive. Uncertainty surfacing becomes a feature, not a bug.

---

## How it shows up

### The Red-Flag Mechanism

When a model encounters something it can't handle well, it can produce an explicit escalation:

```json
{
  "status": "escalate",
  "reason": "Ambiguous specification",
  "what_i_know": [
    "The function should validate user input",
    "Two validation approaches are possible"
  ],
  "what_i_dont_know": [
    "Which validation approach is preferred",
    "Whether performance or strictness should be prioritized"
  ],
  "suggested_questions": [
    "Should validation reject or sanitize invalid input?",
    "Is there a performance budget for this function?"
  ]
}
```

This is a **first-class output**, not a failure mode. The model has done valuable work: identifying ambiguity and framing the decision for a human.

### Escalation Paths

Not everything needs model judgment. Epistemic guardrails define when to hand off:

| Situation | Response |
|-----------|----------|
| High-risk module + low confidence | Escalate to human reviewer |
| Security-critical change | Always escalate |
| Missing specification | Ask clarifying questions |
| Conflicting requirements | Surface both interpretations |

### Ambiguity Surfacing

Instead of silently picking one interpretation:

**Without guardrails:**
> "I'll implement the validation using strict mode."

**With guardrails:**
> "The spec is ambiguous about validation strictness. Option A (strict) rejects all edge cases. Option B (permissive) sanitizes and accepts. Which approach should I use?"

The second response is more useful because it *names the decision* instead of hiding it.

---

## Relationship to Modes

[Exploratory mode](../modes/) has relaxed confidence requirements—it's explicitly for brainstorming where uncertainty is expected.

[Conservative mode](../modes/) has stricter requirements—if confidence is low, escalation is mandatory.

The mode determines the threshold, but the mechanism is the same: uncertainty is surfaced, not suppressed.

---

## The Key Insight

Epistemic guardrails change what "helpful" means:

| Without Guardrails | With Guardrails |
|-------------------|-----------------|
| Always produce an answer | Produce the *right* output (answer OR escalation) |
| Confidence is mandatory | Honest uncertainty is valued |
| Ambiguity is resolved silently | Ambiguity is surfaced explicitly |
| The model decides alone | The model collaborates on decisions |

A model that says "I don't know—here are the questions I'd need answered" is being maximally helpful, not failing.

---

## Related concepts

- [Modes](../modes/) — Confidence thresholds vary by mode
- [Policy Surface](../policy-surface/) — Where escalation rules are configured
- [LexSona](../../specs/) — Behavioral vs epistemic personality modeling
