---
"@smartergpt/lex": patch
---

Detect structurally inconsistent SQLite Frame stores and add an explicit, backed-up repair command
for recognized additive schema divergence. Read-only and ordinary initialization paths now fail
closed instead of silently repairing mismatched stores.
