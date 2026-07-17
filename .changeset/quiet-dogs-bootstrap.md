---
"@smartergpt/lex": minor
---

Add a backend-aware `lex init --store sqlite|postgres` flow. PostgreSQL initialization now
repairs partial workspaces idempotently, creates the policy and bootstrap files without touching
SQLite, preserves credential configuration, and reports the active backend and changed files.
