# LexRunner Examples

This directory contains examples demonstrating how LexRunner uses Lex's aliasing system.

## Examples

### 1. `pr-validation.ts`
Shows how LexRunner validates PR module scopes using alias resolution.

### 2. `merge-sequence.ts`
Demonstrates alias usage across multi-PR merge sequences.

### 3. `team-aliases.json`
Example alias table for a team using LexRunner.

### 4. `strict-mode.ts`
Shows CI-safe strict validation (no fuzzy matching).

## Running Examples

These examples assume you have:
1. Lex installed as a dependency
2. A policy file at `.smartergpt.local/lex/lexmap.policy.json`
3. An optional alias table at `.smartergpt.local/lex/aliases.json`

```bash
# Build Lex first
npm run build

# Run TypeScript examples with tsx
npx tsx examples/lexrunner/pr-validation.ts
npx tsx examples/lexrunner/merge-sequence.ts
npx tsx examples/lexrunner/strict-mode.ts
```

## Purpose

These examples are:
- **Educational** — Show LexRunner integration patterns
- **Tested** — Verified to work with current Lex APIs
- **Minimal** — Focus on aliasing usage only

They are NOT:
- Production LexRunner code (see the LexRunner repo for that)
- Comprehensive workflow examples
- Performance benchmarks
