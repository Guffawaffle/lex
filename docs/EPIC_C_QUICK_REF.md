# Epic C: Frame Ingestion & Atlas/Map Sync - Quick Reference

## Purpose
This document provides a quick reference for developers working on Epic C and its sub-tasks. For comprehensive details, see [docs/EPIC_C_OVERLAP.md](../docs/EPIC_C_OVERLAP.md).

## Epic C Overview
**Epic C** focuses on automated Frame ingestion and real-time Atlas/Map synchronization.

**GitHub Issue:** TBD (use template at `.github/ISSUE_TEMPLATE/issue-epic-c.md`)

## ⚠️ Critical: Avoid Duplication

The following features are **already implemented** via PRs #72-#77:

### ✅ Already Available - Use These

| Feature | Location | PR | Use Instead Of |
|---------|----------|-----|----------------|
| Timeline visualization | `memory/renderer/timeline.ts` | #77 | Creating new timeline |
| LRU caching | `shared/atlas/cache.ts` | #76 | Custom cache implementation |
| Syntax highlighting | `memory/renderer/card.ts` | #75 | DIY diff coloring |
| SVG graph rendering | `shared/atlas/renderer.ts` | #74 | New graph visualization |
| Module ID fuzzy matching | `shared/module_ids/validator.ts` | #72 | Custom string matching |
| Build configuration | `tsconfig.build.json` | #73 | Ad-hoc build setup |

### 🔗 Quick Links

- **Overlap Analysis:** [docs/EPIC_C_OVERLAP.md](../docs/EPIC_C_OVERLAP.md)
- **PR Details:** [MERGE_COMPLETE.md](../MERGE_COMPLETE.md)
- **Issue Template:** [.github/ISSUE_TEMPLATE/issue-epic-c.md](../.github/ISSUE_TEMPLATE/issue-epic-c.md)

## Sub-Task Checklist

When creating Sub C.1, C.2, or other sub-tasks:

1. [ ] Read [docs/EPIC_C_OVERLAP.md](../docs/EPIC_C_OVERLAP.md) thoroughly
2. [ ] Identify which existing components you'll use (from PRs #72-#77)
3. [ ] Reference this Epic C issue in your sub-task description
4. [ ] Add `overlap-ok` label to acknowledge coordination
5. [ ] Link to specific existing APIs in your implementation plan
6. [ ] Get code review approval that confirms no duplication

## Integration Examples

### Example 1: Using Timeline Visualization
```typescript
// ✅ Correct: Use existing timeline
import { renderTimeline } from 'lex/memory/renderer/timeline';

const timeline = renderTimeline(frames, options);

// ❌ Wrong: Don't create custom timeline
// const customTimeline = new MyTimelineRenderer(frames);
```

### Example 2: Using LRU Cache
```typescript
// ✅ Correct: Use existing cache
import { AtlasCache } from 'lex/shared/atlas/cache';

const cache = new AtlasCache({ maxSize: 100 });

// ❌ Wrong: Don't create custom cache
// const myCache = new Map();
```

### Example 3: Using SVG Renderer
```typescript
// ✅ Correct: Use existing renderer
import { renderAtlasFrame } from 'lex/shared/atlas/renderer';

const svg = renderAtlasFrame(frame);

// ❌ Wrong: Don't recreate SVG generation
// const svg = generateCustomSVG(frame);
```

## Architecture Decision Records

For detailed rationale on Epic C design decisions:

1. **Why extend existing components?**
   - PRs #72-#77 represent significant engineering investment
   - Proven, tested, and integrated with the rest of Lex
   - Duplication would waste effort and introduce inconsistencies

2. **When can we add new features?**
   - When they don't duplicate existing work
   - When they extend (not replace) existing components
   - When existing APIs are insufficient for new use cases

3. **How to propose changes to existing components?**
   - Open an issue describing the limitation
   - Discuss with maintainers before implementing
   - Consider backward compatibility

## Common Pitfalls to Avoid

1. **"I didn't see the existing feature"**
   - Always review [EPIC_C_OVERLAP.md](../docs/EPIC_C_OVERLAP.md) first
   - Search codebase for similar functionality
   - Ask in issue comments if unsure

2. **"The existing API doesn't quite fit"**
   - Consider if you can extend it with configuration
   - Open a discussion issue before reimplementing
   - Check if your use case was already considered

3. **"I want to refactor while implementing"**
   - Epic C focuses on ingestion + sync pipeline
   - Refactoring existing components is out of scope
   - File separate issues for refactoring proposals

## Questions?

- Review [docs/EPIC_C_OVERLAP.md](../docs/EPIC_C_OVERLAP.md)
- Check [MERGE_COMPLETE.md](../MERGE_COMPLETE.md) for PR technical details
- Comment on Epic C issue or sub-task issues
- Reach out to @Guffawaffle

---

**Last Updated:** 2025-11-09
**Maintained By:** Lex Project
**Related Issues:** Epic C (TBD), Sub C.1 (TBD), Sub C.2 (TBD), Sub C.3 (TBD)
