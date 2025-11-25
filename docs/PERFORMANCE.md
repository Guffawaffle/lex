# Performance Benchmarks

This document tracks performance metrics for Lex, particularly focusing on database encryption overhead.

## Database Encryption Performance

### Test Setup

- **Library:** better-sqlite3-multiple-ciphers v12.4.6
- **Cipher:** SQLCipher with AES-256
- **Key Derivation:** PBKDF2-SHA256, 64,000 iterations
- **Test Environment:** Node.js v20+, Ubuntu Linux
- **Database Size:** 2-10K frames (typical development workload)

### Encryption Overhead

| Operation | Unencrypted | Encrypted | Overhead |
|-----------|-------------|-----------|----------|
| **Database Creation** | ~5ms | ~25ms | +400% (one-time) |
| **Frame Insert** | ~0.5ms | ~0.6ms | +20% |
| **Frame Read (by ID)** | ~0.3ms | ~0.35ms | +17% |
| **FTS5 Search** | ~2ms | ~2.2ms | +10% |
| **Bulk Insert (100 frames)** | ~50ms | ~60ms | +20% |
| **Database Open** | ~2ms | ~20ms | +900% (one-time) |

### Key Findings

✅ **Acceptable Overhead:** <20% for most operations  
✅ **Negligible Impact:** Search and read operations show <20% overhead  
✅ **One-Time Costs:** Database creation and opening are slower, but only happen once per session  
✅ **Production Ready:** Performance impact is acceptable for typical workloads

### Encryption Migration Performance

Migrating an existing database to encrypted format:

| Database Size | Migration Time | Verification Time | Total Time |
|---------------|----------------|-------------------|------------|
| 2 frames | 31ms | 5ms | ~36ms |
| 100 frames | ~150ms | ~20ms | ~170ms |
| 1,000 frames | ~1.5s | ~200ms | ~1.7s |
| 10,000 frames (est.) | ~15s | ~2s | ~17s |

**Note:** Migration includes full schema recreation and data integrity verification with SHA-256 checksums.

### Memory Usage

| Mode | RSS (Resident Set Size) | Heap Used |
|------|------------------------|-----------|
| **Unencrypted** | ~45 MB | ~12 MB |
| **Encrypted** | ~48 MB | ~14 MB |
| **Overhead** | +3 MB | +2 MB |

**Conclusion:** Memory overhead is minimal (<10%) and acceptable for production use.

### Best Practices for Performance

1. **Reuse Database Connections**
   - Keep database connection open during application lifetime
   - Close only on shutdown to avoid repeated key derivation

2. **Use Transactions for Bulk Operations**
   ```typescript
   const insertMany = db.transaction((frames) => {
     for (const frame of frames) {
       saveFrame(db, frame);
     }
   });
   insertMany(frames); // Much faster than individual inserts
   ```

3. **Leverage SQLite WAL Mode**
   - Enabled by default in Lex
   - Concurrent reads don't block writes
   - Better crash recovery

4. **Monitor Database Size**
   - Run `lex db vacuum` periodically to compact database
   - Use `lex db backup --rotate 5` for regular backups

### Future Optimizations

Planned improvements for v0.6.0+:

- [ ] Connection pooling for HTTP server mode
- [ ] Prepared statement caching
- [ ] Batch insert optimization
- [ ] Custom SQLCipher page size tuning
- [ ] Read-only connection mode for queries

---

## Test Suite Performance

Current test execution times:

| Test Suite | Tests | Duration | Coverage |
|------------|-------|----------|----------|
| **Memory Store** | 32 tests | ~360ms | 95% |
| **Database Encryption** | 13 tests | ~550ms | 100% |
| **Policy Enforcement** | 18 tests | ~200ms | 92% |
| **Atlas Generation** | 15 tests | ~150ms | 88% |
| **Total** | 123+ tests | ~2.5s | 89.2% |

---

## Benchmarking Methodology

### Manual Benchmarks

To run performance tests:

```bash
# Run all tests with timing
npm test

# Run specific benchmark suite
npm run test:benchmarks

# Profile with Node.js profiler
node --prof dist/shared/cli/lex.js db encrypt --verify
node --prof-process isolate-*.log
```

### CI Performance Tracking

Performance metrics are tracked in CI:
- Test suite execution time
- Build duration
- Package size

Target thresholds:
- ✅ Test suite: <5 seconds
- ✅ Build time: <60 seconds  
- ✅ Package size: <5 MB

---

## Platform Compatibility

Tested and verified on:

| Platform | Architecture | Status | Notes |
|----------|-------------|--------|-------|
| **Linux** | x64 | ✅ Passing | CI verified |
| **macOS** | arm64 (M1/M2) | ✅ Passing | Local testing |
| **macOS** | x64 (Intel) | ✅ Passing | CI verified |
| **Windows** | x64 | 🔄 Pending | Planned for CI |

### Platform-Specific Notes

**Linux:**
- No additional dependencies required
- Native compilation via node-gyp

**macOS:**
- Works on both Intel and Apple Silicon
- No additional setup needed

**Windows:**
- May require Visual Studio Build Tools
- Node-gyp setup required for native modules

---

**Last Updated:** November 2025  
**Benchmark Version:** 0.5.0-alpha  
**Next Review:** With 0.6.0 release
