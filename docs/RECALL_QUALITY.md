# Recall Quality Documentation

## Overview

`lex recall` is the killer feature of Lex - it enables AI agents and developers to quickly retrieve relevant context from previous work sessions. This document explains how recall works, what makes a "good" Frame, and how we measure and ensure recall quality.

## How Recall Ranking Works

### Search Implementation

Lex uses **SQLite FTS5 (Full-Text Search 5)** for Frame retrieval. When you run `lex recall "query"`, the system:

1. **Normalizes the query**: Converts to lowercase, applies prefix wildcards for fuzzy matching (unless `--exact` flag is used)
2. **Searches multiple fields**: Queries against `reference_point`, `summary_caption`, `keywords`, and `module_scope`
3. **Ranks results**: FTS5 uses BM25 ranking algorithm to score relevance based on:
   - **Term frequency (TF)**: How often query terms appear in the Frame
   - **Inverse document frequency (IDF)**: Rarity of terms across all Frames
   - **Field weighting**: Different fields have different importance
   - **Document length normalization**: Prevents bias toward longer Frames

### Ranking Factors

Results are ranked by:

1. **Relevance score** (primary): BM25 score from FTS5
2. **Exact matches**: Frames with exact keyword or reference matches rank higher
3. **Module scope overlap**: Frames in related modules get boosted
4. **Freshness** (future): Recent Frames may be ranked higher for same relevance (not yet implemented)

### Search Strategies

The `recall` command tries multiple strategies in order:

1. **Exact Frame ID match**: If query matches a Frame ID, return that Frame directly
2. **Full-text search**: Search across all indexed fields using FTS5
3. **Fuzzy matching**: By default, applies prefix wildcards (e.g., "auth" matches "authentication")
4. **Exact matching**: With `--exact` flag, only matches complete words

### Search Modes (AND vs OR)

By default, multi-term queries use **AND logic** - all terms must match:
```bash
# Default AND mode: requires BOTH "credential" AND "checking" to match
lex recall "credential checking"
# → May return 0 results if no Frame contains both terms
```

Use **OR mode** when you want frames matching ANY term:
```bash
# OR mode: matches frames containing "credential" OR "checking" (or both)
lex recall "credential checking" --mode any
# → Returns frames with "credentials", "credential", etc. even if "checking" is absent
```

**When to use each mode:**

- **AND mode (`--mode all`)** (default):
  - Use when all terms must be present
  - Narrower, more precise results
  - Example: `lex recall "api performance optimization"` finds frames about API performance optimization specifically
  
- **OR mode (`--mode any`)**: 
  - Use for exploratory searches
  - Broader results, better recall
  - Useful when unsure of exact keywords
  - Example: `lex recall "credential password token" --mode any` finds any security-related frames

## What Makes a "Good" Frame

A high-quality Frame that supports effective recall has:

### 1. Clear, Descriptive Summary
```typescript
// ❌ Poor
summary_caption: "Fixed bug"

// ✅ Good
summary_caption: "Fixed JWT token expiry validation in authentication middleware"
```

### 2. Meaningful Reference Point
```typescript
// ❌ Poor
reference_point: "work"

// ✅ Good
reference_point: "auth refactor jwt validation"
```

### 3. Relevant Keywords
```typescript
// ❌ Poor
keywords: ["code", "fix"]

// ✅ Good
keywords: ["jwt", "authentication", "middleware", "token", "validation"]
```

### 4. Accurate Module Scope
```typescript
// ❌ Poor
module_scope: ["src"]

// ✅ Good
module_scope: ["shared/auth", "api/middleware"]
```

### 5. Actionable Status Snapshot
```typescript
// ❌ Poor
status_snapshot: {
  next_action: "Continue work"
}

// ✅ Good
status_snapshot: {
  next_action: "Implement token validation with configurable expiry (15min vs 1hr)",
  blockers: [
    "Need to decide on token expiry policy",
    "Tests failing due to mock clock issue in test/auth/middleware.test.ts:45"
  ],
  tests_failing: ["test/auth/middleware.test.ts:45"]
}
```

## Benchmark Results

### Test Corpus

- **Size**: 55 Frames across 5 topic clusters
- **Topics**: Authentication, Database, UI, API, Testing, Miscellaneous
- **Queries**: 15 test queries with known relevance labels

### Quality Metrics

Based on recall quality test suite (`test/recall-quality/recall-quality.test.ts`):

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Precision (top-3)** | ≥80% | ~60-70% | 🟡 Acceptable |
| **Recall** | ≥50% | ~40-50% | 🟡 Acceptable |
| **F1 Score** | ≥60% | ~45-55% | 🟡 Acceptable |

**Note**: Current thresholds are relaxed for initial implementation. The actual performance depends on:
- Quality of Frame metadata (keywords, summary, reference point)
- Query specificity
- Size and diversity of Frame corpus

### Performance Benchmarks

| Operation | Target | Typical |
|-----------|--------|---------|
| Frame creation | <50ms | ~10-20ms |
| Frame recall (1K Frames) | <100ms | ~30-50ms |
| FTS5 search (10K Frames) | <200ms | ~100-150ms |

## Tuning Parameters

### Search Behavior

**Fuzzy vs Exact Matching**
```bash
# Fuzzy (default): "auth" matches "authentication", "authorization"
lex recall "auth"

# Exact: Only matches complete word "auth"
lex recall "auth" --exact
```

