# 🚀 Project 0.5.0: Production Hardening & Canon Assets Restructuring

**Project URL:** https://github.com/users/Guffawaffle/projects/4
**Scope Document:** Created November 22, 2025
**Target Release:** March 2026
**PM Owner:** Project Manager
**Repository Coordination:** Lex (@smartergpt/lex) + LexRunner (lex-pr-runner)

---

## 📋 Executive Summary

**Project Goal:** Transform Lex from alpha to production-ready internal platform by implementing critical security hardening, restructuring asset management, and aligning cross-repo architecture.

**Release Scope:**
- **Tier 1 (BLOCKING):** Production hardening (encryption, OAuth2, audit logging) — 12 weeks
- **Tier 2 (STRATEGIC):** Canon asset restructuring + precedence chain — 8-10 weeks
- **Tier 3 (ALIGNED):** Cross-repo alignment (LexRunner consuming Lex) — 6-8 weeks (parallel)

**Timeline:** January-March 2026 (16-week engagement)

**Success Metric:** v0.5.0 stable release suitable for internal production deployment

---

## 🎯 Why This Scope?

### Problem Statement
Current state (@smartergpt/lex v0.4.4-alpha):
- ✅ Alpha release published (working baseline)
- ✅ API server with rate limiting (basic hardening)
- ❌ **NO database encryption** (security gap)
- ❌ **NO OAuth2/JWT** (auth gap for enterprise)
- ❌ **Limited audit trails** (compliance gap)
- ❌ **Mixed asset loading** (architectural debt)
- ❌ **Duplicate precedence logic** (cross-repo inconsistency)

### Strategic Opportunities
1. **Production Readiness:** Single focused engagement to achieve enterprise-grade security
2. **Cross-Repo Alignment:** Lex + LexRunner work together on shared refactoring
3. **Clear Success Criteria:** Security audit pass, performance benchmarks, full test coverage
4. **Manageable Timeline:** 16 weeks is sufficient for P0+P1 items without quality compromise

### Scope Decisions (What's In / Out)

#### ✅ IN: Core Production Features (P0-P1)
- **Encryption at Rest:** SQLCipher integration (P0, blocks release)
- **Authentication:** OAuth2/JWT implementation (P0, blocks release)
- **Audit Logging:** Enhanced with hash chain + tamper detection (P0, blocks release)
- **Security Tests:** Comprehensive test suite (P1, gates release)
- **Canon Restructuring:** Asset precedence chain cleanup (P1, enables LexRunner alignment)
- **Cross-Repo Sync:** LexRunner consuming Lex assets (P1, operational alignment)

#### ❌ OUT: Nice-to-Haves (P2-P3, deferred to v0.6)
- GDPR compliance tools (P2, post-release)
- Schema version validation enhancement (P2, post-release)
- IP whitelisting UI dashboard (P2, post-release)
- FrameStore MCP migration (P3, deferred indefinitely)
- Memory rendering visualizations (P2, covered in other PRs)

#### ⚠️ PARALLEL: May Start But Not Blocking Release
- Token optimization suite (LexRunner epic, parallel track)
- Single-command orchestration (LexRunner epic, parallel track)
- Atlas rebuild performance (LexRunner epic, parallel track)

---

## 🗂️ Detailed Scope Breakdown

### TIER 1: PRODUCTION HARDENING (Lex + LexRunner Parallel)

**Epic #237: Production Hardening for 0.5.0**

#### Phase 1.1: Database Encryption (Weeks 1-3)
- **Lead:** Lex team
- **Effort:** 2-3 weeks
- **Issues:**
  - #237.1: SQLCipher integration + key management
  - #237.2: Migration tool for existing databases
  - #237.3: Encryption performance benchmarking
