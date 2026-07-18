---
"@smartergpt/lex": patch
---

Freeze the declared package export inventory and validate every JavaScript, type declaration,
JSON Schema, and CLI artifact before release. Packed consumer smoke tests now import and type-check
all public paths from a clean tarball installation while confirming internal paths remain blocked.
Published declarations now carry their PostgreSQL and supported Node type dependencies and resolve
their policy imports entirely within the package.
Reconcile public Frame documentation with the implemented v7 record and mutable store contract,
including opaque string IDs, targeted updates, and supersession, with a docs drift guard.
