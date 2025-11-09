# LexBrain FAQ

Frequently asked questions about privacy, security, compliance, and how LexBrain actually works.

---

## Is this recording my screen?

**No.**

LexBrain does **not** record your screen. It does not scrape everything you do. It does not capture every keystroke or every terminal command.

LexBrain captures **intentional checkpoints** called Frames. You call `/remember` when you've hit a meaningful moment (diagnosed a blocker, about to switch branches, about to hand off). If you don't call `/remember`, nothing is saved.

---

## Where does this data live?

**On your machine.**

Frames are stored in a **local database** (for example: `/srv/lex-brain/thoughts.db`).

LexBrain is local-first by design. There is no cloud upload by default. There is no remote server that "phones home."

If you want to sync Frames to your own controlled storage (e.g. your own S3 bucket), you can configure that explicitly. But the default is: data stays local.

---

## Can this leak to the cloud?

**Not by default.**

LexBrain is designed to expose Frames to an assistant through **MCP over `stdio`** (spawned process with environment variables). This is local IPC, not network communication.

You do **not** have to run LexBrain as an HTTP server. You do **not** have to open a port. You do **not** have to trust a third-party service.

If you explicitly configure LexBrain to sync to a remote store or expose an HTTP endpoint, that's your choice. The default is local-only.

---

## Is this spying on engineers?

**No.**

LexBrain is not a surveillance tool. It is not a management dashboard. It is not a productivity tracker.

Frames are **deliberate, high-signal checkpoints** that you trigger manually. If you don't call `/remember`, nothing happens.

This is by design. Engineers will not adopt a "spy." We built LexBrain to solve a specific pain: assistants forget what you were doing yesterday. That's it.

---

## What if I don't WANT my session saved?

**Then don't call `/remember`.**

LexBrain only captures Frames when you explicitly trigger it. If you don't want a particular session saved, just don't capture a Frame for it.

No automatic scraping. No background recording. No "oops, we saved that."

---

## Why images instead of just dumping text?

**Token efficiency.**

Dumping huge text logs into an LLM eats a ton of tokens. A compact rendered "memory card" image with those logs (monospace text panel, timestamp header, current blockers) costs dramatically fewer tokens for a vision-capable model—roughly **7–20× context compression**—while keeping enough detail for reasoning.

Example:

- Raw text logs: 10,000 tokens
- Rendered memory card image: ~500 tokens (for a vision-capable model)

You still store the raw text for exact recall when needed. But for "what was I doing yesterday?" questions, the image is cheaper and faster.

---

## Where does LexMap come in?

**LexMap is optional, but powerful.**

You can run LexBrain standalone and get continuity ("what was I doing yesterday?").

If you **also** use LexMap, and you follow THE CRITICAL RULE (your `module_scope` uses the same module IDs defined in `lexmap.policy.json`), then your assistant can answer deeper questions like:

> "Why is the Add User button still disabled?"

The assistant can:

1. Pull the last Frame for that ticket from LexBrain
2. See `module_scope = ["ui/user-admin-panel", "services/auth-core"]`
3. Ask LexMap if `ui/user-admin-panel` is allowed to call `services/auth-core` directly
4. Answer: "It's disabled because the UI is calling a forbidden service. Policy says that path must go through the approved service layer and be gated by `can_manage_users`. Here's the timestamped Frame from last night."

That's **policy-aware reasoning with receipts**.

Without LexMap, you get "what was I doing?" continuity.
With LexMap, you get "what was I doing **and why was it blocked by policy?**" explainability.

---

## Do I need to care about LexMap to use LexBrain?

**No.**

LexBrain works standalone. You can capture Frames, recall them, and get instant continuity without ever touching LexMap.

LexMap only matters if you want your assistant to:

- Understand which modules are allowed to call each other
- Explain why a button is disabled based on architecture policy
- Cite timestamped Frames and line them up with policy violations

If you don't care about that, just use LexBrain by itself.

---

## What is THE CRITICAL RULE?

> **THE CRITICAL RULE:**
> Every module name in `module_scope` MUST match the module IDs defined in LexMap's `lexmap.policy.json`.
> No ad hoc naming. No "almost the same module."
> If the vocabulary drifts, we lose the ability to line up:
>
> - "what you were actually doing last night"
>   with
> - "what the architecture is supposed to allow."

This rule is the bridge between LexBrain (memory) and LexMap (policy).

If you break it, the assistant can't line up your Frames with architectural rules, and you lose the explainability moat.

### How It's Enforced

When you call `/remember`, the system validates each module ID through alias resolution:

1. **Exact match** → ✅ Frame stored with canonical ID
2. **Explicit alias** → ✅ Resolved to canonical ID and stored
3. **Unique substring match** → ✅ Resolved to canonical ID (if only one match)
4. **Ambiguous substring** → ❌ Error: multiple matches, be more specific
5. **Typo detected** → ❌ Error with suggestions: "Did you mean 'indexer'?"
6. **No match** → ❌ Error with suggestions if available

