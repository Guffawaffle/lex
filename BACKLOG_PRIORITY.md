# Issue Prioritization & Backlog — November 22, 2025

## 🎯 Current Status

**Repository:** @smartergpt/lex
**Version:** 0.4.4-alpha (published)
**Tests:** 123/123 passing ✅
**CI:** 10/10 checks passing ✅

---

## 🔴 IMMEDIATE ACTIONS (This Week)

### ✅ COMPLETED (Nov 22)
- [x] Close Issue #227 (Release 0.4.4-alpha) — CLOSED
- [x] Create 5 child issues for Epic #196 (#252, #198, #254, #253, #247, #255)
- [x] Document dependency chain in Epic #196 comment
- [x] Generate PM analysis report

### ⚠️ TODO (Next 3 Days)

**Issue #196 (Epic: Cold Move — Canon Assets)**
1. Coordinate with lex-pr-runner team to create R-* counterpart issues:
   - R-CANON-CONSUME (#370 proposed)
   - R-LOADER (#371 proposed)
   - R-SCHEMAS (#372 proposed)
   - R-TESTS (#373 proposed)
   - R-CI (#374 proposed)
   - R-CLEAN (#375 proposed)

2. Document cross-repo synchronization points in both epics

**Milestone: smartergpt-structure-v1**
- Verify milestone exists in both repos
- Move all related issues to this milestone

---

## 📊 Backlog Priority Matrix

### Tier 1: Blocking (P0) — Production Ready Path
**Target: Q1 2026**

| Issue | Title | Effort | Dependencies | Impact |
|-------|-------|--------|--------------|--------|
| Epic #237 | Production Hardening (0.5.0) | XL (10-12w) | None | 🔴 Blocks 0.5.0 release for production use |
| #237.1 | Database encryption (SQLCipher) | M | None | Critical security feature |
| #237.2 | OAuth2/JWT authentication | L | None | Enterprise auth requirement |
| #237.3 | Enhanced audit logging | M | None | Compliance/SOC2 requirement |
| #237.4 | IP whitelisting | S | None | Network security |

**Action:** Break Epic #237 into 8 concrete issues (P0: #1-#3, P1: #4-#7, P2: #8)

---

### Tier 2: Strategic (P1) — Core Architecture
**Target: Q4 2025 / Q1 2026**

| Issue | Title | Effort | Dependencies | Impact |
|-------|-------|--------|--------------|--------|
| Epic #196 | Cold Move — Canon Assets | XL | None | 🟡 Enables 0.5.0 refactoring |
| #252 | L-CANON: Move assets | L | None | Foundation for precedence chain |
| #254 | L-SCHEMAS: Harden schemas | M | #252 | Data integrity + validation |
| #198 | L-LOADER: Rewrite loaders | L | #252 | Clean precedence implementation |
| #253 | L-TESTS: Update tests | M | #198 | Verification of new precedence |
| #247 | L-CI: Build adjustments | M | #252 | Publish automation |
| #255 | L-CLEAN: Remove legacy | M | All above | Final cleanup |

**Status:** Ready to start (all child issues created)
**Timeline:** Start Q4 2025, complete Q1 2026

---

### Tier 3: Feature (P2) — Capability Expansion
**Target: Q1 2026**

| Issue | Title | Effort | Dependencies | Impact |
|-------|-------|--------|--------------|--------|
| Epic #183 | Align .smartergpt.local structure | XL | Epic #196 | 🟡 Unifies config/local overlays |
| #187 | Token expansion + path normalization | M | None | User convenience feature |
| #186 | Frames export utility | M | #185 | Archive + sharing capability |
| #185 | Lex logging & backups | M | None | Operational safety |
| Epic #78 | Frame ingestion & Atlas | L | None | 🟠 Memory + rendering pipeline |
| #79 | Programmatic ingestion API | L | None | LexRunner integration |
| #80 | Atlas rebuild on demand | L | #79 | Index freshness |

**Status:** Backlog (depends on Epic #196 completion)

---

### Tier 4: Tech Debt (P3) — Cleanup & Refactoring
**Target: Q1 2026 (Post-Backlog)**

| Issue | Title | Effort | Dependencies | Impact |
|-------|-------|--------|--------------|--------|
| #175 | Phase 3D: FrameStore migration | L | None | 🟠 MCP server refactor |

**Status:** Deferred (high complexity, isolated from main flow)

---

## 📈 Release Timeline

```
v0.4.4-alpha ──────────── PUBLISHED ✅ (Nov 22, 2025)
               (v0.4.5-alpha bugfixes as needed)

v0.5.0 ────────────────── TARGET Q1 2026
├── Epic #196 complete (canon + precedence)
├── Epic #237 complete (production hardening: encryption, OAuth2, audit logs)
├── Epic #183 complete (config alignment)
└── All tests + CI passing

v0.5.0-alpha ─────────── PUBLISH alpha (target Jan 2026)
v0.5.0 ────────────────── STABLE RELEASE (target Mar 2026)
```

---

## 📋 Backlog Consolidation Tasks

### Done ✅
- [x] Close Issue #227 (Release completed)
- [x] Create all Lex child issues for Epic #196
- [x] Document dependency chain
- [x] Generate PM analysis

### In Progress 🟡
- [ ] Create LexRunner counterpart issues (R-CANON-CONSUME through R-CLEAN)
- [ ] Link cross-repo issues
- [ ] Verify milestone `smartergpt-structure-v1` exists in both repos

### Pending 🟤
- [ ] Schedule 0.5.0 planning (target: early January 2026)
- [ ] Break down Epic #237 into concrete sub-issues (8 issues)
- [ ] Create 0.5.0 milestone and assign all related issues
- [ ] Audit milestone #157 (0.4.0) and close completed items
- [ ] Update README with v0.4.4-alpha + migration notes

---

## 🔗 Issue Legend

**Status:**
- ✅ Closed/Completed
- 🟢 In Progress (actively being worked)
- 🟡 Active (not blocked, but not started)
- 🟤 Backlog (ready to start)
- 🔴 Blocked (waiting on blocker)

**Priority (P):**
- P0 = Critical / Production-blocking
- P1 = High / Strategic
- P2 = Medium / Feature
- P3 = Low / Tech debt

**Effort:**
- S = Small (1-2 days)
- M = Medium (3-5 days)
- L = Large (1-2 weeks)
- XL = Extra Large (2+ weeks)

---

## 📞 Cross-Repo Coordination

**Lex Repo Issues (NEW):**
- #252 L-CANON
- #198 L-LOADER (existing)
- #254 L-SCHEMAS
- #253 L-TESTS
- #247 L-CI
- #255 L-CLEAN

**LexRunner Repo Issues (TO CREATE):**
- R-CANON-CONSUME (proposed #370)
- R-LOADER (proposed #371)
- R-SCHEMAS (proposed #372)
- R-TESTS (proposed #373)
- R-CI (proposed #374)
- R-CLEAN (proposed #375)

**Sync Points:**
1. After Lex #252 (L-CANON): LexRunner can start #370 (R-CANON-CONSUME)
2. After Lex #198 (L-LOADER): LexRunner can start #371 (R-LOADER)
3. After Lex #254 (L-SCHEMAS): LexRunner can start #372 (R-SCHEMAS)
4. After Lex #253 (L-TESTS): LexRunner can start #373 (R-TESTS)
5. After Lex #247 (L-CI): LexRunner can start #374 (R-CI)
6. After all others complete: Both repos start final cleanup (#255, #375)

---

## 🎓 Lessons from v0.4.4-alpha

### What Worked Well ✅
- Focused IP cleanup with git-filter-repo
- Package rename to @smartergpt/lex (clear branding)
- Comprehensive release notes
- All tests + CI passing before publish

### What to Improve 🔄
- Coordinate LexRunner updates in same PR (avoid stale version refs)
- Add cross-repo dependency tracking earlier
- Create milestones before breaking work into child issues

### Action Items for Team
1. Document cross-repo sync points in team wiki
2. Add "depends on repo:X issue:Y" label pattern
3. Consider monthly cross-repo sync calls during refactors

---

*Report compiled by Project Manager on 2025-11-22*
*Next review: 2025-11-29 (1 week)*
