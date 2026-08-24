---
"@smartergpt/lex": patch
---

Align the PostgreSQL dogfood receipt validator and security guide with scoped FrameStore schema v4,
keep the simulated WSL fixture path native when the canary runs on Windows, and grant trusted Frame
imports the read capability required for collision handling. Runtime bindings now also reject roles
that can `SET ROLE` to any privilege-bearing authority escape, with live `BYPASSRLS` and
authority-mutator controls plus a fail-closed membership check on PostgreSQL versions older than 16.
