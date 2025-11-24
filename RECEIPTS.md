# Receipts: Policy-Aware Work Continuity

**Receipts** are how Lex provides verifiable, timestamped proof of what happened and why. Instead of relying on memory or guesswork, Lex gives you concrete evidence tied to specific moments in your development session.

---

## What is a Receipt?

A receipt is a **human-readable audit trail** that maps:

- **What you were doing** → The Frame you captured with `/remember`
- **What was checked** → The gates/validators that ran (policy checker, tests, lints)
- **What the results were** → Violations found, tests passed/failed, coverage data
- **What policy said** → Allowed/forbidden module dependencies, permission gates, kill patterns
- **When it happened** → Exact timestamp and git branch context

Think of it as a **timestamped work session snapshot with verifiable proof**.

---

## Why Receipts Matter

### Without Receipts (Typical Assistant Behavior)

**You ask:**
> "Why is the Add User button still disabled?"

**Assistant guesses:**
> "It might be a CSS issue, or maybe the form validation isn't complete, or perhaps there's a JavaScript error? Let me check the console..."

The assistant has **no memory**, **no context**, and **no proof**. It's just guessing.

### With Receipts (Lex)

**You ask:**
> "Why is the Add User button still disabled?"

**Lex responds:**
> "The Add User button is still disabled because the admin UI (`ui/user-admin-panel`) was calling `services/auth-core` directly, which is **forbidden by policy**. Policy says that path must go through the approved service layer and be gated by the `can_manage_users` permission.
>
> Here's the timestamped Frame from **11:04 PM last night** where you said you'd fix the `UserAccessController` wiring after sleep."

That's **receipts**: verifiable, timestamped, policy-aware reasoning.

---

## What's in a Receipt?

Every Frame captured with `lex remember` includes:

### 1. Context
- **Timestamp** - When you captured this Frame
- **Git branch** - What branch you were on
- **Ticket ID** (optional) - Jira/GitHub issue reference
- **Reference point** - Human-memorable anchor ("Add User button disabled")

### 2. Work State
- **Summary** - One-line description of what you did
- **Next action** - What you planned to do next
- **Blockers** - What was blocking you
- **Module scope** - Which modules you touched (validated against policy)

### 3. Policy Results (if `lex check` was run)
- **Forbidden edges** - Module A calling Module B when policy forbids it
- **Missing permissions** - Feature requiring `can_X` but not gated properly
- **Kill patterns** - Dangerous code patterns detected (hardcoded secrets, etc.)

### 4. Test/Gate Results (optional)
- **Test status** - Which tests passed/failed
- **Coverage** - Code coverage percentages
- **Lint errors** - Style violations found

---

## How to Use Receipts

### Capture a Frame (Create a Receipt)

```bash
# Basic capture
lex remember "Fixed auth timeout by adding retry logic" \
  --modules "services/auth-core" \
  --next "Add unit tests for retry logic" \
  --jira AUTH-456

# With blockers
lex remember "Add User button still disabled" \
  --modules "ui/user-admin-panel,services/auth-core" \
  --blockers "Policy violation: UI calling auth-core directly" \
  --next "Refactor to use service layer"
```

**What happens:**
1. Lex validates your module IDs against `lexmap.policy.json`
2. Creates a timestamped Frame in the local database
3. Returns a Frame ID and confirmation

**Receipt generated:**
```
✅ Frame saved: frame-1732240800-abc123

Summary: Add User button still disabled
Branch: feature/AUTH-456_user_access_fix
Modules: ui/user-admin-panel, services/auth-core
Blockers: Policy violation: UI calling auth-core directly
Next: Refactor to use service layer
Timestamp: 2025-11-22T03:04:00Z
```

### Recall a Frame (Retrieve a Receipt)

```bash
# By ticket ID
lex recall AUTH-456

# By keyword
lex recall "Add User button"

# By branch
lex recall feature/AUTH-456_user_access_fix
```

**What you get back:**
```
📋 Frame: frame-1732240800-abc123

Reference: Add User button still disabled
Summary: Policy violation preventing user creation
Branch: feature/AUTH-456_user_access_fix
Time: 2025-11-22 03:04 AM (1 hour ago)

Module Scope:
  • ui/user-admin-panel
  • services/auth-core

Status:
  Next: Refactor to use service layer
  Blockers:
    - Policy violation: UI calling auth-core directly

Policy Check Results:
  ❌ Forbidden edge: ui/user-admin-panel → services/auth-core
     Policy requires: UI must use approved service layer
     Required permission gate: can_manage_users
```

That's your **receipt**: what you were doing, what was wrong, what policy said, and when you discovered it.

---

