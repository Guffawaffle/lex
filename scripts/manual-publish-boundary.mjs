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
  npm publish --access public

See RELEASE.md and docs/releases/ecosystem-3.1.md. Nothing was published.`);

process.exit(1);
