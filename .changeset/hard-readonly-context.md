---
"@smartergpt/lex": minor
---

Add an explicit hard read-only SQLite store mode and route `lex context` through a detached,
query-only snapshot so session bootstrap cannot create, migrate, or modify canonical store state.
Structured context diagnostics now report store access mode and stable schema compatibility errors.
Restore repository build and documentation validation by narrowing Atlas route parameters and
synchronizing the README version with the package manifest.
