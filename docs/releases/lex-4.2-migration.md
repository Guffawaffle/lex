# Lex 4.2 migration and recovery guide

The candidate pair is `@smartergpt/lex@4.2.0` and `@smartergpt/lex-mcp@4.2.0`.
Use the verified released 4.1.0 pair until both new immutable packages are verified.
See the [release notes](./lex-4.2.md) and [release checklist](../../RELEASE.md).

## Existing consumers

Node `>=24` remains required. Upgrading from 4.1.0 requires no store migration and
preserves existing CLI/MCP operations. Compiler and resolver consumers import
`@smartergpt/lex/normative-policy`; existing 1A1 data contracts remain compatible.

Production resolver use requires a protected host installation of an authentic
verifier, qualified evidence, and the exact bindings in the
[host guide](../normative-policy-resolver.md). Synthetic test fixtures are not a
production adapter. Neither compilation nor resolution grants effect authority.

After the exact package pair is public and verified, an MCP host may pin:

```toml
command = "npx"
args = ["--yes", "@smartergpt/lex-mcp@4.2.0"]
env_vars = ["LEX_POSTGRES_PASSWORD"]
```

Forward PostgreSQL credentials only from the host's existing secret configuration.
Preserve exact trusted-host scope and runtime binding. Environment variables alone
do not establish tenant authority. The [4.0 migration guide](./lex-4.0-migration.md)
still covers migrations from older majors and the removed legacy transport.

## Release and rollback boundaries

Agents may prepare and verify retained candidates and dry-run publication. Actual
npm publication uses the explicitly selected protected workflow from reviewed
current main. Protected environment approvals and personal signed annotated tags
remain human checkpoints. No local npm write-token path is introduced.

Keep the verified 4.1.0 package pair for rollback. Remove new compiler/resolver imports
before restoring it; do not delete, initialize, migrate, or repair stores as part of
rollback. Published package versions and tags are immutable. Repair publication
defects through a new reviewed version and preserve evidence of partial publication.
