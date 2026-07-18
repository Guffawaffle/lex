---
"@smartergpt/lex": major
---

Add the Lex 3.0 scope-owned SQLite v15 adapter and explicit legacy migration staging. Each
per-workspace file now has one immutable tenant/workspace binding, every normal operation is
scope-filtered, and ownership migration requires a reviewed deterministic manifest, mandatory
backup, transactional rebuild, verification receipt, and explicit recovery operation. Durable
reads and updates preserve and validate the complete Frame v7 contract.
Trusted MCP now advertises scoped SQLite attachments as unsupported and rejects attachment inputs
until a scope-bound attachment service can preserve ownership safely.
