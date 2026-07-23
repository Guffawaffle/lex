# Lex package release checklist

This is the release checklist for `@smartergpt/lex`. The current coordinated release is
**Lex 4.0.0 in the Ecosystem 3.1 train**.

Use these documents as the release authority:

- [Ecosystem 3.1 release SOP](docs/releases/ecosystem-3.1.md) for dependency order, evidence,
  partial-publication recovery, signed refs, and manifest sealing;
- [Lex 4.0 migration and recovery guide](docs/releases/lex-4.0-migration.md) for the breaking
  Node 24 floor, consumer migration, MCP transport migration, and rollback boundaries;
- [documentation inventory](docs/releases/ecosystem-3.1-documentation-inventory.md) for current
  documentation owners and bounded follow-up cleanup.

The machine-readable release record is
[`releases/ecosystem-3.1.json`](releases/ecosystem-3.1.json). Do not infer an ecosystem component's
package version from the train name.

## Authority and human checkpoints

Agents may prepare and verify a candidate, create a tarball, run dry-run publication checks, and
print the next command. A human maintainer performs:

- non-dry-run npm publication;
- signed annotated tag creation and push; and
- protected MCP Registry approval.

The Lex tag is `v<version>`. Do not push a tag before both exact npm packages required by Lex's
Registry workflow are public.

## Candidate identity

For Lex 4.0.0, these values must agree:

- `package.json` and the package-lock root: `@smartergpt/lex@4.0.0`;
- `server.json`: `dev.smartergpt/lex@4.0.0`, transporting
  `@smartergpt/lex-mcp@4.0.0`;
- Ecosystem 3.1 manifest Lex and Lex-MCP targets: `4.0.0`;
- README and changelog current release: `4.0.0`;
- Node engine: exactly `>=24`, with no speculative upper bound.

Run:

```bash
npm run check:node-runtime
npm run check:ecosystem-release
npm run check:mcp-registry-contract
npm run validate-docs
```

`npm run check:release-drift` is a post-tag audit. It is expected to report the missing `v4.0.0`
tag while an untagged candidate is under review.

## Candidate gates

Use touched and adjacent gates during implementation. Run the exhaustive gate once on the final,
clean candidate:

```bash
npm ci --ignore-scripts
npm rebuild better-sqlite3-multiple-ciphers
npm run check-sqlite
npm run validate-schemas
npm run validate-docs
npm run check:node-runtime
npm run check:ecosystem-release
npm run check:mcp-registry-contract
npm run ci:full
npm run test:smoke
```

`ci:full` already includes the build, public API check, tests, and pack guard. Preserve its receipt
from the exact candidate commit. The clean-consumer proof must install the produced package without
a workspace link or `file:` dependency.

Before publication, also require:

- native Windows Node 24 packed-consumer proof;
- ESM exports and CommonJS dynamic `import()` proof;
- CLI version/help;
- MCP initialization, notification silence, and the canonical fourteen-tool inventory;
- disposable SQLite create/write/read;
- isolated PostgreSQL credential-pass-through proof that never queries or mutates an existing
  project or user database.

Stop at the first failing gate and record what was not run.

## Review and candidate receipt

The release PR must contain:

- the SemVer decision and Ecosystem 3.1 relationship;
- exact candidate commit;
- gate results and artifact integrity;
- migration/recovery documentation;
- any known warning that does not change acceptance;
- downstream proof links; and
- an explicit statement that nothing was published or tagged.

The worktree must be clean before recording the final commit. Review changes to package identity,
the lockfile, `server.json`, current docs, workflows, and generated artifacts together.

## Human npm publication

After the reviewed Lex release commit is merged and checked out exactly, the maintainer runs:

```bash
cd /srv/lex-mcp/lex
npm whoami
npm access list packages smartergpt --json
git status --short
git rev-parse HEAD
npm publish --access public
```

The expected npm identity is `guffawaffle`. The worktree must be clean, and `HEAD` must equal the
reviewed release commit recorded in the candidate receipt. Do not publish from an unreviewed local
change or mutable branch state.

Verify the immutable public artifact:

```bash
npm view @smartergpt/lex@4.0.0 version engines dist.integrity --json
```

Record its `sha512-` integrity in the Ecosystem 3.1 manifest. Do not use `latest` as the sole
identity proof.

## Dependent package and tag order

After Lex is public:

1. refresh and verify each dependent lock from public `@smartergpt/lex@4.0.0`;
2. complete the manifest-selected LexSona, LexRunner, AXF, and STFC-Mod proofs;
3. publish exact `@smartergpt/lex-mcp@4.0.0` from its own reviewed checkout;
4. verify both public npm artifacts and their exact dependency edge;
5. create, verify, and push the signed Lex `v4.0.0` tag;
6. create, verify, and push the signed Lex-MCP `v4.0.0` tag;
7. verify both non-draft GitHub releases;
8. approve and verify the protected MCP Registry publication; and
9. rerun native downstream acceptance before sealing the manifest.

The Lex tag comes first because it triggers the protected Registry workflow after both npm packages
exist. The Lex-MCP release workflow then consumes the matching Lex tag.

For each approved repository tag:

```bash
git tag -s "<approved-tag>" -m "Release <approved-tag>"
git tag -v "<approved-tag>"
git push origin "<approved-tag>"
```

Tag creation and push are human-only.

## Recovery

Never overwrite an npm version or move a published tag.

- If Lex is not published, fix the candidate and rerun its gates.
- If Lex is public but a dependent package is not, keep the verified Lex artifact and repair the
  dependent candidate forward.
- If npm packages are public but a tag or GitHub release failed, retry that immutable publication
  step without republishing npm.
- If Registry publication failed, retry it from the reviewed signed Lex tag after both public
  package contracts pass.
- If published bytes or metadata are wrong, deprecate the affected version when appropriate and
  publish a reviewed patch. Do not unpublish or replace it as routine recovery.

Package release recovery is not permission to initialize, repair, discover, delete, or recreate a
Frame store. Follow the migration guide's store-specific stop conditions and recovery boundaries.
