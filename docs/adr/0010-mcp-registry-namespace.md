# ADR-0010: MCP Registry Namespace Strategy

- Status: **Proposed** (pending review)
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
- Domain ownership: `smartergpt.io` (UNKNOWN: verify ownership)

### Package Architecture Decision

**Key insight:** The registry validates `mcpName` by fetching the npm package specified in `identifier`. Additionally, `npx <package>` runs the **default bin**. If we added a `lex-mcp` bin to `@smartergpt/lex`, users running `npx @smartergpt/lex` would get the CLI, not the MCP server.

**Solution:** Create a dedicated `@smartergpt/lex-mcp` package:
- Single bin that IS the MCP server (no arguments needed)
- `mcpName` lives in this package
- Depends on `@smartergpt/lex` and imports server implementation
- Clean separation, no execution ambiguity

## 2. Decision

**Recommendation: Option A — GitHub-based namespace (`io.github.guffawaffle/lex`)**

### Option A: GitHub Namespace (Recommended)

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
io.smartergpt/lex
```

**Pros:**
- ✅ Brand-durable: domain stays even if GitHub org changes
- ✅ Professional appearance in registry listings
- ✅ Could support multiple servers under same namespace

**Cons:**
- ❌ Requires domain ownership verification (DNS TXT or HTTP file)
- ❌ Key management: Ed25519 or ECDSA private key needed for signing
- ❌ CI complexity: secrets management for private key
- ❌ Domain may expire or transfer → breaks publishing
- ❌ UNKNOWN: Do we control `smartergpt.io` DNS?

**Implementation (if chosen):**
```bash
# Generate key pair
openssl genpkey -algorithm Ed25519 -out key.pem

# Create DNS TXT record
# smartergpt.io. IN TXT "v=MCPv1; k=ed25519; p={PUBLIC_KEY}"

# Or HTTP file
# https://smartergpt.io/.well-known/mcp-registry-auth
```

## 3. Rationale for Recommendation

We recommend **Option A (GitHub namespace)** for the initial publication:

1. **Minimal moving parts**: No key management, no DNS changes, no secrets
2. **Fastest path to publish**: Can publish immediately after package.json update
3. **Reversible**: We can later add a custom domain namespace (servers can have multiple registry entries)
4. **Registry is in preview**: Taking the simpler path reduces risk during API freeze

### Future Migration Path

If custom domain becomes important:
1. Verify domain ownership (DNS or HTTP)
2. Publish **new** registry entry: `io.smartergpt/lex`
3. Update documentation to point to new namespace
4. (Optional) Deprecate GitHub namespace entry

**Note:** The registry supports multiple entries pointing to the same npm package.

## 4. Unknowns (Require Research)

| Question | Status | Owner |
|----------|--------|-------|
| Do we own/control `smartergpt.io` DNS? | UNKNOWN | @Guffawaffle |
| Can we publish to multiple namespaces simultaneously? | Likely yes (need verification) | Research |
| What happens if GitHub username changes? | UNKNOWN | Research |
| Is there a "migrate namespace" feature? | UNKNOWN (likely no) | Research |

## 5. Consequences

### If we accept Option A:

- `mcpName` in `@smartergpt/lex-mcp/package.json`: `io.github.guffawaffle/lex`
- `name` in server.json: `io.github.guffawaffle/lex`
- `identifier` in server.json: `@smartergpt/lex-mcp`
- CI workflow uses `mcp-publisher login github-oidc`
- No secrets required beyond existing npm token
- Users search for "guffawaffle/lex" or "lex" in registry

### Registry Entry Example

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.guffawaffle/lex",
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

## 6. Decision Outcome

**Pending review.** To accept this ADR:

1. [ ] Confirm GitHub namespace is acceptable for initial launch
2. [ ] Document domain ownership status for future Option B
3. [ ] Create `@smartergpt/lex-mcp` wrapper package (#634)
4. [ ] Add `mcpName: "io.github.guffawaffle/lex"` to wrapper package
5. [ ] Update server.json with `identifier: "@smartergpt/lex-mcp"` (#635)

## 7. References

- [MCP Registry Authentication](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx)
- [MCP Registry Quickstart](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx)
- [MCP Registry GitHub Actions](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/github-actions.mdx)
- [Package Types](https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx)
