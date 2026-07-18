---
"@smartergpt/lex": major
---

Introduce the Lex 3.0 `ScopedFrameStore` and separately authorized `FrameStoreAdmin` contracts,
including stable read, write, delete, and admin capabilities. Add an in-memory reference backend
that binds immutable `AuthorizedScope` snapshots, stamps tenant/workspace ownership and creator
attribution internally, and proves normal operations cannot cross their bound workspace.
