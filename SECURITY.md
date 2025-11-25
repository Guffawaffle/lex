# Security Policy

**Target Use Case:** Single-developer / small-team dev-time library
**NOT Recommended For:** Public multi-tenant production services without additional hardening

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          | Security Posture |
| ------- | ------------------ | ---------------- |
| 0.4.x   | :white_check_mark: | Dev/alpha - Local use only |
| 0.3.x   | :white_check_mark: | Dev - Local use only |
| 0.2.x   | :x:                | End of support |
| < 0.2   | :x:                | End of support |

**Version Support Policy:**
- **0.4.0-alpha:** Suitable for local dev, private automation, small trusted teams
- **0.5.0 (planned Q1 2026):** Will add auth, encryption, audit logging for internal production use
- Security fixes backported to current minor version only
- Once we reach 1.0.0, we will follow semantic versioning strictly

---

## Known Limitations (0.4.2-alpha)

**This alpha release is NOT production-hardened.** Known security limitations:

1. **No authentication on MCP stdio mode** (MCP server runs as local process)
2. **HTTP mode requires API key** (mandatory as of 0.4.2) - See HTTP Server Security below
3. **Database encryption available** (SQLCipher support added in 0.5.0-alpha) - See Database Encryption below
4. **Limited audit trail** (HTTP requests logged, database ops not tracked)
5. **SQLite limitations** (not suitable for high-concurrency)
6. **Example scanners not audited** (Python/PHP in `examples/scanners/`)

**Acceptable for:**
- ✅ Local development by single developer
- ✅ Private automation scripts
- ✅ Small trusted teams on secure networks

**NOT acceptable for:**
- ❌ Public internet-facing services
- ❌ Multi-tenant SaaS applications
- ❌ Environments with compliance requirements
- ❌ High-security production environments

See `docs/SECURITY_POSTURE.md` for detailed guidance and production roadmap

---

## Database Encryption (New in 0.5.0-alpha)

**⚠️ IMPORTANT: Database encryption is OPTIONAL but RECOMMENDED for production use.**

Lex now supports database encryption at rest using SQLCipher. This protects Frame data, Atlas maps, and metadata from unauthorized access.

### Encryption Features

✅ **SQLCipher Integration**
- AES-256 encryption for database files
- PBKDF2 key derivation (64,000 iterations)
- Drop-in replacement for better-sqlite3
- Backward compatible with unencrypted databases

✅ **Key Management**
- Environment variable-based key configuration (`LEX_DB_KEY`)
- Mandatory encryption in production mode (`NODE_ENV=production`)
- Deterministic key derivation for consistent access
- No key recovery mechanism (keep your passphrase secure!)

✅ **Migration Support**
- `lex db encrypt` command to migrate existing databases
- Data integrity verification with SHA-256 checksums
- Non-destructive migration (creates new encrypted database)

### Quick Start

**1. Enable Encryption (New Databases)**

```bash
# Set encryption passphrase (required in production)
export LEX_DB_KEY="your-strong-passphrase-here-32-chars-minimum"

# Start using Lex - database will be encrypted automatically
lex remember --reference-point "my work" --summary "Testing encryption"
```

**2. Migrate Existing Database**

```bash
# Set passphrase for encryption
export LEX_DB_KEY="your-strong-passphrase-here"

# Encrypt existing database with verification
lex db encrypt --verify

# Output will be: .smartergpt/lex/memory-encrypted.db
# Rename to replace original database (after verifying it works)
```

**3. Using Custom Paths**

```bash
# Encrypt specific database file
lex db encrypt \
  --input /path/to/unencrypted.db \
  --output /path/to/encrypted.db \
  --passphrase "your-passphrase" \
  --verify
```

### Key Management Best Practices

**DO:**
- ✅ Use strong passphrases (32+ characters, mix of letters, numbers, symbols)
- ✅ Store passphrase in environment variables (never commit to git)
- ✅ Use different passphrases for dev/staging/production
- ✅ Back up your passphrase securely (password manager, encrypted vault)
- ✅ Rotate passphrases periodically (re-encrypt database)

**DON'T:**
- ❌ Hard-code passphrases in application code
- ❌ Store passphrases in version control
- ❌ Share passphrases between environments
- ❌ Use weak or guessable passphrases
- ❌ Lose your passphrase (no recovery mechanism exists)

### Environment Variables

```bash
# Required for encrypted databases
export LEX_DB_KEY="your-passphrase-here"

# Optional: Custom database path
export LEX_DB_PATH="/custom/path/to/database.db"

# Production mode (requires LEX_DB_KEY)
export NODE_ENV="production"
```

### Example: Production Deployment

