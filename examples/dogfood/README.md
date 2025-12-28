# Dogfooding Lex: How We Build Lex with Lex

**The best documentation is a working example.** This directory contains real Frames from Lex's own development, showing how we use Lex to build Lex.

## What's Here

### Real Development Frames

The `frames/` directory contains sanitized Frames from actual development sessions:

1. **[2025-12-16-mcp-naming-fix.json](./frames/2025-12-16-mcp-naming-fix.json)** — Fixed MCP tool naming convention
   - **Context:** VS Code was showing tools as `mcp_lex_lex_remember` instead of `mcp_lex_remember`
   - **Fix:** Removed redundant namespace prefix to match GitHub MCP pattern
   - **Outcome:** Published as Lex 2.1.0

2. **[2025-12-05-ax-native-release.json](./frames/2025-12-05-ax-native-release.json)** — Released Lex 2.0.0 with AX guarantees
   - **Context:** First stable release with structured output and recoverable errors
   - **Work:** Implemented AXError schema and Frame Schema v3
   - **Outcome:** Production-ready agent experience guarantees

3. **[2025-11-28-recall-fts5-fix.json](./frames/2025-11-28-recall-fts5-fix.json)** — Fixed recall hyphen handling
   - **Context:** Compound queries like `"recall-fix"` failed in FTS5 search
   - **Fix:** Updated FTS5 query handling for hyphenated terms
   - **Outcome:** Case-insensitive, hyphen-safe recall per AX Contract §2.4

4. **[2025-11-20-instructions-cli.json](./frames/2025-11-20-instructions-cli.json)** — Built instructions management CLI
   - **Context:** Users needed to sync AI instructions across multiple IDEs
   - **Work:** Created `lex instructions init/generate/check` commands
   - **Outcome:** Single source of truth for Copilot, Cursor, and other IDEs

5. **[2025-11-15-atlas-optimization.json](./frames/2025-11-15-atlas-optimization.json)** — Optimized Atlas Frame generation
   - **Context:** Atlas generation was slow on large codebases
   - **Fix:** Cached policy module ID lookups (O(n) → O(1))
   - **Outcome:** 10x faster for 1000+ module projects

6. **[2025-11-08-database-encryption.json](./frames/2025-11-08-database-encryption.json)** — Added SQLCipher encryption
   - **Context:** Production deployments needed encrypted Frame storage
   - **Work:** Integrated SQLCipher with AES-256 and migration tools
   - **Outcome:** Mandatory encryption in production mode

## Our Workflow

### 1. Start Session: Recall Context

When starting work, we use `lex recall` to retrieve context from previous sessions:

```bash
# Get context on what I was working on
lex recall "MCP naming"

# Or by ticket
lex recall "LEX-242"

# Or by module
lex recall --modules "memory/mcp_server"
```

**What we get back:**
- Previous Frame with exact reference point
- Status snapshot (next action, blockers)
- Atlas Frame showing module neighborhood
- Related Frames from the same area

### 2. Do Work

We develop features, fix bugs, and write code as usual. No special workflow needed.

### 3. End Session: Remember Progress

At the end of a work session (or meaningful checkpoint), we capture a Frame:

```bash
lex remember \
  --reference-point "MCP tool names showing double prefix in VS Code" \
  --summary "Fixed naming to match GitHub MCP pattern - removed redundant namespace prefix" \
  --next "Publish lex@2.1.0 to npm with naming fix" \
  --modules "memory/mcp_server,mcp/tools" \
  --jira "LEX-242"
```

**Pro tip:** Make the reference point memorable and situation-specific. Days later, you'll recall "that MCP naming bug" instantly.

### 4. Commit Frames (Optional)

For significant features or releases, we commit sanitized Frames to this directory:

```bash
# Export Frame as JSON
lex timeline --format json --limit 1 > examples/dogfood/frames/2025-12-16-mcp-naming-fix.json

# Review and sanitize (remove sensitive data if needed)
vim examples/dogfood/frames/2025-12-16-mcp-naming-fix.json

# Commit
git add examples/dogfood/frames/
git commit -m "docs: Add MCP naming fix Frame to dogfood examples"
```

## Before/After: Real Impact

### Before Lex

**Scenario:** Coming back to work after a week away.

```
Me: "What was I working on with the MCP tools?"
Brain: "Uhh... something about naming? Or was it the server?"
[30 minutes of git log, grep, and re-reading code]
```

### After Lex

**Scenario:** Same situation, but with Frames.

```bash
$ lex recall "MCP"

📸 Frame: MCP tool names showing double prefix in VS Code
   Date: 2025-12-16 14:30:00Z
   Branch: main
   Modules: memory/mcp_server, mcp/tools

   Summary: Fixed naming to match GitHub MCP pattern - 
            removed redundant namespace prefix causing 
            tools to display as mcp_lex_lex_* instead 
            of mcp_lex_*

   Next Action: Publish lex@2.1.0 to npm with naming fix
   Blockers: None
   JIRA: LEX-242

🗺️ Atlas Frame (fold radius: 1)
   Dependencies: memory/store, shared/types
   Dependents: cli/commands
   Policy: mayCall shared/* (allowed)
```