**AND vs OR Mode**
```bash
# AND mode (default): All terms must match
lex recall "api performance optimization"
# → Returns only frames containing ALL three terms

# OR mode: Any term can match
lex recall "api performance optimization" --mode any
# → Returns frames containing api OR performance OR optimization

# Combined with exact matching
lex recall "jwt token" --exact --mode any
# → Exact word match for either "jwt" OR "token"
```

**Result Limits**
```bash
# Default: Returns all matching Frames
lex recall "database"

# Limited results
lex recall "database" --limit 5
```

**List Mode**
```bash
# List recent Frames instead of searching
lex recall --list

# List specific number
lex recall --list 20
```

### Atlas Frame Configuration

**Fold Radius**: Controls how many "hops" away from module scope to include in Atlas Frame

```bash
# Default radius (1 hop)
lex recall "auth"

# Larger radius (more context)
lex recall "auth" --fold-radius 2

# Auto-tune radius based on token budget
lex recall "auth" --auto-radius --max-tokens 4000
```

### Output Formats

```bash
# Pretty-printed (default)
lex recall "database"

# JSON output (for programmatic use)
lex recall "database" --json

# Compact summary (for small-context agents)
lex recall "database" --summary
```

## Improving Recall Quality

### 1. Write Better Frames

Use `lex remember` with rich metadata:

```bash
lex remember \
  --summary "Refactored JWT authentication with configurable token expiry" \
  --modules "shared/auth,api/middleware" \
  --next "Add refresh token rotation" \
  --blockers "Need security review before merging" \
  --keywords "jwt,authentication,security,tokens"
```

### 2. Use Consistent Keywords

Maintain a vocabulary of standard keywords across your team:
- Use `authentication` consistently (not sometimes "auth", sometimes "authentication")
- Use `api` for API work, `ui` for frontend, `database` for data layer
- Include domain-specific terms: `jwt`, `oauth`, `graphql`, `postgres`, etc.

### 3. Meaningful Reference Points

Reference points should be memorable and searchable:
- ✅ "auth refactor jwt" - specific, searchable
- ✅ "stripe webhook handling" - clear intent
- ❌ "friday work" - not searchable
- ❌ "bug fix" - too generic

### 4. Keep Frames Focused

One Frame per logical unit of work:
- ✅ One Frame for "JWT authentication refactor"
- ✅ Separate Frame for "OAuth integration"
- ❌ One Frame for "all auth work this month"

### 5. Update Frames as Work Progresses

Create new Frames when context changes significantly:
- Day 1: "Started API v2 design"
- Day 2: "API v2 schema complete, starting implementation"
- Day 3: "API v2 endpoints done, writing tests"

## Troubleshooting

### No Results Found

**Problem**: `lex recall` returns no results for a query you know should match.

**Solutions**:
1. Try OR mode for broader search: `lex recall "query terms" --mode any`
2. Try broader terms: "authentication" instead of "jwt token validation"
3. Check spelling and keywords in Frames: `lex recall --list` to see recent Frames
4. Try fuzzy matching: remove `--exact` flag if used
5. Search by Frame ID: `lex recall <frame-id>`

### Irrelevant Results

**Problem**: Search returns Frames that don't match your intent.

**Solutions**:
1. Use AND mode (default) for more precise results
2. Use more specific keywords in query
3. Use `--exact` flag for precise matching
4. Review Frame keywords - update if they're misleading
5. Use module scope in your Frames to improve filtering

### Too Many Results

**Problem**: Search returns hundreds of matches, hard to find the right one.

**Solutions**:
1. Be more specific in query: "jwt token expiry" instead of "auth"
2. Use date filters (future feature)
3. Use `--limit` to show only top N results
4. Search by module scope to narrow down

## Future Enhancements

### Planned Improvements

1. **Semantic Search (Phase 2)**: Use embeddings for better semantic matching beyond keyword search
   - Vector-based similarity search for synonyms and related concepts
   - Cosine similarity scoring for relevance ranking
2. **Time Decay**: Rank recent Frames higher for same relevance score
3. **User Feedback**: Learn from which Frames users actually use
4. **Relevance Tuning**: Adjust BM25 parameters based on user corpus
5. **Smart Suggestions**: Suggest related Frames based on current context

**Note**: OR-mode search (Phase 1) has been implemented to address the most common recall issues. Phase 2 semantic search with embeddings is planned for a future release.

### Contributing

To improve recall quality:

1. **Report Issues**: If recall quality is poor for your use case, open an issue with examples
2. **Add Test Cases**: Contribute to `test/fixtures/recall-corpus/` with real-world examples
3. **Tune Parameters**: Experiment with FTS5 ranking and share results
4. **Improve Documentation**: Help others write better Frames

## Running Quality Tests

### Full Test Suite

```bash
npm run test:recall-quality
```

This runs both the recall quality test suite and the before/after comparison tests.

### Individual Tests

```bash
# Recall quality tests
npx tsx --test test/recall-quality/recall-quality.test.ts

# Before/after comparison
npx tsx --test test/recall-quality/before-after-comparison.test.ts
```

### Benchmarks

```bash
npm run test:benchmarks
```

### All Tests (including recall quality)

```bash
npm test  # Includes recall quality tests automatically
```

## References

- **FTS5 Documentation**: https://www.sqlite.org/fts5.html
- **BM25 Algorithm**: https://en.wikipedia.org/wiki/Okapi_BM25
- **Frame Schema**: `src/memory/frames/types.ts`
- **Search Implementation**: `src/memory/store/sqlite/frame-store.ts`
- **CLI Interface**: `src/shared/cli/recall.ts`

---

**Questions or suggestions?** Open an issue on [GitHub](https://github.com/Guffawaffle/lex/issues).
