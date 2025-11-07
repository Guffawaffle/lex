# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via:

- **GitHub Security Advisories** (preferred): [Report a vulnerability](https://github.com/Guffawaffle/lex/security/advisories/new)
- **Email**: Contact the maintainer team through GitHub profile

### What to expect:

1. **Acknowledgment**: You will receive a response within **48 hours** acknowledging receipt of your report
2. **Assessment**: We will investigate and provide a detailed response within **7 days**
3. **Resolution**: We will release a fix as soon as possible, typically within **14 days** for critical issues
4. **Credit**: You will be credited in the security advisory (unless you prefer to remain anonymous)

### Please include:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability

## Security Best Practices

When using Lex packages:

- ✅ **Always use the latest stable version** from the `main` branch
- ✅ **Review CHANGELOG.md** for security updates before upgrading
- ✅ **Enable Dependabot alerts** in your repository
- ✅ **Use signed releases only** (verify GPG signatures on tags)
- ✅ **Verify npm package provenance** with `npm audit signatures`
- ✅ **Run `npm audit`** regularly in your projects using Lex

## Verification

All releases are:

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
