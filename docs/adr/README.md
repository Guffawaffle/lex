# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for Lex. Each ADR documents a significant decision, its context, and consequences.

> **Public Spec Note:** ADRs in this directory document public, engine-agnostic decisions. Proprietary implementation details (e.g., merge-weave algorithms, persona system) live in [LexRunner's ADR directory](https://github.com/smartergpt/lex-pr-runner/docs/adr/).

## Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| 0001 | [TypeScript-Only, NodeNext Resolution](./0001-ts-only-nodenext.md) | Accepted | 2025-10-XX |
| 0002a | [Database Encryption with SQLCipher](./0002-database-encryption-sqlcipher.md) | Accepted | 2025-10-XX |
| 0002b | [OAuth2/JWT Authentication](./0002-oauth2-jwt-authentication.md) | Accepted | 2025-10-XX |
| 0003 | [.smartergpt Workspace Consolidation](./0003-smartergpt-workspace-consolidation.md) | Accepted | 2025-11-23 |
| 0004 | [Control Stack Architecture](./0004-control-stack-architecture.md) | Accepted | 2025-11-25 |
| 0005 | [Git Integration Feature Flag](./0005-git-integration-feature-flag.md) | Accepted | 2025-11-25 |
| 0006 | [Spec vs Engine Separation](./0006-spec-vs-engine-separation.md) | Proposed | 2025-11-25 |
| 0007 | [Safety-First Defaults](./0007-safety-first-defaults.md) | Proposed | 2025-11-25 |
| 0008 | [lex.yaml Workflow Configuration](./0008-lex-yaml.md) | Accepted | 2025-11-27 |

## Conventions

- **One ADR per decision:** Each record captures a single architectural decision.
- **Immutable after acceptance:** Accepted ADRs are not modified (except to update Status or add links).
- **Format:** Use the standard ADR template (Context, Decision, Consequences).
- **Naming:** `NNNN-kebab-case-title.md`

## Relationship to LexRunner

Lex is the MIT-licensed public library. LexRunner is a proprietary engine that implements Lex concepts. This ADR directory contains:

- ✅ Public spec decisions (YAML schema, control stack, safety defaults)
- ✅ Library implementation decisions (TypeScript, SQLCipher, OAuth)
- ❌ Engine-specific logic (merge algorithms, persona system) → LexRunner

See [ADR-0006](./0006-spec-vs-engine-separation.md) for the full spec vs engine boundary.