Example:
```bash
# Exact match
/remember "Auth work" --modules "services/auth-core"
# ✅ Frame stored

# Using an alias (requires aliases.json)
/remember "Auth work" --modules "auth"
# ✅ Resolved to services/auth-core, Frame stored

# Unique substring match
/remember "Auth work" --modules "auth-core"
# ✅ If only one module contains "auth-core", resolved and stored

# Ambiguous substring
/remember "Auth work" --modules "user"
# ❌ Error: Multiple modules match (user-access-api, user-profile-service, etc.)

# Typo
/remember "Auth work" --modules "indexr"
# ❌ Error: Module 'indexr' not found. Did you mean 'indexer'?

# Disable substring matching (strict mode for CI)
/remember "Auth work" --modules "auth-core" --no-substring
# ❌ Error if "auth-core" is not exact or explicit alias
```

For comprehensive documentation and troubleshooting, see [Aliasing for LexRunner](./ALIASING_FOR_RUNNER.md).

### Alias Tables (✅ Implemented)

You can now use alias tables for team shorthand and historical renames:

```json
{
  "aliases": {
    "auth": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "team shorthand"
    }
  }
}
```

This allows `/remember "Auth work" --modules "auth"` while storing the canonical ID internally.

See [Aliasing for LexRunner](./ALIASING_FOR_RUNNER.md) for comprehensive documentation and troubleshooting.

---

## Can I search Frames by keyword?

**Yes.**

Frames are indexed by:

- Ticket ID (e.g. `TICKET-123`)
- Keywords (e.g. `"auth timeout"`, `"Add User disabled"`)
- Summary caption (e.g. `"Auth handshake timeout"`)
- Branch (e.g. `feature/TICKET-123_auth_handshake_fix`)

You can recall by any of those:

```bash
/recall TICKET-123
/recall "auth timeout"
/recall "Add User disabled"
```

All of these return the most recent matching Frame.

---

## What is Mind Palace?

**Mind Palace** is an optional enhancement that adds **reference points** and **Atlas Frames** to LexBrain.

Instead of searching by ticket ID or keyword, you recall by natural phrasing:

```bash
/recall "Add User button"
```

Or just ask your assistant:

> "Where did I leave off with the Add User button?"

**What you get back:**
1. **Frame metadata** - what you were doing, next action, blockers
2. **Atlas Frame** - visual map of relevant modules and policy boundaries

**Key benefits:**
- **Faster recall** - jump directly to context via human-memorable anchor phrases
- **Reduced tokens** - only unfold the module neighborhood that matters (fold radius)
- **Policy-aware reasoning** - see which edges are allowed/forbidden

See [Mind Palace Guide](./MIND_PALACE.md) for details.

---

## Do I need Mind Palace?

**No, it's optional.**

You can use LexBrain without Mind Palace and still get full continuity:
- Capture Frames with `/remember`
- Recall by ticket ID or keyword
- Get instant context on what you were doing

Mind Palace adds:
- **Reference points** - human-memorable anchors instead of ticket IDs
- **Atlas Frames** - structural context (module neighborhoods + policy boundaries)
- **Fold radius** - controlled context expansion to prevent token bloat

If you want natural recall ("Where did I leave off with X?") and policy-aware structural context, use Mind Palace.

If you just want "what was I doing on TICKET-123?", baseline LexBrain is enough.

---

## How many Frames should I capture per day?

**5–10, max.**

LexBrain is for **high-signal checkpoints**, not constant scraping.

Good times to capture:

- End of a debugging push
- Just before switching branches
- Just before sleep
- Right after diagnosing a blocker
- Right before handing off to a teammate

Bad times to capture:

- Every 5 minutes
- Every file save
- Every terminal command

If you over-capture, Frames lose signal. You'll have too much noise.

The rule: **If it's not worth explaining to a teammate, don't capture it.**

---

## Can I delete a Frame?

**Yes.**

Frames are stored in a local database. You can delete them manually:

```bash
lexbrain delete TICKET-123
```

