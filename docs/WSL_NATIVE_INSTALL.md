# WSL Native Lex Install

This guide keeps the `lex` command in WSL native, stable, and visible on
`PATH` for tools such as AXF. Do not point `lex` at `~/.npm/_npx/...`;
that directory is a cache and may disappear or be replaced by npm.

## Recommended: user-local npm global install

Use this when WSL should run a packaged Lex CLI without depending on
Windows npm shims or sudo-owned global installs.

```bash
cd /srv/lex-mcp/lex
npm ci
npm run build
npm run check-sqlite

npm config set prefix "$HOME/.local"
mkdir -p "$HOME/.local/bin"

# Add this to ~/.bashrc, ~/.zshrc, or your shell profile if needed.
export PATH="$HOME/.local/bin:$PATH"

npm install --global "$PWD"
hash -r
```

Confirm WSL resolves the user-local native install before any stale
system install or Windows path entry:

```bash
type -a lex
command -v lex
readlink -f "$(command -v lex)" || true
lex --version
```

Expected shape:

- `command -v lex` resolves under `$HOME/.local/bin`.
- `lex --version` reports the version from this checkout/package.
- Later `type -a lex` entries under `/usr/bin`, `/bin`, or `/mnt/c/...`
  are not the active command.

## Checkout bridge: stable user-local symlink

Use this only when you deliberately want WSL `lex` to track a stable
source checkout after each build.

```bash
cd /srv/lex-mcp/lex
npm ci
npm run build
npm run check-sqlite

mkdir -p "$HOME/.local/bin"
ln -sfn "$PWD/dist/shared/cli/lex.js" "$HOME/.local/bin/lex"
export PATH="$HOME/.local/bin:$PATH"
hash -r
```

This is durable because it points at a stable checkout path, not npm's
`_npx` cache. Re-run `npm run build` after source changes.

## Native module requirements

Lex uses `better-sqlite3-multiple-ciphers`, a native addon compiled for
the current Node.js ABI and platform. Keep WSL and Windows installs
separate; do not share `node_modules` across the Linux/Windows boundary.

WSL/Ubuntu build prerequisites:

```bash
sudo apt-get update
sudo apt-get install build-essential python3
```

If Node.js changes, rebuild and verify the native bindings:

```bash
cd /srv/lex-mcp/lex
npm run rebuild-sqlite
npm run check-sqlite
```

See [SQLite Native Bindings](./dev/sqlite-bindings.md) for detailed
binding failure modes and repair steps.

## Read-only validation

These commands validate the executable path without running write Lex
commands. `LEX_DB_PATH` keeps recall validation state in a temporary
database instead of the caller workspace.

```bash
lex --version
lex introspect --json
LEX_DB_PATH="$(mktemp -d)/memory.db" lex recall --list 1 --json
```

For AXF, confirm the same `lex` is reachable from `PATH`:

```bash
axf --workspace <repo> run global.lex.status --json
```

## Avoid

- Do not point `~/.local/bin/lex` at `~/.npm/_npx/...`.
- Do not let WSL pick `lex.CMD`, `lex.ps1`, or other Windows npm shims
  through `/mnt/c/...` PATH entries.
- Do not use Lex write commands such as `lex remember` just to validate
  installation.
