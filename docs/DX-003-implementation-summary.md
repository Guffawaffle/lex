# DX-003: Expand FTS5 Index Implementation Summary

## Overview

This document summarizes the implementation of DX-003, which expands the FTS5 full-text search index to improve `lex recall` search coverage for agent-driven memory retrieval.

## Changes Made

### 1. Migration V9 (src/memory/store/db.ts)

Added a new database migration that expands the FTS5 virtual table to include four additional searchable fields:

- **next_action**: Extracted from `status_snapshot` JSON using `json_extract()`
- **module_scope**: JSON array of module IDs
- **jira**: Ticket/issue identifier
- **branch**: Git branch name

**Technical Approach:**
- Used external contentless FTS5 (`content=''`) to allow custom field extraction
- Implemented proper triggers for INSERT, UPDATE, and DELETE operations
- Added migration to rebuild FTS5 index from existing data

### 2. Updated Reference Schema (migrations/000_reference_schema.sql)

Updated the reference schema documentation to reflect:
- New FTS5 table structure with 7 searchable columns
- Updated triggers that extract `next_action` from JSON
- Proper delete/update trigger syntax for contentless FTS5

### 3. Comprehensive Tests (test/memory/store/expanded-fts5.test.ts)

Added 21 new tests covering:
- Search by `next_action` content (3 tests)
- Search by `module_scope` (3 tests)
- Search by `jira` ticket ID (3 tests)
- Search by `branch` name (3 tests)
- Multi-field search scenarios (3 tests)
- Acceptance criteria validation (6 tests)

All tests verify:
- Exact matches work
- Partial/fuzzy matches work (via prefix wildcards)
- Multi-term queries work
- Performance is maintained (<100ms)
- Backward compatibility with existing fields

## Technical Details

### External Contentless FTS5

The implementation uses `content=''` instead of `content='frames'` because:
1. `next_action` doesn't exist as a column in `frames` table
2. We need to extract it from JSON using `json_extract()`
3. External contentless allows custom field mapping in triggers

### Trigger Implementation

**INSERT Trigger:**
```sql
CREATE TRIGGER frames_ai AFTER INSERT ON frames BEGIN
  INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords, next_action, module_scope, jira, branch)
  VALUES (
    new.rowid,
    new.reference_point,
    new.summary_caption,
    new.keywords,
    json_extract(new.status_snapshot, '$.next_action'),
    new.module_scope,
    new.jira,
    new.branch
  );
END;
```

**DELETE Trigger:**
Uses FTS5 special syntax `INSERT INTO frames_fts(frames_fts, ...) VALUES ('delete', ...)` for contentless tables.

**UPDATE Trigger:**
Performs delete + insert for proper FTS5 update in contentless mode.

## Benefits

1. **Improved Search Coverage**: Agents can now search by actionable context, modules, tickets, and branches
2. **Backward Compatible**: All existing searches continue to work
3. **Performance Maintained**: Search remains fast (<100ms for typical queries)
4. **Agent-Friendly**: Addresses common search patterns identified in issue DX-003

## Examples

```bash
# Search by next action
lex recall "implement token refresh"

# Search by module
lex recall "memory store"

# Search by ticket
lex recall "DX-003"

# Search by branch
lex recall "feature authentication"

# Multi-field search
lex recall "auth token jwt"
```

## Test Results

- ✅ 21 new tests added (all passing)
- ✅ 123 total tests passing (no regressions)
- ✅ SQL safety compliance verified
- ✅ Linting passed
- ✅ Manual testing confirmed

## Migration Safety

The migration:
1. Drops existing FTS5 table and triggers (safe - FTS5 is regenerated)
2. Creates new FTS5 table with expanded schema
3. Rebuilds index from all existing frames
4. Is idempotent (can be run multiple times safely)

## Related Files

- `src/memory/store/db.ts` - Migration V9 implementation
- `migrations/000_reference_schema.sql` - Reference schema
- `test/memory/store/expanded-fts5.test.ts` - Comprehensive tests
- `src/memory/store/queries.ts` - Search queries (no changes needed)
- `src/shared/cli/recall.ts` - Recall command (no changes needed)