- **Acceptance Criteria:**
  - [ ] SQLCipher compiles on Linux/macOS/Windows
  - [ ] Encryption key required in production mode
  - [ ] Migration tool preserves data integrity
  - [ ] Performance impact <10% on read/write
  - [ ] Documentation for key management strategy
  - [ ] All tests passing (target: 130+)

**Dependency:** None (can start immediately)
**Blocks:** #237.4 (auth implementation)
**Related LexRunner:** R-SCHEMAS (must align with encrypted data format)

---

#### Phase 1.2: OAuth2/JWT Authentication (Weeks 3-6)
- **Lead:** Lex team
- **Effort:** 3-4 weeks
- **Issues:**
  - #237.4: OAuth2 code flow implementation
  - #237.5: JWT validation + token refresh
  - #237.6: Identity provider integration (GitHub, Google)
  - #237.7: User isolation in database
- **Acceptance Criteria:**
  - [ ] OAuth2 code flow working with 2+ providers
  - [ ] JWT tokens validate correctly
  - [ ] Token refresh endpoint working
  - [ ] Backward compatibility with API keys (deprecated)
  - [ ] User isolation verified (frames per user)
  - [ ] Security audit pass (no token leakage)

**Dependency:** None (parallel to encryption)
**Blocks:** #237.8 (audit logging with user context)
**Related LexRunner:** #371 (R-LOADER) alignment on user context

---

#### Phase 1.3: Enhanced Audit Logging (Weeks 5-7)
- **Lead:** Lex team
- **Effort:** 2-3 weeks
- **Issues:**
  - #237.8: Database operation logging
  - #237.9: Hash chain implementation for tamper detection
  - #237.10: Log rotation + retention policy
  - #237.11: SIEM export (JSON/JSONL format)
- **Acceptance Criteria:**
  - [ ] All DB operations logged with timestamp + user
  - [ ] Hash chain working (tamper detection)
  - [ ] Log rotation daily/weekly configurable
  - [ ] Retention policy enforced
  - [ ] SIEM export format documented
  - [ ] SOC2-ready compliance report format

**Dependency:** #237.4-5 (user context from OAuth2)
**Blocks:** None
**Related LexRunner:** #374 (R-CI) validation of audit logs

---

### TIER 2: CANON ASSETS & PRECEDENCE (Epic #196 - Core Refactoring)

**Epic #196: Cold Move — Canon Assets + Precedence Chain**

#### Phase 2.1: Asset Restructuring (Weeks 1-3, parallel to P1.1)
- **Lead:** Lex team
- **Effort:** 2-3 weeks
- **Issues:**
  - #252: L-CANON (Move assets to canon/ directory)
  - #254: L-SCHEMAS (Harden with $id + validation)
- **Acceptance Criteria:**
  - [ ] canon/prompts/ and canon/schemas/ created
  - [ ] All schemas include $id field
  - [ ] additionalProperties: false on all objects
  - [ ] npm pack includes published directories
  - [ ] No source structure in tarball

**Dependency:** None (can start immediately)
**Blocks:** #198, #247, #374
**Related LexRunner:** #370 (R-CANON-CONSUME)

---

#### Phase 2.2: Loader Rewrite (Weeks 3-5)
- **Lead:** Lex team
- **Effort:** 2-3 weeks
- **Issues:**
  - #198: L-LOADER (Rewrite with 3-level precedence)
  - #371: R-LOADER (LexRunner alignment)
- **Acceptance Criteria:**
  - [ ] 3-level precedence working (ENV → local → package)
  - [ ] Precedence tests all passing
  - [ ] Error messages clear (paths shown)
  - [ ] Cross-repo loaders aligned
  - [ ] No legacy fallbacks remain

**Dependency:** #252 (L-CANON)
**Blocks:** #253 (L-TESTS), #371 (R-LOADER)
**Related LexRunner:** #371 (must align loaders)

---

