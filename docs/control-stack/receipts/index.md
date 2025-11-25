# Receipts

> Not vibes, but evidence.

## What it is

A **Receipt** is a durable record of what *actually happened* during a session or operation. It captures the mode that was active, which tools were invoked, what gates ran and their outcomes, which files were touched, and a summary of results.

Receipts are execution traces—they answer the question: "What did the model actually do, and did it work?"

---

## Why it exists

Models produce text. Text can claim anything. Without receipts, you're trusting that:
- The model ran the tests it says it ran
- The files it says it read actually exist
- The changes it made are what it describes

Receipts collapse this trust problem. The claim and the evidence are bundled together. If the model says "tests passed," the receipt contains the actual test output. If it says "file contains X," the receipt shows the read operation that retrieved it.

This enables:
- **Audit** — Reviewers can see exactly what happened
- **Debugging** — When something breaks, trace back to what ran
- **Learning** — Both humans and systems can learn from patterns in receipts

---

## How it shows up

A receipt is a structured artifact produced at the end of an operation. Conceptually, it looks like:

```json
{
  "timestamp": "2025-11-25T14:30:00Z",
  "mode": "conservative",
  "tools_invoked": [
    "read_file",
    "replace_string_in_file",
    "run_tests"
  ],
  "gates": {
    "lint": "pass",
    "typecheck": "pass",
    "tests": "pass"
  },
  "files_touched": [
    "src/cli.ts",
    "src/core/gates.ts"
  ],
  "summary": "Added error handling to CLI exit path"
}
```

The exact schema varies by implementation, but the principle is constant: **every consequential action is recorded**.

---

## Receipts vs Frames

These are complementary, not competing:

| Concept | What it captures | When it's written |
|---------|------------------|-------------------|
| **Frame** | Episodic snapshot of intent, context, and what you were working on | During/after a session |
| **Receipt** | Execution trace of what ran and passed/failed | After an operation completes |

A Frame says: *"I was refactoring the auth module, here's the context I had."*
A Receipt says: *"Here's exactly what tools ran, what gates passed, and what changed."*

Both feed into the audit trail. Frames provide narrative continuity; Receipts provide verifiable execution history.

---

## Related concepts

- [Gates](../gates/) — The checks recorded in receipts
- [Modes](../modes/) — The behavioral profile active during execution
- [Frames](../../research/) — The episodic memory model for intent and context