```bash
#!/bin/bash
# production-deploy.sh

# Generate strong passphrase (save to password manager!)
PASSPHRASE=$(openssl rand -base64 32)

# Encrypt database for production
LEX_DB_KEY="$PASSPHRASE" lex db encrypt \
  --input .smartergpt/lex/memory.db \
  --output .smartergpt/lex/memory-prod.db \
  --verify

# Deploy with encrypted database
export NODE_ENV="production"
export LEX_DB_KEY="$PASSPHRASE"
export LEX_DB_PATH=".smartergpt/lex/memory-prod.db"

# Application will now use encrypted database
lex mcp
```

### Migration Workflow

```bash
# Step 1: Create backup of existing database
lex db backup --rotate 5

# Step 2: Encrypt database with verification
LEX_DB_KEY="new-passphrase" lex db encrypt --verify

# Step 3: Test encrypted database
LEX_DB_KEY="new-passphrase" lex recall "test query"

# Step 4: If successful, rename encrypted database
mv .smartergpt/lex/memory-encrypted.db .smartergpt/lex/memory.db

# Step 5: Update environment configuration
echo 'export LEX_DB_KEY="new-passphrase"' >> ~/.bashrc
```

### Security Considerations

**Encryption Scope:**
- ✅ All Frame data (timestamps, branches, summaries, status)
- ✅ Atlas maps and module metadata
- ✅ FTS5 search indexes
- ✅ Schema and migration history

**NOT Encrypted:**
- ❌ Backups (use `lex db backup` after encryption)
- ❌ In-memory data during runtime
- ❌ Log files (configure logger separately)
- ❌ Files in `.smartergpt/` (git-ignored, but not encrypted)

**Performance Impact:**
- ~10-17% overhead for read operations
- ~20% overhead for write operations
- Negligible impact for typical workloads (<10K frames)
- See `docs/PERFORMANCE.md` for detailed benchmarks

### Troubleshooting

**Error: "Failed to open encrypted database. The encryption key may be incorrect."**
- Verify `LEX_DB_KEY` is set correctly
- Check for typos in passphrase
- Ensure database was encrypted with the same passphrase

**Error: "LEX_DB_KEY environment variable is required in production mode."**
- Set `LEX_DB_KEY` environment variable
- Or change `NODE_ENV` to development/test for unencrypted mode

**Database corrupted after power loss:**
- SQLCipher uses SQLite's WAL mode (write-ahead logging)
- Restore from most recent backup: `lex db backup --rotate 5`

---

## HTTP Server Security (New in 0.4.2)

**⚠️ IMPORTANT: HTTP mode is less secure than MCP stdio mode. Use stdio for local development.**

### Security Features (0.4.2+)

The HTTP Frame Ingestion API includes the following security hardening:

✅ **Mandatory API Key Authentication**
- API key is REQUIRED (cannot start server without it)
- Bearer token authentication on all `/api/frames` endpoints
- Separate rate limiting for auth failures (5 attempts / 15min)

✅ **Rate Limiting**
- General API: 100 requests per 15 minutes per IP
- Auth failures: 5 attempts per 15 minutes per IP
- Configurable via `HttpServerOptions`

✅ **Request Security**
- 1MB request size limit (prevents memory exhaustion)
- Security headers via Helmet (CSP, HSTS, etc.)
- JSON strict parsing only

✅ **Audit Logging**
- All HTTP requests logged with: method, path, status, duration, IP, user agent
- API key hashes logged (NOT the actual keys)
- Separate audit logger: `memory:mcp_server:audit`

### Deployment Best Practices

**DO:**
- ✅ Use strong, randomly-generated API keys (32+ characters)
- ✅ Deploy behind TLS-terminating reverse proxy (nginx, Caddy, Traefik)
- ✅ Bind to localhost and proxy from reverse proxy
- ✅ Monitor audit logs for suspicious activity
- ✅ Rotate API keys regularly
- ✅ Use environment variables for API keys (never commit to git)

**DON'T:**
- ❌ Expose HTTP server directly to internet without reverse proxy
- ❌ Use weak or guessable API keys
- ❌ Share API keys across multiple clients
- ❌ Log API keys in application code
- ❌ Use HTTP mode for local development (use stdio instead)

### Example: Nginx Reverse Proxy with TLS

```nginx
server {
  listen 443 ssl http2;
  server_name lex.internal.company.com;

  # TLS configuration (Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/lex.internal.company.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/lex.internal.company.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Frame-Options DENY always;
  add_header X-Content-Type-Options nosniff always;

  # Proxy to Lex HTTP server (localhost only)
  location /api/frames {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Additional rate limiting at nginx level
    limit_req zone=api_limit burst=20 nodelay;
  }

  # Health check (no auth required)
  location /health {
    proxy_pass http://127.0.0.1:3000;
    access_log off;
  }
}

# Rate limit zone definition (add to http block)
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

### Starting HTTP Server

```typescript
import { startHttpServer } from "lex/memory/mcp_server";
import { openDatabase } from "lex/memory/store";