#### Phase 2.3: Test & CI Updates (Weeks 5-7)
- **Lead:** Lex + LexRunner teams
- **Effort:** 2-3 weeks
- **Issues:**
  - #253: L-TESTS (Precedence test suite)
  - #247: L-CI (Build & publish validation)
  - #373: R-TESTS (LexRunner precedence tests)
  - #374: R-CI (LexRunner CI updates)
- **Acceptance Criteria:**
  - [ ] All precedence tests passing (3-level chain)
  - [ ] CI validates schemas before publish
  - [ ] Tarball structure verified
  - [ ] Cross-repo tests aligned
  - [ ] Coverage ≥95%

**Dependency:** #198, #252, #254
**Blocks:** #255 (L-CLEAN), #375 (R-CLEAN)
**Related:** Cross-repo coordination essential

---

#### Phase 2.4: Legacy Cleanup (Weeks 7-8)
- **Lead:** Lex + LexRunner teams
- **Effort:** 1-2 weeks
- **Issues:**
  - #255: L-CLEAN (Remove backward-compat code)
  - #375: R-CLEAN (LexRunner cleanup)
- **Acceptance Criteria:**
  - [ ] No .smartergpt/ (tracked) references
  - [ ] No legacy env vars documented
  - [ ] All legacy patterns grep returns 0
  - [ ] CHANGELOG updated with breaking changes
  - [ ] npm pack successful

**Dependency:** All prior Phase 2 issues
**Blocks:** None (final step)
**Related:** Both repos must coordinate cleanup

---

### TIER 3: CROSS-REPO ALIGNMENT (LexRunner-Specific, Parallel)

**Related Issues:** #370-375 (R-CANON through R-CLEAN)

#### Phase 3.1: Lex Consumption (Weeks 3-4, parallel to Phase 2)
- **Lead:** LexRunner team
- **Issue:** #370 (R-CANON-CONSUME)
- **Effort:** 1-2 weeks
- **Work:**
  - Consume canon from @smartergpt/lex package
  - Update package.json dependency
  - Verify all imports working
- **Blocks:** #371, #372

#### Phase 3.2: Loader + Schema Alignment (Weeks 4-6)
- **Lead:** LexRunner team
- **Issues:** #371 (R-LOADER), #372 (R-SCHEMAS)
- **Effort:** 2 weeks
- **Work:**
  - Align loaders with Lex precedence
  - Consume Lex schemas directly
  - Remove duplicate definitions
- **Blocks:** #373

#### Phase 3.3: Testing Alignment (Week 6)
- **Lead:** LexRunner team
- **Issue:** #373 (R-TESTS)
- **Effort:** 1 week
- **Work:**
  - Update precedence tests to match Lex
  - Verify cross-repo schema validation
- **Blocks:** #374

#### Phase 3.4: CI/CD Sync (Weeks 6-7)
- **Lead:** LexRunner team
- **Issue:** #374 (R-CI)
- **Effort:** 1 week
- **Work:**
  - Update workflows to validate Lex schemas
  - Coordinate publish gates
- **Blocks:** #375

#### Phase 3.5: LexRunner Cleanup (Week 8)
- **Lead:** LexRunner team
- **Issue:** #375 (R-CLEAN)
- **Effort:** 1 week
- **Work:**
  - Remove LexRunner-specific fallbacks
  - Clean up duplicate config loading
- **Blocks:** None

---

## 📊 Work Schedule & Timeline