## Policy-Aware Receipts

When you run `lex check` on a Frame's module scope, you get **policy violations as part of the receipt**:

```bash
# Check current work against policy
lex check merged-facts.json

# Or specify modules explicitly
lex check --modules "ui/user-admin-panel,services/auth-core"
```

**Receipt includes:**
```
Policy Violations Report
========================

Forbidden Edges:
  ❌ ui/user-admin-panel → services/auth-core
     Reason: UI layer must not call core services directly
     Required path: UI → service layer → core services
     Permission gate: can_manage_users

Missing Permissions:
  ⚠️  Feature: user_creation
     Requires: can_manage_users
     Found: None (not gated)

Kill Patterns: None detected
```

This **policy receipt** becomes part of the Frame, so when you recall it later, you get the full context: not just "I was working on this," but "I was working on this, and here's exactly what policy said was wrong."

---

## Receipts in CI/CD

When gates run in CI, they produce **structured JSON receipts**:

```json
{
  "gate": "policy-check",
  "timestamp": "2025-11-22T03:15:00Z",
  "input": {
    "modules": ["ui/user-admin-panel", "services/auth-core"]
  },
  "output": {
    "violations": [
      {
        "type": "forbidden_edge",
        "from": "ui/user-admin-panel",
        "to": "services/auth-core",
        "reason": "UI must use service layer",
        "permission_required": "can_manage_users"
      }
    ]
  },
  "verdict": "fail"
}
```

These JSON receipts can be:
- Posted as PR comments
- Stored in artifact storage
- Indexed for later search
- Used to block merges until violations are fixed

---

## Why "Receipts" Instead of "Logs"?

**Logs** are passive, unstructured dumps of what happened.

**Receipts** are active, structured proof of:
- What acceptance criteria were checked
- What gates verified them
- What the results were
- What action to take next

A receipt is a **contract**: "This work was checked against these rules at this time, and here's the proof."

---

## The Receipt Flow

```
┌─────────────────┐
│ You work on     │
│ AUTH-456        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Capture Frame   │ ← lex remember "Fixed auth timeout"
│ with /remember  │   --modules "services/auth-core"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate against│ ← Module IDs checked against policy
│ lexmap.policy   │   Forbidden edges detected
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Frame saved     │ ← Timestamped snapshot stored
│ (Receipt #1)    │   in local database
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Run policy check│ ← lex check merged-facts.json
│ (Receipt #2)    │   Structured violations report
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Later: Recall   │ ← lex recall AUTH-456
│ Frame           │   Get full context + receipts
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Assistant gives │ ← "Here's what you were doing,
│ answer WITH     │    here's what policy said,
│ RECEIPTS        │    here's the timestamp"
└─────────────────┘
```

---

## Common Receipt Scenarios

### Scenario 1: "Why did I stop working on this?"

**Without receipts:**
> "I don't remember. Let me read through git history and hope I left a good commit message..."

**With receipts:**
```bash
lex recall TICKET-123
```
```
Next: Add unit tests after fixing UserAccessController wiring
Blockers: Policy violation (see above)
```

### Scenario 2: "Did I check this against policy?"

**Without receipts:**
> "I think so? Maybe? Let me run it again..."

**With receipts:**
```bash
lex recall TICKET-123
```
```
Policy Check Results (2025-11-22 03:04 AM):
  ❌ Forbidden edge: ui/user-admin-panel → services/auth-core
```

You have **timestamped proof** of what was checked and when.

### Scenario 3: "What tests were failing when I left off?"

**Without receipts:**
> "Let me re-run the entire test suite..."

**With receipts:**
```bash
lex recall TICKET-123
```
```
Test Results (cached from last run):
  ✅ auth-core.spec.ts (12 tests)
  ❌ user-access.spec.ts (5 failed: missing permission gates)
```

You know **exactly** what was failing, without re-running anything.

---

## Receipts are Local-First

All receipts (Frames) are stored in a **local SQLite database** by default:

```
.smartergpt/lex/memory.db
```

**No cloud upload.** **No telemetry.** **You control the data.**

If you want to sync receipts across machines, you can:
- Copy the database file manually
- Use `rsync` to sync it
- Store it in your own controlled storage (S3, Dropbox, etc.)

But the **default is local-only**.

---

## See Also

- [FAQ.md](./docs/FAQ.md) - Common questions about Frames and receipts
- [ARCHITECTURE_LOOP.md](./docs/ARCHITECTURE_LOOP.md) - How LexBrain + LexMap enable policy-aware reasoning
- [MIND_PALACE.md](./docs/MIND_PALACE.md) - Advanced recall with reference points and Atlas Frames
