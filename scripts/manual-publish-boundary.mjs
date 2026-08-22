#!/usr/bin/env node

console.error(`LEX_NPM_PUBLISH_REQUIRES_HUMAN

Lex intentionally refuses to publish through "npm run release".

An agent may run:
  npm run release:dry-run

After the reviewed release commit is merged, checked out exactly, and all final gates pass, the
authenticated maintainer verifies identity and state, then runs:
  npm whoami
  npm access list packages smartergpt --json
  git status --short
  git rev-parse HEAD
  gh attestation verify <tarball> --repo Guffawaffle/lex --signer-workflow Guffawaffle/lex/.github/workflows/release.yml --source-digest <HEAD> --deny-self-hosted-runners --bundle <bundle>
  gh attestation verify release-candidate.json --repo Guffawaffle/lex --signer-workflow Guffawaffle/lex/.github/workflows/release.yml --source-digest <HEAD> --deny-self-hosted-runners --bundle <bundle>
  node scripts/verify-release-candidate.mjs --check-only
  npm publish ./smartergpt-lex-4.0.1.tgz --access public

See RELEASE.md and docs/releases/ecosystem-3.1.md. Nothing was published.`);

process.exit(1);
