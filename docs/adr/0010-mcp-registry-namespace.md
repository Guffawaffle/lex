# ADR-0010: MCP Registry Namespace Strategy

- Status: **Accepted** (implemented 2026-01-20)
- Date: 2025-12-31
- Authors: GitHub Copilot
- Tags: mcp, registry, namespace, publishing
- Tracking Issue: #633

## 1. Context

We want to publish the Lex MCP server to `registry.modelcontextprotocol.io` so users can discover and install it via VS Code, Claude Desktop, and other MCP clients.

The MCP Registry requires a **namespace** for each server entry. The namespace determines:
1. How users search/discover the server
2. What authentication method is required
3. Brand identity and future portability

### Registry Authentication Methods

Per [MCP Registry Authentication Docs](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx):

| Authentication | Namespace Format | Verification |
|----------------|------------------|--------------|
| GitHub OAuth/OIDC | `io.github.{username}/*` | GitHub login |
| DNS | `{reverse-domain}/*` (e.g., `io.smartergpt/*`) | DNS TXT record |
| HTTP | `{reverse-domain}/*` | `/.well-known/mcp-registry-auth` file |

### Current State

- npm package: `@smartergpt/lex` (core library)
- npm package: `@smartergpt/lex-mcp` (MCP server wrapper, **to be created**)
- GitHub repo: `github.com/Guffawaffle/lex`
- Domain ownership: `smartergpt.dev` (**owned** — would yield `dev.smartergpt/*` namespace)
- Multi-repo layout: `/srv/lex-mcp/` contains sibling repos `lex/`, `lexrunner/`, `lexsona/`

### Package Architecture Decision

**Key insight:** The registry validates `mcpName` by fetching the npm package specified in `identifier`. Additionally, `npx <package>` runs the **default bin**. If we added a `lex-mcp` bin to `@smartergpt/lex`, users running `npx @smartergpt/lex` would get the CLI, not the MCP server.

**Solution:** Create a dedicated `@smartergpt/lex-mcp` package:
- Single bin that IS the MCP server (no arguments needed)
- `mcpName` lives in this package
- Depends on `@smartergpt/lex` and imports server implementation
- Clean separation, no execution ambiguity

## 2. Decision

**Final Decision: Option B — Custom Domain Namespace (`dev.smartergpt/lex`)**

After initial planning for GitHub OIDC (Option A), we pivoted to DNS verification:

### Why We Changed

1. **Brand durability** — `dev.smartergpt/*` namespace persists regardless of GitHub org changes
2. **DNS verification is live** — TXT record confirmed at `smartergpt.dev`:
   ```
   dig TXT smartergpt.dev +short
   "v=MCPv1; k=ed25519; p=jfA9/lWHT8sikX+/F2NtmMvUBfVR5ln+6r9TCDYuLSU="
   ```
3. **Lex-only publishing** — Restricting MCP registry publication to Lex only (lexrunner/lexsona stay private)

### Final Configuration

```
Namespace:    dev.smartergpt/lex
Auth:         DNS TXT record verification (Ed25519)
Domain:       smartergpt.dev
```

**Implementation:**
```json
// server.json (in lex/ repo)
{
  "name": "dev.smartergpt/lex",
  "packages": [{
    "identifier": "@smartergpt/lex-mcp"
  }]
}
```

### Option A: GitHub Namespace (Not Chosen)

```
io.github.guffawaffle/lex
```

**Pros:**
- ✅ Zero friction: GitHub OIDC works immediately in CI
- ✅ No DNS/HTTP verification setup required
- ✅ Automatic trust: users see GitHub identity → transparency
- ✅ Works with existing repo structure (no domain required)
- ✅ GitHub Actions OIDC: `id-token: write` permission is all that's needed

**Cons:**
- ❌ Namespace tied to GitHub username (not brand-portable)
- ❌ If repo transfers to org, namespace may need to change
- ❌ Less "professional" appearance vs custom domain

**Implementation:**
```json
// @smartergpt/lex-mcp/package.json
{
  "name": "@smartergpt/lex-mcp",
  "mcpName": "io.github.guffawaffle/lex",
  "bin": "./index.mjs"
}

// server.json (in lex/ repo)
{
  "name": "io.github.guffawaffle/lex",
  "packages": [{
    "identifier": "@smartergpt/lex-mcp"
  }]
}
```