Or you can directly edit the database (it's just SQLite):

```bash
sqlite3 /srv/lex-brain/thoughts.db
sqlite> DELETE FROM frames WHERE jira = 'TICKET-123';
```

No cloud sync means no "you can never delete this" problem.

---

## Can I export Frames for backup or audit?

**Yes.**

You can export Frames to JSON:

```bash
lexbrain export --output /path/to/backup.json
```

You can also just copy the database file:

```bash
cp /srv/lex-brain/thoughts.db /path/to/backup/thoughts-2025-11-01.db
```

Since everything is local, you control the backup strategy.

---

## Is this production-ready?

**No. LexBrain is alpha.**

Use it if you want to experiment with persistent work memory. Don't use it if you need enterprise-grade compliance tooling.

The Frame metadata schema is treated as a contract, and we won't break it without a migration plan. But the tooling around it (renderers, MCP integration, LexMap resolver) is still evolving.

---

## Can my manager weaponize this?

**Not if you control the data.**

Frames are stored locally. You control the database. You control what gets captured (you call `/remember` explicitly). You control who has access.

If your org tries to mandate "upload all Frames to a central server for productivity tracking," that's a policy problem, not a LexBrain problem. LexBrain doesn't force you to do that.

The default design is: **local-first, engineer-controlled, intentional capture**.

If someone tries to turn it into surveillance, they're breaking the design.

---

## What if I work on multiple machines?

**You can sync Frames yourself.**

LexBrain doesn't have built-in cloud sync, but you can:

- Copy the database file to another machine
- Use `rsync` to sync `/srv/lex-brain/thoughts.db` across machines
- Store the database in a synced folder (e.g. Dropbox, your own S3 bucket)

Just make sure you're not violating your org's data policies if you put Frames in a shared location.

---

## Can I use this with GitHub Copilot / Claude / other assistants?

**Yes, if they support MCP.**

LexBrain exposes Frames through **MCP over `stdio`**. If your assistant supports MCP, you can wire it up:

```json
{
  "mcpServers": {
    "lexbrain": {
      "command": "/srv/lex-brain/mcp-stdio.mjs",
      "env": {
        "LEXBRAIN_DB": "/srv/lex-brain/thoughts.db"
      }
    }
  }
}
```

Then your assistant can call `lexbrain recall TICKET-123` to pull Frames.

If your assistant doesn't support MCP yet, you can still use LexBrain manually via CLI and copy/paste the memory card or summary into the assistant.

---

## What if I don't have a ticket ID?

**Use keywords instead.**

You don't have to use Jira or any ticketing system. You can capture Frames with just a summary and keywords:

```bash
lexbrain remember \
  --summary "Auth handshake timeout; Add User button still disabled" \
  --next "Fix UserAccessController wiring" \
  --keywords "auth timeout,Add User disabled"
```

Then recall by keyword:

```bash
/recall "auth timeout"
```

Frames are flexible. Ticket IDs just make them easier to organize.

---

## Can I customize the memory card renderer?

**Yes.**

The memory card renderer is just a script that takes raw text and outputs an image. You can replace it with your own:

```bash
lexbrain config set renderer_path /path/to/your/custom-renderer.sh
```

Your custom renderer should:

- Take raw text as input (logs, stack trace, summary, etc.)
- Output a legible, high-contrast image (PNG, JPEG, etc.)
- Include a header with timestamp, branch, ticket ID

LexBrain will use your custom renderer instead of the default.

---

## What license is this?

See [LICENSE](../LICENSE).

LexBrain is open source. You can use it, modify it, and deploy it however you want, as long as you follow the license terms.

---

## What happens if I make a typo in a module ID?

The system will catch it and provide helpful suggestions based on fuzzy matching:

```bash
/remember "Work on auth" --modules "servcies/auth-core"
```

Error response:
```
Invalid module IDs in module_scope:
  • Module 'servcies/auth-core' not found in policy.
    Did you mean: services/auth-core?

Available modules: indexer, ts, php, mcp, services/auth-core, ui/main-panel
```

Just correct the typo and retry. The fuzzy matching uses Levenshtein distance to find the closest matches.

---

## Can I use shorthand like "auth" instead of "services/auth-core"?

**Yes! ✅ Implemented**

Explicit alias tables now support team shorthand conventions. Edit `src/shared/aliases/aliases.json`:

```json
{
  "aliases": {
    "auth": {
      "canonical": "services/auth-core",
      "confidence": 1.0,
      "reason": "team shorthand"
    }
  }
}
```

After rebuilding (`npm run build`), you can use `--modules "auth"` and it will store `services/auth-core` internally.

You can also use substring matching (enabled by default). For example, `--modules "auth-core"` will work if only one module contains that substring.

For detailed documentation and troubleshooting, see [Aliasing for LexRunner](./ALIASING_FOR_RUNNER.md).

---

## What if a module gets renamed in our codebase?

When you refactor and rename a module (e.g., `services/user-access-api` → `api/user-access`):

1. Update `lexmap.policy.json` with the new name
2. Old Frames with the old name will still exist in your database
3. **✅ Use alias tables** to map old → new names:

```json
{
  "aliases": {
    "services/user-access-api": {
      "canonical": "api/user-access",
      "confidence": 1.0,
      "reason": "refactored 2025-10-15"
    }
  }
}
```

This allows recall to work seamlessly across the rename. New Frames can use either the old alias or the new canonical name.

For detailed documentation, see [Aliasing for LexRunner](./ALIASING_FOR_RUNNER.md).

---

## How fast is module validation?

Very fast:

- **Exact match:** ~0.5ms (hash table lookup)
- **Typo with suggestions:** ~2ms (Levenshtein distance calculation)
- **Policy cache:** ~10KB in memory

Performance benchmarks are in `memory/mcp_server/alias-benchmarks.test.ts`.

Target: <5% performance regression vs no validation ✅ MET

---

## Who built this?

LexBrain was built to solve a real pain: assistants forget what you were doing yesterday.

If you have questions, open an issue on GitHub. If you want to contribute, read [CONTRIBUTING.md](../CONTRIBUTING.md).

We're not trying to sell you a service. We're just making tools that make engineering less painful.