const db = openDatabase();

// API key MUST be provided (will throw error if missing)
await startHttpServer(db, {
  apiKey: process.env.LEX_HTTP_API_KEY!, // Required
  port: 3000,
  rateLimitWindowMs: 15 * 60 * 1000, // Optional: 15min (default)
  rateLimitMaxRequests: 100, // Optional: 100 req/window (default)
});
```

### Environment Variables

```bash
# Required for HTTP mode
export LEX_HTTP_API_KEY="your-secure-random-api-key-here"

# Optional configuration
export LEX_HTTP_PORT="3000"
export LEX_HTTP_RATE_LIMIT_WINDOW="900000"  # 15min in ms
export LEX_HTTP_RATE_LIMIT_MAX="100"
```

### MCP Stdio Mode (Recommended for Local Dev)

For local development and personal use, **MCP stdio mode is safer**:

```json
// Claude Desktop config: ~/.config/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "lex": {
      "command": "lex",
      "args": ["mcp"],  // stdio mode (default) - NO HTTP server
      "env": {}
    }
  }
}
```

**Why stdio is safer:**
- ✅ No network exposure (not listening on any port)
- ✅ Runs as subprocess of MCP client
- ✅ Inherits OS-level permissions
- ✅ Cannot be accessed remotely
- ✅ No need for API keys or TLS

**When to use HTTP mode:**
- CI/CD pipelines need to POST frames programmatically
- External tools (non-MCP) require webhook-based ingestion
- Distributed systems need centralized frame storage
- You have proper reverse proxy with TLS

---

## Known Limitations (0.4.0-alpha)

## Reporting a Vulnerability

**⚠️ Please do NOT report security vulnerabilities through public GitHub issues.**

### Reporting Channels

1. **GitHub Security Advisories** (preferred):
   - [Report a vulnerability](https://github.com/Guffawaffle/lex/security/advisories/new)
   - Provides private communication and coordinated disclosure

2. **Email** (alternative):
   - Contact the maintainer team through GitHub profile
   - Use subject line: `[SECURITY] Brief description`
   - Include "SECURITY" in subject for priority handling

### What to Include

Please provide:

- **Type of vulnerability**: Buffer overflow, injection, XSS, etc.
- **Full paths** of affected source files
- **Location**: Tag/branch/commit or direct URL
- **Step-by-step reproduction**: Detailed instructions
- **Proof-of-concept**: Code demonstrating the issue (if possible)
- **Impact**: How this could be exploited in practice
- **Affected versions**: Which versions are vulnerable
- **Suggested fix**: If you have one (optional but appreciated)

### Example Report

```
Vulnerability Type: SQL Injection in Frame Storage

Affected Component: src/memory/store/index.ts:42
Affected Versions: 0.1.0 - 0.2.0
Location: https://github.com/Guffawaffle/lex/blob/main/src/memory/store/index.ts#L42

Description:
User-controlled input in `searchFrames()` is concatenated directly into SQL query
without sanitization, allowing arbitrary SQL execution.

Reproduction:
1. Call searchFrames(db, { referencePoint: "'; DROP TABLE frames; --" })
2. Observe that the frames table is deleted

Impact:
Remote attackers can read/modify/delete all frame data

Suggested Fix:
Use parameterized queries with db.prepare() instead of string concatenation
```

### What NOT to Include

- ❌ **Production credentials** or API keys
- ❌ **Personal data** from production systems
- ❌ **Customer information** or proprietary code
- ❌ **Unverified claims** without reproduction steps

---

## Response Timeline

| Stage | Timeline |
|-------|----------|
| **Acknowledgment** | Within 48 hours of report |
| **Initial Assessment** | Within 7 days |
| **Detailed Response** | Within 7-14 days |
| **Fix Development** | Varies by severity (see below) |
| **Public Disclosure** | After fix is released |

### Severity Levels

**Critical** (CVSS 9.0-10.0):
- Fix target: 7 days
- Examples: Remote code execution, authentication bypass

**High** (CVSS 7.0-8.9):
- Fix target: 14 days
- Examples: SQL injection, privilege escalation

**Medium** (CVSS 4.0-6.9):
- Fix target: 30 days
- Examples: XSS, information disclosure

**Low** (CVSS 0.1-3.9):
- Fix target: 90 days or next release
- Examples: Low-impact information leaks

---

## Disclosure Process

We follow **coordinated disclosure**:

1. **Private Report**: You report the vulnerability privately
2. **Investigation**: We investigate and confirm the issue
3. **Fix Development**: We develop and test a fix
4. **Release**: We release patched version(s)
5. **Public Disclosure**: We publish a security advisory (typically 24-48 hours after release)
6. **Credit**: We credit you in the advisory (unless you prefer anonymity)

### Credit

If you wish to be credited:
- Provide your name/handle and optional link (GitHub, website, etc.)
- We will include you in:
  - Security advisory on GitHub
  - Release notes
  - CHANGELOG.md

If you prefer to remain anonymous, let us know and we will not mention your name.

---

## Security Best Practices for Users

### Installation

```bash
# ✅ Install from npm (with provenance verification)
npm install lex
npm audit signatures