### Option B: Custom Domain Namespace

```
dev.smartergpt/lex
```

**Pros:**
- ✅ Brand-durable: domain stays even if GitHub org changes
- ✅ Professional appearance in registry listings
- ✅ Could support multiple servers under same namespace
- ✅ We own `smartergpt.dev` (no purchase needed)

**Cons:**
- ❌ Requires domain ownership verification (DNS TXT or HTTP file)
- ❌ Key management: Ed25519 or ECDSA private key needed for signing
- ❌ CI complexity: secrets management for private key
- ❌ Domain may expire or transfer → breaks publishing

**Implementation (if chosen):**
```bash
# Generate key pair
openssl genpkey -algorithm Ed25519 -out key.pem

# Create DNS TXT record
# smartergpt.dev. IN TXT "v=MCPv1; k=ed25519; p={PUBLIC_KEY}"

# Or HTTP file
# https://smartergpt.dev/.well-known/mcp-registry-auth
```

## 3. Rationale for Recommendation

We recommend **Option A (GitHub namespace)** for the initial publication:

1. **Minimal moving parts**: No key management, no DNS changes, no secrets
2. **Fastest path to publish**: Can publish immediately after package.json update
3. **Reversible**: We can later add a custom domain namespace (servers can have multiple registry entries)
4. **Registry is in preview**: Taking the simpler path reduces risk during API freeze

### Future Migration Path

If custom domain becomes important:
1. Verify domain ownership via DNS TXT record on `smartergpt.dev`
2. Publish **new** registry entry: `dev.smartergpt/lex`
3. Update documentation to point to new namespace
4. (Optional) Deprecate GitHub namespace entry

**Note:** The registry supports multiple entries pointing to the same npm package.

## 4. Unknowns (Require Research)

| Question | Status | Owner |
|----------|--------|-------|
| Can we publish to multiple namespaces simultaneously? | Likely yes (need verification) | Research |
| What happens if GitHub username changes? | UNKNOWN | Research |
| Is there a "migrate namespace" feature? | UNKNOWN (likely no) | Research |
| Can MCP clients invoke non-default npm bins? | UNKNOWN (wrapper package avoids this) | Research |

## 5. Consequences

### If we accept Option A:

- `mcpName` in `@smartergpt/lex-mcp/package.json`: `io.github.guffawaffle/lex`
- `name` in server.json: `io.github.guffawaffle/lex`
- `identifier` in server.json: `@smartergpt/lex-mcp`
- CI workflow uses `mcp-publisher login dns --domain "smartergpt.dev" --private-key "$KEY"`
- Secret: `MCP_REGISTRY_PRIVATE_KEY_HEX` (repo-level or org-level with restricted access)
- Users search for "smartergpt/lex" or "lex" in registry

### Registry Entry

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "dev.smartergpt/lex",
  "title": "Lex",
  "description": "Episodic memory and architectural policy for AI agents",
  "repository": {
    "url": "https://github.com/Guffawaffle/lex",
    "source": "github"
  },
  "version": "1.0.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@smartergpt/lex-mcp",
      "version": "1.0.0",
      "transport": { "type": "stdio" },
      "runtimes": ["node"]
    }
  ]
}
```

**Note:** No `arguments` field needed — `@smartergpt/lex-mcp`'s default bin IS the MCP server.

### Security Controls

1. **Protected Environment** — `mcp-publish` environment requires reviewer approval
2. **Tag-only triggers** — Publish only runs on GitHub releases or explicit manual trigger
3. **Minimal permissions** — `contents: read` only (no id-token needed for DNS auth)
4. **Secret isolation** — `MCP_REGISTRY_PRIVATE_KEY_HEX` restricted to lex repo only

## 6. Decision Outcome

**Accepted and Implemented (2026-01-20).**

Checklist:
- [x] DNS TXT record verified at smartergpt.dev
- [x] server.json updated to `name: "dev.smartergpt/lex"`
- [x] Workflow updated to DNS authentication with protected environment
- [x] Secret restricted to lex repo only (lexrunner/lexsona removed)
- [x] `@smartergpt/lex-mcp` wrapper package created (#634)

## 7. References

- [MCP Registry Authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx)
- [MCP Registry Quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx)
- [MCP Registry GitHub Actions](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/github-actions.mdx)
- [Package Types](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx)
