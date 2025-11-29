# SQLite Native Bindings

Lex uses [`better-sqlite3-multiple-ciphers`](https://github.com/nickinchina/better-sqlite3-multiple-ciphers) for encrypted SQLite storage. This is a **native addon** that compiles C++ code during installation.

## Why Native Bindings Break

Native Node.js addons are compiled against a specific:
- **Node.js ABI version** (changes with Node major/minor versions)
- **Platform** (linux-x64, darwin-arm64, win32-x64)
- **C library** (glibc version on Linux)

When any of these change, the compiled binary becomes incompatible, causing errors like:
- `Error: Module did not self-register`
- `Error: The module was compiled against a different Node.js version`
- `NODE_MODULE_VERSION mismatch`

## Common Scenarios That Break Bindings

| Scenario | What Happened | Fix |
|----------|---------------|-----|
| `nvm use` / `fnm use` | Switched Node version | `npm run rebuild-sqlite` |
| Fresh `npm ci` | Binary not in node_modules | `npm run rebuild-sqlite` |
| Copied node_modules | Different machine/platform | `rm -rf node_modules && npm ci` |
| WSL → Windows | Cross-platform mismatch | `npm run rebuild-sqlite` |

## Quick Fix

```bash
npm run rebuild-sqlite
```

This runs `npm rebuild better-sqlite3-multiple-ciphers` to recompile for your current Node.js.

## Verifying Bindings

```bash
npm run check-sqlite
```

This runs a health check that:
1. Loads the native module
2. Opens an in-memory database
3. Runs a test query
4. Checks SQLCipher availability

If bindings are broken, it exits with code 1 and prints fix instructions.

## CI Integration

The `scripts/ci.sh` script (used by `npm run local-ci`) automatically:
1. Rebuilds SQLite bindings after `npm ci`
2. Runs the health check before tests
3. Fails fast with clear instructions if bindings are broken

## Doctrine

**We treat broken SQLite bindings as a failing gate, not a shrug.**

- `npm test` is expected to be green on a correctly set up machine
- Mass test failures from binding errors are a real bug, not "dev quirks"
- The health check gate catches this early with actionable errors

## Supported Node.js Version

See `.nvmrc` and `package.json#engines` for the supported Node.js version.

Lex is tested on the version specified there. Other versions may work but are not guaranteed, especially for native addons.

## Troubleshooting

### "Cannot find module" after npm ci

```bash
npm run rebuild-sqlite
npm run check-sqlite  # verify it works
```

### Health check passes but tests still fail

The issue may be elsewhere. Check:
1. Is the database file corrupted? Delete `.smartergpt/lex/lex.db` and retry
2. Are there permission issues? Check file ownership
3. Is disk space available?

### Building from source fails

The `better-sqlite3-multiple-ciphers` package needs a C++ compiler:

**macOS:**
```bash
xcode-select --install
```

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential python3
```

**Windows:**
```bash
npm install -g windows-build-tools
```
