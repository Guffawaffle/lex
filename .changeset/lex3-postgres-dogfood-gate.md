---
"@smartergpt/lex": major
---

Add the Lex 3 PostgreSQL two-tenant/five-workspace GA acceptance gate, including deterministic
redacted receipts, a direct least-privileged runtime login, real CLI/MCP parity checks, local
Windows/WSL registry fixtures, and asserted cleanup of isolated live-canary resources. Restore the
authority runtime role's read-only access to the schema-version ledger required by its fail-closed
snapshot validation while explicitly rejecting ledger mutations.
