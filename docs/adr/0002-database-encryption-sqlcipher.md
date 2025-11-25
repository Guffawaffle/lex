# ADR 0002: Database Encryption with SQLCipher

**Status:** Accepted  
**Date:** 2025-11-24  
**Deciders:** Engineering Team  
**Related Issues:** #273

## Context

Lex stores sensitive development data in a local SQLite database:
- Work session metadata (Frame summaries, reference points)
- Module dependency information (Atlas maps)
- Status snapshots with next actions and blockers
- Potentially sensitive architectural decisions

Previously, this data was stored **unencrypted** on disk, which poses security risks:
1. **Data Breach:** If laptop/workstation is stolen, Frame data is readable
2. **Compliance:** Some organizations require encryption at rest for all development data
3. **Production Readiness:** v0.5.0 targets internal production use, requiring security hardening

## Decision

We will integrate **SQLCipher** for database encryption at rest, using **better-sqlite3-multiple-ciphers** as the implementation library.

### Key Decisions

1. **Library Choice:** better-sqlite3-multiple-ciphers v12.4.6
   - Drop-in replacement for better-sqlite3
   - API-compatible (minimal code changes)
   - Actively maintained (Nov 2025 release)
   - Supports SQLCipher 4.x

2. **Encryption Strategy:**
   - AES-256 encryption (SQLCipher default)
   - PBKDF2-SHA256 key derivation (64,000 iterations)
   - Environment variable-based key management (`LEX_DB_KEY`)
   - Mandatory in production mode (`NODE_ENV=production`)

3. **Migration Approach:**
   - Non-destructive migration (creates new encrypted database)
   - CLI command: `lex db encrypt`
   - Data integrity verification with SHA-256 checksums
   - Backward compatible (unencrypted databases still work in dev/test)

4. **Key Management:**
   - Passphrase-based (not raw keys)
   - No key recovery mechanism (user responsibility)
   - Deterministic derivation (same passphrase = same key)

## Alternatives Considered

### 1. @journeyapps/sqlcipher
**Pros:**
- Official Node.js SQLCipher bindings
- Well-documented

**Cons:**
- Different API from better-sqlite3 (requires rewrite)
- Async-only (better-sqlite3 is synchronous)
- Would break existing code patterns

**Decision:** Rejected due to API incompatibility

### 2. better-sqlite3-sqlcipher
**Pros:**
- Drop-in replacement

**Cons:**
- Last updated 2020 (unmaintained)
- Stuck on SQLite 3.30.x
- No recent security patches

**Decision:** Rejected due to lack of maintenance

### 3. File System Encryption (LUKS, FileVault, BitLocker)
**Pros:**
- Operating system level
- No application changes
- Transparent to application

**Cons:**
- User must configure (not guaranteed)
- Doesn't protect against OS-level attacks
- Not portable across machines
- Doesn't meet compliance requirements (application-level encryption)

**Decision:** Rejected; not sufficient for production requirements

### 4. Application-Level Encryption (Field-Level)
**Pros:**
- Fine-grained control
- Column-level encryption

**Cons:**
- Cannot use FTS5 on encrypted text
- Complex key management
- Performance overhead on every field access
- Breaks SQL indexes

**Decision:** Rejected; unacceptable performance and functionality trade-offs

## Consequences

### Positive

✅ **Security Hardening**
- Database files are encrypted at rest
- Meets compliance requirements for production use
- Protection against physical theft

✅ **Backward Compatibility**
- Unencrypted databases still work in dev/test
- Existing code unchanged (transparent encryption)
- Migration is optional for existing users

✅ **Minimal Performance Impact**
- <20% overhead on most operations (acceptable)
- One-time costs for DB open (~20ms)
- See `docs/PERFORMANCE.md` for benchmarks

✅ **Production Ready**
- Mandatory encryption in production mode
- Clear migration path for existing users
- Comprehensive error handling

### Negative

❌ **Key Management Burden**
- Users must manage passphrases securely
- No key recovery if passphrase is lost
- Rotation requires re-encryption

❌ **Platform Complexity**
- Native module (node-gyp compilation required)
- Platform-specific binaries (Linux, macOS, Windows)
- Larger package size (~2MB for native modules)

❌ **Migration Effort**
- Existing users must migrate databases manually
- Requires downtime during migration
- Backup strategy essential

### Neutral

🔄 **Dependency Change**
- Swap better-sqlite3 → better-sqlite3-multiple-ciphers
- Same API, different package
- Security updates tied to new package

🔄 **Testing Requirements**
- New test suite for encryption (13 tests added)
- Platform compatibility testing (Linux, macOS, Windows)
- Migration testing for various database sizes

## Implementation Notes

### Code Changes

1. **Database Initialization** (`src/memory/store/db.ts`)
   - Added `deriveEncryptionKey()` function (PBKDF2)
   - Added `getEncryptionKey()` for env var management
   - Modified `createDatabase()` to apply encryption

2. **CLI Command** (`src/shared/cli/db.ts`)
   - New `lex db encrypt` command
   - Checksum verification for migration
   - Non-destructive migration (new file)

3. **Documentation** (multiple files)
   - `SECURITY.md`: Key management guide
   - `README.md`: Environment variables section
   - `docs/PERFORMANCE.md`: Encryption benchmarks

### Migration Guide

For existing Lex users:

```bash
# 1. Backup existing database
lex db backup --rotate 5

# 2. Encrypt with verification
LEX_DB_KEY="your-passphrase" lex db encrypt --verify

# 3. Test encrypted database
LEX_DB_KEY="your-passphrase" lex recall "test"

# 4. Rename to replace original
mv memory-encrypted.db memory.db

# 5. Configure environment
echo 'export LEX_DB_KEY="your-passphrase"' >> ~/.bashrc
```

## Compliance

This decision supports:
- ✅ GDPR (Article 32: Security of Processing)
- ✅ SOC 2 (Encryption at rest requirement)
- ✅ PCI DSS (Requirement 3.4: Encryption of cardholder data)
- ✅ HIPAA (§164.312 Technical Safeguards)

*Note: Lex is not certified for these standards, but encryption is a prerequisite*

## Future Work

Planned enhancements for v0.6.0+:

- [ ] Key rotation mechanism (re-encrypt with new passphrase)
- [ ] Hardware security module (HSM) integration for enterprises
- [ ] Automatic key backup to password managers
- [ ] Encrypted backup format (`lex db backup --encrypt`)
- [ ] Performance tuning (custom page sizes, caching)

## References

- [SQLCipher Documentation](https://www.zetetic.net/sqlcipher/)
- [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)
- [OWASP Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
- [Issue #273: SQLCipher Integration](https://github.com/Guffawaffle/lex/issues/273)

---

**Signed-off-by:** Engineering Team  
**Reviewed-by:** Security Team  
**Approved:** 2025-11-24
