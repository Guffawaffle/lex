# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

**Version Support Policy:**
- We support the current minor version (0.2.x) and one previous minor version (0.1.x)
- Patch releases (e.g., 0.2.1 → 0.2.2) receive security fixes for 90 days after the next patch
- Major security issues will be backported to supported versions
- Once we reach 1.0.0, we will follow semantic versioning strictly

---

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
