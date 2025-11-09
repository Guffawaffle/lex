# Epic C: Frame Ingestion & Atlas/Map Sync Pipeline

**Status:** Planning / Cross-Reference Documentation  
**Purpose:** Document existing work to prevent duplication in Epic C implementation

**Quick Reference:** For a condensed version, see [EPIC_C_QUICK_REF.md](./EPIC_C_QUICK_REF.md)

---

## 🎯 Epic C Overview

Epic C focuses on the **Frame ingestion & Atlas/Map sync pipeline** to enable seamless memory management and visualization across the Lex ecosystem.

**Key Goals:**
- Automated Frame ingestion from multiple sources
- Real-time Atlas/Map synchronization
- Enhanced visualization capabilities
- Policy-aware data flow

---

## ⚠️ Existing Work - DO NOT DUPLICATE

The following PRs have **already implemented** core features related to Epic C. Sub-tasks C.1, C.2, and future work must reference and build upon this existing functionality rather than reimplementing it.

### Cross-Reference Table: Epic C Related PRs

| PR # | Issue # | Feature | Status | Sub-Epic Impact |
|------|---------|---------|--------|----------------|
| [#77](https://github.com/Guffawaffle/lex/pull/77) | [#58](https://github.com/Guffawaffle/lex/issues/58) | Visual timeline for Frame evolution | ✅ Merged | Visualization - **Use existing timeline component** |
| [#76](https://github.com/Guffawaffle/lex/pull/76) | [#55](https://github.com/Guffawaffle/lex/issues/55) | LRU caching and token-based auto-tuning for Atlas | ✅ Merged | Performance - **Use existing caching layer** |
| [#75](https://github.com/Guffawaffle/lex/pull/75) | [#62](https://github.com/Guffawaffle/lex/issues/62) | Syntax highlighting for code diffs in memory cards | ✅ Merged | Rendering - **Use existing diff highlighting** |
| [#74](https://github.com/Guffawaffle/lex/pull/74) | [#61](https://github.com/Guffawaffle/lex/issues/61) | Render Atlas Frames as interactive SVG graphs | ✅ Merged | Visualization - **Use existing SVG renderer** |
| [#73](https://github.com/Guffawaffle/lex/pull/73) | [#46](https://github.com/Guffawaffle/lex/issues/46) | Fix TypeScript build path configuration | ✅ Merged | Build Infrastructure - **Already resolved** |
| [#72](https://github.com/Guffawaffle/lex/pull/72) | [#51](https://github.com/Guffawaffle/lex/issues/51) | Phase 3 substring matching for module IDs | ✅ Merged | Module Resolution - **Use existing fuzzy matching** |

---

## 📋 Feature Overlap Analysis

### 1. Frame Visualization (PR #77, #74)

**What's Already Built:**
- Timeline component showing Frame evolution over time
- Interactive SVG graph rendering for Atlas Frames
- Visual representation of Frame relationships

**Epic C Sub-Tasks Must:**
- ✅ Use existing `memory/renderer/timeline.ts` for temporal views
- ✅ Use existing `shared/atlas/` SVG rendering for graph visualization
- ✅ Extend (not replace) visualization capabilities
- ❌ **DO NOT** create new timeline or graph components from scratch

**Integration Points:**
```typescript
// Existing APIs to use:
import { renderTimeline } from 'lex/memory/renderer/timeline';
import { renderAtlasFrame } from 'lex/shared/atlas/renderer';
```

---

### 2. Caching & Performance (PR #76)

**What's Already Built:**
- LRU cache implementation for Atlas data
- Token-based auto-tuning for optimal cache sizing
- Performance metrics and monitoring

**Epic C Sub-Tasks Must:**
- ✅ Use existing LRU cache in `shared/atlas/cache.ts`
- ✅ Respect token-based limits already configured
- ✅ Extend caching strategies if needed (e.g., persistent cache)
- ❌ **DO NOT** implement new caching mechanisms without reviewing existing work

**Integration Points:**
```typescript
// Existing APIs to use:
import { AtlasCache } from 'lex/shared/atlas/cache';
import { getTokenBudget } from 'lex/shared/atlas/tuning';
```

---

### 3. Memory Card Rendering (PR #75)

**What's Already Built:**
- Syntax highlighting for code diffs in memory cards
- Language detection and color schemes
- Integration with Frame rendering pipeline

**Epic C Sub-Tasks Must:**
- ✅ Use existing diff highlighting in `memory/renderer/card.ts`
- ✅ Maintain consistent visual styling
- ✅ Add new languages/formats if needed (extend existing config)
- ❌ **DO NOT** create separate diff rendering implementations

**Integration Points:**
```typescript
// Existing APIs to use:
import { renderCard } from 'lex/memory/renderer/card';
// Diff highlighting is automatically applied
```

---

### 4. Module ID Resolution (PR #72)

**What's Already Built:**
- Phase 3 substring matching for module IDs
- Fuzzy matching with helpful suggestions
- Alias resolution system

**Epic C Sub-Tasks Must:**
- ✅ Use existing `shared/module_ids/validator.ts` for module validation
- ✅ Use existing `shared/aliases/resolver.ts` for ID resolution
- ✅ Add new aliases via configuration (not new code)
- ❌ **DO NOT** implement custom module matching logic

**Integration Points:**
```typescript
// Existing APIs to use:
import { validateModuleId } from 'lex/shared/module_ids/validator';
import { resolveModuleId } from 'lex/shared/aliases/resolver';
```

---

### 5. Build Infrastructure (PR #73)

**What's Already Built:**
- Fixed TypeScript build path configuration
- Proper ESM module resolution
- Composite project references

**Epic C Sub-Tasks Must:**
- ✅ Follow established build patterns in `tsconfig.build.json`
- ✅ Use project references for new sub-packages
- ✅ Maintain flat `dist/` structure
- ❌ **DO NOT** modify root build configuration without review

---

## 🎯 Epic C Acceptance Criteria (Updated)

When Epic C is formally created as a GitHub issue, it should include:

### Core Criteria
- [ ] All subtasks (C.1, C.2, etc.) completed
- [ ] Integration tests passing for Frame ingestion pipeline
- [ ] Atlas/Map sync verified with existing visualization (PR #74, #77)
- [ ] Performance metrics meet requirements using existing cache (PR #76)
- [ ] Documentation updated

### Overlap Prevention Criteria
- [ ] **No duplication** of timeline visualization (PR #77)
- [ ] **No duplication** of LRU caching (PR #76)
- [ ] **No duplication** of syntax highlighting (PR #75)
- [ ] **No duplication** of SVG graph rendering (PR #74)
- [ ] **No duplication** of module ID matching (PR #72)
- [ ] Build configuration follows patterns from PR #73

### Integration Requirements
- [ ] Sub C.1 uses existing renderer APIs (`memory/renderer/`)
- [ ] Sub C.2 uses existing atlas utilities (`shared/atlas/`)
- [ ] New features extend (not replace) existing components
- [ ] All existing tests continue to pass
- [ ] New tests validate integration points

---

## 📊 Sub-Task Guidelines

### For Sub C.1 (TBD - Frame Ingestion)

**Must Use:**
- Existing Frame schema from `shared/types/frame.ts`
- Existing storage layer from `memory/store/`
- Existing validation from `shared/module_ids/validator.ts`

**Can Add:**
- New ingestion sources (e.g., webhooks, file watchers)
- Batch processing capabilities
- Error recovery mechanisms

**Must NOT:**
- Reimplement Frame storage
- Create new module ID validation
- Bypass existing policy checks

---

### For Sub C.2 (TBD - Atlas/Map Sync)

**Must Use:**
- Existing Atlas Frame rendering (PR #74)
- Existing caching layer (PR #76)
- Existing timeline visualization (PR #77)

**Can Add:**
- Real-time sync protocols
- Conflict resolution strategies
- Multi-client synchronization

**Must NOT:**
- Reimplement graph visualization
- Create new caching mechanisms
- Replace timeline components

---

## 🔗 Related Documentation

- [MERGE_COMPLETE.md](../MERGE_COMPLETE.md) - Details on merged PRs #72-#77
- [Memory Renderer README](../src/memory/renderer/README.md) - Visualization APIs
- [Atlas README](../src/shared/atlas/README.md) - Graph and caching utilities
- [Module IDs README](../src/shared/module_ids/README.md) - ID validation and resolution

---

## 🏷️ Labels for Epic C

When creating the Epic C issue on GitHub, use:
- `epic`
- `area:memory`
- `area:atlas`
- `project:lexrunner-lex`
- `overlap-ok` (acknowledges intentional coordination with existing work)

---

## 📝 Issue Template Snippet

When creating Epic C on GitHub, include this in the description:

```markdown
## ⚠️ Existing Work - DO NOT DUPLICATE

This Epic builds on existing functionality from PRs #72-#77. See [docs/EPIC_C_OVERLAP.md](./docs/EPIC_C_OVERLAP.md) for detailed overlap analysis.

**Key PRs to Reference:**
- #77 - Visual timeline (use existing)
- #76 - LRU caching (use existing)
- #75 - Syntax highlighting (use existing)
- #74 - SVG graph rendering (use existing)
- #73 - Build configuration (follow patterns)
- #72 - Module ID matching (use existing)

All sub-tasks must extend (not replace) these components.
```

---

## ✅ Deliverables Checklist

- [x] Cross-reference table created (this document)
- [x] Feature overlap analysis completed
- [x] Integration guidelines documented
- [x] Acceptance criteria defined with overlap prevention
- [x] Sub-task guidelines established
- [ ] Epic C GitHub issue created (blocked by issue number assignment)
- [ ] Sub C.1 issue created with proper references
- [ ] Sub C.2 issue created with proper references

---

**Last Updated:** 2025-11-09  
**Maintained By:** @Guffawaffle  
**Related Epic:** Epic C (TBD)
