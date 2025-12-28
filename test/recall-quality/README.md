# Recall Quality Test Suite

This directory contains comprehensive tests for validating the quality and accuracy of Frame recall/search functionality in Lex.

## Overview

The recall quality test suite proves that `lex recall` delivers on its value proposition:
- **High precision**: 78.6% for top-3 results (close to 80% target)
- **Excellent recall**: 90.8% (exceeds 50% target)
- **Strong F1 score**: 81.7% (exceeds 60% target)
- **Massive token savings**: 99.6% reduction (28,250 → 127 tokens)
- **Time efficiency**: 86.7% reduction (15 min → 2 min to productivity)

## Test Files

### `recall-quality.test.ts`

Comprehensive test suite with 23 test cases covering:

#### Exact Matching (3 tests)
- Topic match retrieval
- Keyword-based search
- Password validation lookup

#### Semantic Similarity (3 tests)
- Credential checking → password (semantic match)
- Dark theme → dark mode (synonym match)
- Authentication synonyms

#### Filtering & Scoping (8 tests)
- Irrelevant frame filtering
- Module scope filtering (database, UI)
- Keyword-based retrieval
- Multi-keyword matching

#### Search Features (6 tests)
- Case-insensitive matching (lowercase, uppercase, mixed)
- Partial word matching (prefix, variations)
- Recent frames prioritization

#### Quality Metrics (3 tests)
- **Precision** calculation (relevant results / total results)
- **Recall** calculation (retrieved relevant / all relevant)
- **F1 score** (harmonic mean of precision and recall)

### `before-after-comparison.test.ts`

Demonstrates the value proposition of `lex recall` through realistic scenarios:

#### Scenario 1: Resume work on authentication module
- **WITHOUT recall**: 28,250 tokens, 15 minutes, scattered context
- **WITH recall**: 127 tokens, 2 minutes, curated context with blockers
- **Improvement**: 99.6% fewer tokens, 86.7% faster

#### Scenario 2: Multi-day project tracking
- Tracks progress across 3 work sessions
- Shows context accumulation over time
- Demonstrates Frame progression for long-running work

#### Scenario 3: Team handoff
- Developer A → Developer B context transfer
- Preserves blockers, next actions, and merge status
- Enables seamless continuity across team members

## Test Corpus

Located in `test/fixtures/recall-corpus/frames.ts`:

### Frame Distribution
- **55 total Frames** across 5 topic clusters:
  - Authentication & Security (10 frames)
  - Database & Data Management (10 frames)
  - UI & Frontend (10 frames)
  - API & Backend (10 frames)
  - Testing & Quality (10 frames)
  - Miscellaneous (5 frames)

### Relevance Labels
- **15 test queries** with known relevance scores
- Mix of exact matches, semantic matches, and irrelevant queries
- Used to calculate precision, recall, and F1 metrics

Examples:
```typescript
{
  query: "authentication",
  relevantFrameIds: ["corpus-001", "corpus-002", "corpus-003", ...],
  description: "Frames related to authentication and auth systems"
}
```

## Running Tests

### Quick Run
```bash
npm run test:recall-quality
```

### Individual Tests
```bash
# Recall quality tests only
npx tsx --test test/recall-quality/recall-quality.test.ts

# Before/after comparison only
npx tsx --test test/recall-quality/before-after-comparison.test.ts
```

### As Part of Full Suite
```bash
npm test  # Includes recall quality tests automatically
```

## Test Results

### Current Metrics (as of implementation)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Precision (top-3) | ≥80% | 78.6% | 🟡 Close |
| Recall | ≥50% | 90.8% | ✅ Exceeds |
| F1 Score | ≥60% | 81.7% | ✅ Exceeds |
| Token Reduction | ≥50% | 99.6% | ✅ Exceeds |
| Time Reduction | ≥50% | 86.7% | ✅ Exceeds |

### Test Status
- **Total**: 28 tests
- **Passing**: 25 tests (89.3%)
- **Failing**: 3 tests (expected)

### Expected Failures

The 3 failing tests are for advanced semantic matching scenarios that require embedding-based search:

1. **Credential checking → password**: Pure keyword search doesn't capture semantic relationship
2. **Testing coverage multi-keyword**: Requires better query parsing and term expansion
3. **API performance multi-keyword**: Similar semantic matching limitation

These failures are **expected and documented** - they represent future enhancements that would require:
- Embedding-based semantic search
- Query expansion/synonym detection
- More sophisticated ranking algorithms

## Quality Calculation Methods

### Precision
```typescript
precision = (# relevant frames in top-N results) / N
```
Measures: How many returned results are actually relevant?

### Recall
```typescript
recall = (# relevant frames retrieved) / (# total relevant frames)
```
Measures: How many of all relevant frames did we find?

### F1 Score
```typescript
f1 = 2 * (precision * recall) / (precision + recall)
```
Measures: Harmonic mean balancing precision and recall

## Documentation

See `docs/RECALL_QUALITY.md` for:
- Detailed explanation of recall ranking algorithm (FTS5/BM25)
- Guidelines for writing "good" Frames
- Tuning parameters and configuration
- Troubleshooting tips
- Future enhancements

## Contributing

To improve recall quality:

1. **Add test cases**: Contribute realistic queries and expected results
2. **Expand corpus**: Add more diverse Frames to `test/fixtures/recall-corpus/`
3. **Improve metrics**: Suggest better relevance labels or evaluation methods
4. **Enhance search**: Implement semantic search, query expansion, or ranking improvements

## Related Files

- `src/memory/store/sqlite/frame-store.ts` - Search implementation
- `src/shared/cli/recall.ts` - CLI interface
- `docs/RECALL_QUALITY.md` - User documentation
- `test/memory/benchmarks.test.ts` - Performance benchmarks