**Result:** Instant context. I know exactly where I left off and what to do next.

## Frame Anatomy

Each Frame captures:

### Core Metadata
- `id` — Unique identifier
- `timestamp` — When the Frame was captured
- `branch` — Git branch
- `module_scope` — Which modules were touched

### Memory Fields
- `reference_point` — Short, memorable anchor phrase
- `summary_caption` — What was done
- `status_snapshot` — Next action, blockers, failing tests
- `jira` — Optional ticket reference
- `keywords` — Searchable tags

### Orchestration Fields (v3)
- `runId` — Execution session identifier
- `spend` — Token/prompt usage
- `capabilityTier` — Complexity level (junior/mid/senior)
- `taskComplexity` — Model assignments and escalations

### Security Fields
- `userId` — OAuth2/JWT user (multi-user deployments)
- `executorRole` — Agent role (security-engineer, code-reviewer, etc.)
- `toolCalls` — Which tools were invoked
- `guardrailProfile` — Safety constraints applied

### Performance Fields (v4)
- `turnCost` — Conversation efficiency metrics
  - `latency` — Response delay cost
  - `contextReset` — Memory loss cost
  - `renegotiation` — Clarification cost
  - `tokenBloat` — Verbosity cost
  - `attentionSwitch` — Context switching cost

## Schema Validation

All Frames follow [Frame Schema v4](../../docs/specs/FRAME-SCHEMA-V3.md).

Validate Frames with:

```bash
# Using TypeScript API
node -e "
  const { validateFramePayload } = require('@smartergpt/lex/memory');
  const frame = require('./frames/2025-12-16-mcp-naming-fix.json');
  const result = validateFramePayload(frame);
  console.log(result.valid ? '✓ Valid' : '✗ Invalid:', result.errors);
"
```

## Using These Examples

### Clone and Explore

```bash
# Clone the repo
git clone https://github.com/Guffawaffle/lex.git
cd lex

# Install and build
npm ci && npm run build

# Initialize Lex in the repo
npx lex init

# Import a dogfood Frame
cat examples/dogfood/frames/2025-12-16-mcp-naming-fix.json | \
  npx lex remember --from-json

# Recall it
npx lex recall "MCP naming"
```

### Replicate the Pattern

**For your own projects:**

1. **Initialize Lex:**
   ```bash
   npx lex init
   ```

2. **Capture Frames regularly:**
   ```bash
   lex remember \
     --reference-point "Short memorable phrase" \
     --summary "What you did" \
     --next "What's next" \
     --modules "which/modules"
   ```

3. **Recall when needed:**
   ```bash
   lex recall "that thing I was working on"
   ```

4. **Optional: Commit representative Frames** to `examples/` or `docs/frames/` for team knowledge sharing

## Authenticity Over Polish

These Frames are **real development artifacts**, not marketing materials:

- ✅ Actual work sessions from Lex development
- ✅ Real blockers and challenges we faced
- ✅ Honest escalations and retries
- ✅ Turn costs showing conversation inefficiencies

**Why?** Because authentic examples teach better than perfect ones.

## Frame Selection Criteria

We include Frames that demonstrate:

1. **Diverse work types** — Features, bugs, optimizations, releases, security
2. **Different complexity tiers** — Junior, mid, senior level work
3. **Various module scopes** — Memory, CLI, policy, atlas, shared utilities
4. **Real challenges** — Blockers, escalations, platform issues
5. **Complete metadata** — Using v3/v4 schema fields

## Contributing Dogfood Examples

Have a great Frame from your own Lex usage? Submit a PR!

**Guidelines:**
1. Sanitize sensitive data (real JIRAs, internal references)
2. Use descriptive file names: `YYYY-MM-DD-short-description.json`
3. Add entry to this README under "Real Development Frames"
4. Validate JSON with `lex remember --from-json`

**What makes a good dogfood Frame:**
- Shows a real workflow pattern (recall → work → remember)
- Demonstrates a non-obvious Lex feature
- Has an interesting blocker or escalation story
- Uses advanced schema fields (turnCost, taskComplexity, etc.)

## Related Documentation

- [Mind Palace Guide](../../docs/MIND_PALACE.md) — Using reference points effectively
- [Frame Schema v3](../../docs/specs/FRAME-SCHEMA-V3.md) — Complete schema specification
- [AX Contract](../../docs/specs/AX-CONTRACT.md) — Agent experience guarantees
- [Quick Start](../../QUICK_START.md) — Getting started with Lex
- [API Usage](../../docs/API_USAGE.md) — Programmatic API

## Questions?

**Issue:** Something unclear or broken?
→ [Open an issue](https://github.com/Guffawaffle/lex/issues)

**Discussion:** Want to share your own dogfooding story?
→ [Start a discussion](https://github.com/Guffawaffle/lex/discussions)

---

<div align="center">

**These Frames are our receipts.**

We don't just talk about episodic memory — we live it.

[⬅ Back to Examples](../) · [📦 Install Lex](https://www.npmjs.com/package/@smartergpt/lex) · [🏠 Main README](../../README.md)

</div>
