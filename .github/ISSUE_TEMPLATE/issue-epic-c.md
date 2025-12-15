---
name: Epic C - Frame Ingestion & Atlas/Map Sync Pipeline
about: Epic-level tracking issue for Frame ingestion and Atlas/Map synchronization work
title: "Epic C: Frame Ingestion & Atlas/Map Sync Pipeline"
labels: epic, area:memory, area:atlas, project:lexrunner-lex, overlap-ok
assignees: ''
---

# Epic C: Frame Ingestion & Atlas/Map Sync Pipeline

## 🎯 Goal

Enable seamless Frame ingestion from multiple sources and real-time Atlas/Map synchronization to support advanced memory management and visualization workflows in the Lex ecosystem.

## 📖 Context

Lex currently supports manual Frame creation via CLI (`lex remember`) and programmatic APIs. Epic C extends this foundation to support:
- Automated Frame ingestion from external sources (file watchers, webhooks, CI integration)
- Real-time synchronization between Atlas state and Map visualizations
- Scalable pipeline architecture for high-volume Frame processing

**Current State:**
- ✅ Frame storage and retrieval working (`memory/store/`)
- ✅ Basic visualization via timeline and SVG graphs (PRs #74, #77)
- ✅ LRU caching and performance tuning (PR #76)
- ✅ Module ID validation and fuzzy matching (PR #72)
- ⚠️ Manual Frame creation only (no automated ingestion)
- ⚠️ No real-time sync between data updates and visualizations

## ⚠️ Existing Work - DO NOT DUPLICATE

**CRITICAL:** This Epic builds on substantial existing functionality. See [docs/EPIC_C_OVERLAP.md](../../docs/EPIC_C_OVERLAP.md) for comprehensive overlap analysis.

### Key PRs Already Merged:

| PR # | Feature | Status | Action Required |
|------|---------|--------|-----------------|
| [#77](https://github.com/Guffawaffle/lex/pull/77) | Visual timeline for Frame evolution | ✅ Merged | **USE** existing timeline component |
| [#76](https://github.com/Guffawaffle/lex/pull/76) | LRU caching & token-based auto-tuning | ✅ Merged | **USE** existing caching layer |
| [#75](https://github.com/Guffawaffle/lex/pull/75) | Syntax highlighting for code diffs | ✅ Merged | **USE** existing diff highlighting |
| [#74](https://github.com/Guffawaffle/lex/pull/74) | Interactive SVG graph rendering | ✅ Merged | **USE** existing SVG renderer |
| [#73](https://github.com/Guffawaffle/lex/pull/73) | TypeScript build path configuration | ✅ Merged | **FOLLOW** build patterns |
| [#72](https://github.com/Guffawaffle/lex/pull/72) | Phase 3 substring matching for module IDs | ✅ Merged | **USE** existing fuzzy matching |

**All sub-tasks must extend (not replace) these components.**

See [MERGE_COMPLETE.md](../../MERGE_COMPLETE.md) for technical details on these PRs.

## 🎯 Acceptance Criteria

### Core Functionality
- [ ] Sub C.1: Frame ingestion pipeline implemented (see issue #TBD)
- [ ] Sub C.2: Atlas/Map real-time sync implemented (see issue #TBD)
- [ ] Sub C.3: Documentation and cross-linking completed (see issue #TBD)
- [ ] All integration tests passing
- [ ] Performance benchmarks met (using existing cache from PR #76)

### Overlap Prevention (REQUIRED)
- [ ] **No duplication** of timeline visualization (PR #77) - Sub-tasks use existing APIs
- [ ] **No duplication** of LRU caching (PR #76) - Sub-tasks use existing cache layer
- [ ] **No duplication** of syntax highlighting (PR #75) - Sub-tasks use existing renderer
- [ ] **No duplication** of SVG graph rendering (PR #74) - Sub-tasks use existing component
- [ ] **No duplication** of module ID matching (PR #72) - Sub-tasks use existing validator
- [ ] Build configuration follows patterns from PR #73
- [ ] Code review confirms no reimplementation of existing features

### Quality & Documentation
- [ ] Unit tests for new ingestion sources
- [ ] Integration tests for sync pipeline
- [ ] Performance benchmarks documented
- [ ] API documentation updated
- [ ] Examples added to `examples/` directory
- [ ] CHANGELOG.md updated

## 📋 Sub-Tasks

### Tracking Issues
- [ ] #TBD - Sub C.1: Implement Frame ingestion pipeline
- [ ] #TBD - Sub C.2: Implement Atlas/Map real-time sync
- [x] #TBD - Sub C.3: Cross-link Epic C with existing PRs #72-#77 (this issue)

### Sub C.1: Frame Ingestion Pipeline

**Must Use:**
- Existing Frame schema (`shared/types/frame.ts`)
- Existing storage layer (`memory/store/`)
- Existing validation (`shared/module_ids/validator.ts`)

**Can Add:**
- Webhook ingestion endpoints
- File watcher for local Frame files
- Batch processing utilities
- Error recovery and retry logic

**Must NOT:**
- Reimplement Frame storage
- Create new module ID validation
- Bypass existing policy checks

### Sub C.2: Atlas/Map Real-Time Sync

**Must Use:**
- Existing Atlas Frame rendering (PR #74)
- Existing caching layer (PR #76)
- Existing timeline visualization (PR #77)

**Can Add:**
- WebSocket/SSE for real-time updates
- Conflict resolution for concurrent updates
- Multi-client synchronization
- Optimistic UI updates

**Must NOT:**
- Reimplement graph visualization
- Create new caching mechanisms
- Replace timeline components

### Sub C.3: Documentation & Cross-Linking

**Deliverables:**
- [x] Overlap analysis documented ([docs/EPIC_C_OVERLAP.md](../../docs/EPIC_C_OVERLAP.md))
- [x] Cross-reference table created
- [x] Integration guidelines established
- [ ] Epic C issue created (this issue)
- [ ] Sub-task issues created with proper references

## 🔗 Cross-Repo Links

**This epic is specific to the `Guffawaffle/lex` repository.**

Related work in `Guffawaffle/lexrunner`:
- (TBD - to be added when LexRunner integration is planned)

## 📊 Milestone

**Target:** M3 - Memory sync + aliasing adoption

**Dependencies:**
- Existing memory/store implementation (already complete)
- Existing atlas visualization (PRs #74, #77 - already complete)
- Policy validation infrastructure (already complete)

## 📝 Additional Notes

### Design Principles

1. **Extend, Don't Replace:** All new functionality must build on existing components documented in [EPIC_C_OVERLAP.md](../../docs/EPIC_C_OVERLAP.md)

2. **API Compatibility:** New ingestion sources must produce Frames compatible with existing storage/retrieval APIs

3. **Performance:** Use existing LRU cache (PR #76) and token-based limits; don't introduce new performance bottlenecks

4. **Visualization:** Leverage existing timeline (PR #77) and SVG rendering (PR #74); extend with real-time updates

5. **Validation:** All module IDs must pass through existing validator (PR #72) with fuzzy matching

### Architecture Constraints

- Frame ingestion must respect policy boundaries (`lexmap.policy.json`)
- Atlas sync must maintain fold-radius semantics (1-hop neighborhood)
- Real-time updates must be opt-in (not forced on all clients)
- All data flows must be observable for debugging

### Success Metrics

- Frame ingestion throughput: >100 frames/sec (batch mode)
- Real-time sync latency: <500ms (P95)
- Memory overhead: <50MB additional (with existing cache)
- Zero regressions in existing tests
- Zero duplication of existing features

## 🏷️ Labels

- `epic` - Top-level feature grouping
- `area:memory` - Frame storage and retrieval
- `area:atlas` - Graph and visualization
- `project:lexrunner-lex` - Project context
- `overlap-ok` - Intentional coordination with existing work

---

**Related Documentation:**
- [docs/EPIC_C_OVERLAP.md](../../docs/EPIC_C_OVERLAP.md) - Comprehensive overlap analysis
- [MERGE_COMPLETE.md](../../MERGE_COMPLETE.md) - Details on PRs #72-#77
- [docs/MIND_PALACE.md](../../docs/MIND_PALACE.md) - Frame and Atlas concepts
- [docs/ARCHITECTURE_LOOP.md](../../docs/ARCHITECTURE_LOOP.md) - System architecture

**Questions?** Comment on this issue or reach out to @Guffawaffle
