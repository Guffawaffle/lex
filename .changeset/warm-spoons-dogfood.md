---
"@smartergpt/lex": patch
---

Align the PostgreSQL dogfood receipt validator and security guide with scoped FrameStore schema v4,
keep the simulated WSL fixture path on its verified host drive when the canary runs on Windows, and grant trusted Frame
imports the read capability required for collision handling. Runtime bindings now also reject roles
that can `SET ROLE` to any privilege-bearing authority escape, with live `BYPASSRLS` and
authority-mutator controls, direct protected-ledger mutation rejection, and a fail-closed membership
check on PostgreSQL versions older than 16. PostgreSQL 16+ rejects both settable and immediately
inherited unsafe-role paths, plus admin-option memberships that can regrant a settable path.