# ✅ Use specific versions (not ranges)
npm install lex@0.2.0

# ⚠️ Avoid installing from unverified sources
```

### Dependency Management

```bash
# Run security audits regularly
npm audit

# Fix vulnerabilities automatically (review changes!)
npm audit fix

# Check for outdated packages
npm outdated
```

### Runtime Security

When using Lex in your application:

- ✅ **Validate input**: Sanitize user input before passing to Lex APIs
- ✅ **Use latest version**: Keep Lex updated to get security patches
- ✅ **Review CHANGELOG**: Check for security-related changes before upgrading
- ✅ **Enable Dependabot**: Set up automated dependency updates
- ✅ **Least privilege**: Run with minimal required permissions
- ✅ **Secure storage**: If using frame storage, ensure database files are protected

### Configuration Security

```typescript
// ✅ Good: Validate module IDs before use
const moduleId = validateModuleId(userInput);
const frame = await saveFrame(db, { moduleScope: [moduleId] });

// ❌ Bad: Using user input directly
const frame = await saveFrame(db, { moduleScope: [userInput] });
```

### Sensitive Data

- ❌ **Do NOT** store credentials, API keys, or secrets in frames
- ❌ **Do NOT** include production PII in memory captures
- ✅ **Do** use frames for architectural context and work status only
- ✅ **Do** review frame contents before sharing

---

## Security Verification

All releases include:

### Signed Git Tags
```bash
# Verify tag signature
git verify-tag v0.2.0

# Expected output:
# gpg: Good signature from "Maintainer Name <email>"
```

### npm Provenance
```bash
# Verify package provenance
npm audit signatures lex

# Check package integrity
npm view lex@0.2.0 dist.integrity
```

### Checksums
Release artifacts include SHA256 checksums:
```bash
# Verify tarball
sha256sum lex-0.2.0.tgz
# Compare with published checksum in release notes
```

---

## Automated Security

We use:

- **Dependabot**: Automated dependency updates
- **CodeQL**: Static analysis for security issues
- **npm audit**: Vulnerability scanning in CI
- **Snyk**: Additional dependency monitoring (planned)

---

## Security-Related Configuration

### Recommended npm Config

```bash
# Enforce HTTPS for registry
npm config set registry https://registry.npmjs.org/

# Enable audit during install
npm config set audit true

# Require signatures
npm config set require-signatures true
```

### Environment Variables

None currently. Lex does not require environment variables for core functionality.

---

## Known Security Considerations

### Local Storage

- Frames are stored in local SQLite database (no network)
- Database file permissions should be restricted (chmod 600)
- No encryption at rest (use OS-level encryption if needed)

### CLI Execution

- CLI runs with user privileges
- No elevation or sudo required
- Scripts in `scripts/` should not be run as root

### MCP Server

- MCP server runs over stdio (no network exposure)
- Input validation is performed on all MCP requests
- No authentication required (local process communication only)

---

## Contact

For security concerns:
- GitHub Security Advisories: [Report here](https://github.com/Guffawaffle/lex/security/advisories/new)
- General questions: [GitHub Discussions](https://github.com/Guffawaffle/lex/discussions)

For non-security bugs: [GitHub Issues](https://github.com/Guffawaffle/lex/issues)

---

## Updates to This Policy

This security policy may be updated periodically. Check the git history for changes:

```bash
git log -p SECURITY.md
```

Last updated: November 2025

- **Signed with GPG**: Verify tags with `git verify-tag v<version>`
- **Published with provenance**: Verify with `npm audit signatures`
- **Scanned for vulnerabilities**: CodeQL, Snyk, and npm audit in CI

## Security Features

- **Hermetic builds**: All CI builds use `npm ci --ignore-scripts`
- **No network in tests**: Tests run offline to prevent supply chain attacks
- **Hardened runners**: CI uses `step-security/harden-runner` for egress auditing
- **Dependency scanning**: Automated security updates via Dependabot
- **Code scanning**: Weekly CodeQL and OpenSSF Scorecard analysis

## Security Hall of Fame

We appreciate security researchers who help keep Lex secure:

<!-- Security researchers who report vulnerabilities will be listed here -->

---

**Last updated**: November 6, 2025
