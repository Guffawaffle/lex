# Node 24 runtime migration

Lex 3.1 raises the supported runtime floor from Node 20–24 to Node 24 or newer. Node 20 and Node 22
are no longer tested or supported. Lex does not impose a `<25` ceiling without evidence of an actual
incompatibility.

## Who must act

Upgrade before installing the Lex 3.1 release if any current environment reports a Node major below
24:

```bash
node --version
npm --version
```

The supported baseline used by the release gates is Node 24 with its current bundled npm line.

## Clean dependency refresh

Native SQLite modules are compiled for a specific Node ABI. After changing Node majors, refresh the
checkout's dependencies and rebuild the native module under Node 24:

```bash
npm ci --ignore-scripts
npm rebuild better-sqlite3-multiple-ciphers
npm run check-sqlite
```

Do not copy `node_modules` between Windows, WSL, Linux, or macOS. Each native execution surface must
install and rebuild independently.

## Consumer behavior

- npm may warn or fail engine validation when a Lex 3.1 package is installed below Node 24.
- Existing Lex 3.0.1 artifacts retain their published `>=20 <25` contract; their metadata is
  immutable.
- The 3.1 line validates package exports, CLI startup, MCP startup/tool inventory, and native SQLite
  loading on Node 24.
- A future Node release is not rejected preemptively. If evidence finds an incompatibility, open a
  bounded issue and add a reviewed ceiling or workaround then.

## CI and container migration

Replace Node 20/22 matrices and images with Node 24. Current Lex workflows intentionally test one
supported major rather than spending required CI time proving runtimes the package no longer
supports.

Run the drift guard locally when editing package, workflow, container, or runtime documentation:

```bash
npm run check:node-runtime
```

The guard checks package/lock metadata, `.nvmrc`, the CI image, active workflows, current guidance,
and the Ecosystem 3.1 manifest. Historical changelog statements remain unchanged because they
describe earlier immutable releases.