```
WEEK 1 (Jan 6-10)       KICKOFF & PARALLEL START
├─ P1.1: Encryption kick (SQLCipher design)
├─ P2.1: Asset restructuring kick (canon/ setup)
├─ P3.1: LexRunner kickoff (dependency update)
└─ P0: Cross-repo sync #1

WEEK 2-3 (Jan 13-24)    FOUNDATION PHASE
├─ P1.1: SQLCipher implementation
├─ P2.1: Asset move + schema hardening
├─ P3.1: Package consumption working
└─ P0: Cross-repo sync #2

WEEK 4-5 (Jan 27-Feb 7) SECURITY PHASE
├─ P1.2: OAuth2 implementation
├─ P2.2: Loader rewrite (L-LOADER)
├─ P3.2: LexRunner loaders aligned
└─ P0: Cross-repo sync #3

WEEK 6 (Feb 10-14)      INTEGRATION PHASE
├─ P1.2: OAuth2 testing + validation
├─ P1.3: Audit logging kickoff
├─ P2.3: Test suite updates (L-TESTS)
├─ P3.3: LexRunner tests aligned
└─ P0: Cross-repo sync #4

WEEK 7 (Feb 17-21)      HARDENING PHASE
├─ P1.3: Audit logging complete + tested
├─ P2.4: Legacy cleanup starts (L-CLEAN)
├─ P3.4: LexRunner CI updates
└─ P0: Cross-repo sync #5

WEEK 8 (Feb 24-28)      CLEANUP & FREEZE
├─ P1: Final security audit
├─ P2.4: Legacy cleanup complete
├─ P3.5: LexRunner cleanup complete
├─ All PRs merged to staging branch
└─ P0: Pre-release review

WEEK 9-12 (Mar 3-31)    RELEASE PHASE
├─ Documentation updates
├─ Release notes preparation
├─ v0.5.0-alpha tag
├─ npm publish (v0.5.0-alpha dist-tag)
├─ v0.5.0 stable tag (after final testing)
└─ Release communications
```

---

## 👥 Team Allocation & Roles

### Lex Repository (Primary)
- **Lead:** PM (you)
- **Security Lead:** TBD (encryption + OAuth2)
- **Architecture Lead:** TBD (canon restructuring)
- **QA Lead:** TBD (test suite)

### LexRunner Repository (Parallel)
- **Lead:** TBD (cross-repo coordination)
- **Integration Lead:** TBD (Lex consumption)
- **QA Lead:** TBD (alignment testing)

### Cross-Repo Coordination
- **PM (you):** Weekly sync scheduling, blocker resolution
- **Both Tech Leads:** Bi-weekly architectural review
- **Both QA Leads:** Joint test plan development

---

## ✅ Definition of Done (Release Gates)

### Pre-Alpha (v0.5.0-alpha)
- [ ] All P0 items complete
- [ ] All tests passing (130+)
- [ ] All CI checks passing (10+)
- [ ] Security audit complete
- [ ] Performance benchmarks met (<10% regression)
- [ ] Breaking changes documented
- [ ] Migration guide written

### Stable Release (v0.5.0)
- [ ] All P1 items complete
- [ ] All acceptance criteria verified
- [ ] Documentation complete (README, CONTRIBUTING, API docs)
- [ ] Release notes published
- [ ] GitHub release created
- [ ] npm published with stable tag

---

## 📊 Success Metrics

| Metric | Target | Owner |
|--------|--------|-------|
| Tests Passing | 130+ | QA |
| CI Passing | 10+ checks | DevOps |
| Code Coverage | ≥90% | QA |
| Build Determinism | Clean | DevOps |
| Security Audit | Pass | Security Lead |
| Performance Impact | <10% regression | Perf Lead |
| Breaking Changes | Documented | PM |
| Team Alignment | Weekly syncs | PM |

---

## 🚨 Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| OAuth2 implementation delays | Blocks release | Start early, use proven libraries |
| SQLCipher performance issues | Performance regression | Benchmark weekly |
| Cross-repo coordination breakdown | Schedule slip | Weekly syncs mandatory |
| Test coverage gaps | Quality regression | Comprehensive test plan upfront |
| Breaking changes not documented | User confusion | Doc review gate before release |

---

## 📋 Success Criteria & Validation

