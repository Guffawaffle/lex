---
"@smartergpt/lex": patch
---

Require every normalized `lex context` query term to match before continuity is ranked, and fail
closed for empty or partially unsupported normalized queries instead of returning unrelated recent
Frames.
