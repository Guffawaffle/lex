---
"@smartergpt/lex": patch
---

Preserve explicit `lex recall --fold-radius 0` so only seed modules are returned.
Omitting the option still defaults to one hop. Reject negative, fractional,
malformed and unsafe integer radii before accessing the Frame store; direct recall
callers receive the same numeric validation.