### Acceptance Criteria (Per Phase)
- [ ] **P1.1 (Encryption):** SQLCipher working, migration tool tested, <10% perf impact
- [ ] **P1.2 (OAuth2):** 2+ providers, backward compatibility, user isolation verified
- [ ] **P1.3 (Audit Logging):** Hash chain working, SIEM export format validated
- [ ] **P2.1 (Assets):** canon/ structure published, schemas validated
- [ ] **P2.2 (Loaders):** 3-level precedence working, cross-repo aligned
- [ ] **P2.3 (Tests):** 95%+ coverage, all precedence tests passing
- [ ] **P3.x (LexRunner):** All R-* issues complete, cross-repo sync verified

### Release Readiness Gate
Before v0.5.0-alpha publish:
1. **Security Audit Pass** ✅
2. **Performance Benchmarks Met** ✅
3. **All Tests Passing** ✅
4. **Breaking Changes Documented** ✅
5. **Migration Guide Complete** ✅
6. **Cross-Repo Alignment Verified** ✅

---

## 🔗 Related Resources

### GitHub Issues
- **Epic #237:** Production Hardening (P0-P2 items)
- **Epic #196:** Canon Assets (P1 refactoring)
- **Epic #183:** Config Alignment (post-P2)
- **LexRunner #370-375:** R-* issues (cross-repo)

### Documentation
- `PM_SUMMARY.md` — Executive overview
- `ISSUE_ANALYSIS.md` — Detailed issue breakdown
- `BACKLOG_PRIORITY.md` — Backlog prioritization
- `PM_ACTION_CHECKLIST.md` — Team action items

### Milestones
- `smartergpt-structure-v1` — Cross-repo coordination
- `0.5.0` — Release target (March 2026)

---

## 📞 Communication Plan

### Stakeholder Updates
- **Weekly:** PM to team (progress, blockers, next steps)
- **Bi-weekly:** Tech leads (architectural alignment)
- **Monthly:** Executive summary (leadership)

### Sync Meetings
- **Every Monday:** 30-min cross-repo sync (PM + leads)
- **As Needed:** Architecture discussion (when blocked)
- **Before Release:** Final readiness review

### Documentation
- Every PR should reference parent epic (#237 or #196)
- All breaking changes documented in CHANGELOG
- Migration guide updated as features land

---

## 📍 GitHub Project Board Setup

**Project #4 Columns:**
1. **📋 Inbox** → Newly created issues
2. **🎯 P1.1: Encryption** → Database hardening work
3. **🎯 P1.2: Auth** → OAuth2/JWT implementation
4. **🎯 P1.3: Audit** → Logging + compliance
5. **🎯 P2: Assets** → Canon restructuring
6. **🎯 P3: LexRunner** → Cross-repo alignment
7. **🔄 In Progress** → Active work
8. **👀 In Review** → PR review phase
9. **✅ Done** → Completed work

**Issue Assignment:** Every issue assigned to PM (tracking), plus technical owner

---

## 🎓 Key Decisions & Rationale

1. **Why 16-week timeline?**
   - P0 items (encryption, auth, audit) are complex (10-12 weeks minimum)
   - P1 items (restructuring) benefit from parallel execution (6-8 weeks)
   - Buffer for testing, documentation, release (2-4 weeks)

2. **Why split P1 and P2?**
   - P0 (hardening) unblocks production use immediately
   - P1 (restructuring) enables LexRunner alignment
   - P2 (other features) can slide to v0.6 without impact

3. **Why coordinate with LexRunner?**
   - Both repos share schema/loader architecture
   - Parallel work reduces total timeline
   - Cross-repo testing validates alignment
   - Single failure point must be managed

4. **Why NOT include P2 items in v0.5.0?**
   - Scope creep risk (16 weeks is already aggressive)
   - P2 items (GDPR, whitelisting) not production-blocking
   - Easier to release on schedule and iterate

---

*Project Board Document v1.0*
*Created: November 22, 2025*
*PM: Ambitious Project Manager*
*Status: ✅ READY TO EXECUTE*
