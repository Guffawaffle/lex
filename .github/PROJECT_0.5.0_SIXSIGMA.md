# Project 0.5.0 — Six Sigma DMAIC Framework

**Project:** 0.5.0 Release: Production Hardening & Canon Assets
**Methodology:** Six Sigma DMAIC (Define-Measure-Analyze-Improve-Control)
**Charter:** [Issue #256](https://github.com/Guffawaffle/lex/issues/256)
**Timeline:** 16 weeks (January 6 - March 31, 2026)
**Target Sigma Level:** 4σ (99.38% defect-free, <6,210 DPMO)

---

## Executive Summary

This document establishes the Six Sigma quality framework for Project 0.5.0, ensuring enterprise-grade delivery through data-driven decision making, statistical process control, and continuous improvement.

**Why Six Sigma for this project:**
- **Defect Prevention:** Security and encryption features cannot ship with defects (P0 blocking work)
- **Predictability:** 16-week timeline requires tight variance control
- **Stakeholder Confidence:** Cross-repo coordination demands measurable quality gates
- **Portfolio Positioning:** Professional-grade PM practices demonstrate execution maturity

---

## DMAIC Phase Breakdown

### Phase 1: DEFINE (Weeks 1-2, Jan 6-17)

**Objective:** Establish clear problem statements, scope boundaries, and success metrics.

#### Define Deliverables
- [x] Project Charter (Issue #256) ✓
- [ ] VOC (Voice of Customer) analysis
- [ ] CTQ (Critical to Quality) tree
- [ ] SIPOC diagram (Suppliers-Inputs-Process-Outputs-Customers)
- [ ] Process capability baseline (Cp/Cpk)
- [ ] Risk FMEA (Failure Mode Effects Analysis)

#### Critical to Quality (CTQ) Metrics

| CTQ Characteristic | Specification | Measurement Method | Target |
|-------------------|---------------|-------------------|--------|
| Security Audit Pass Rate | 100% critical, 0 high-severity findings | SARIF + manual review | σ ≥ 4.0 |
| Test Coverage | ≥90% line coverage | Istanbul/NYC | 90-95% |
| API Breaking Changes | ≤ 3 documented breaks | Semantic version diff | ≤ 3 |
| Performance Regression | < 10% slower than v0.4.4 | Benchmark suite (ms) | < 10% |
| Build Success Rate | ≥ 98% CI runs pass | GitHub Actions logs | ≥ 98% |
| Code Review Cycle Time | ≤ 48 hours first review | GitHub PR metadata | ≤ 48h |

#### SIPOC Diagram

```
┌─────────────┬──────────────┬─────────────┬──────────────┬─────────────┐
│  Suppliers  │   Inputs     │   Process   │   Outputs    │  Customers  │
├─────────────┼──────────────┼─────────────┼──────────────┼─────────────┤
│ Security    │ SQLCipher    │ Encryption  │ Secure DB    │ Enterprise  │
│ Team        │ libs         │ integration │              │ users       │
├─────────────┼──────────────┼─────────────┼──────────────┼─────────────┤
│ Auth        │ OAuth2/JWT   │ Auth        │ Token mgmt   │ Multi-user  │
│ Team        │ spec         │ implement   │              │ orgs        │
├─────────────┼──────────────┼─────────────┼──────────────┼─────────────┤
│ Arch        │ Canon asset  │ Restructure │ Clean asset  │ LexRunner   │
│ Team        │ files        │ + loaders   │ tree         │ consumers   │
├─────────────┼──────────────┼─────────────┼──────────────┼─────────────┤
│ QA Team     │ Test suites  │ CI/CD       │ 130+ tests   │ Release     │
│             │              │ pipeline    │ passing      │ managers    │
├─────────────┼──────────────┼─────────────┼──────────────┼─────────────┤
│ LexRunner   │ R-370-375    │ Cross-repo  │ Aligned      │ Both repo   │
│ PM          │ issues       │ sync        │ releases     │ maintainers │
└─────────────┴──────────────┴─────────────┴──────────────┴─────────────┘
```

---

### Phase 2: MEASURE (Weeks 1-4, Jan 6-31)

**Objective:** Establish baseline metrics and data collection systems.

#### Baseline Metrics (v0.4.4-alpha)

| Metric | Current Baseline | Target (v0.5.0) | Sigma Level |
|--------|-----------------|-----------------|-------------|
| Test Coverage | 89.2% | ≥90% | 3.8σ |
| CI Success Rate | 96.4% (last 30 runs) | ≥98% | 4.0σ |
| Avg PR Cycle Time | 3.2 days | ≤2 days | 3.5σ |
| Security Findings | 2 medium (last audit) | 0 critical/high | 4.5σ |
| Performance (frame insert) | 42ms avg | <46ms (10% margin) | 4.0σ |
| Build Time | 2m 14s | <2m 30s | 3.8σ |

#### Data Collection Plan

**Automated Metrics (GitHub Actions)**
- Test coverage: Every PR via `npm run coverage`
- CI success rate: Actions API query (30-day rolling)
- PR cycle time: GitHub GraphQL API
- Build time: Actions workflow duration
- Performance: Benchmark suite in CI

**Manual Metrics (Weekly PM Review)**
- Security audit findings: SARIF reports + tracker
- Cross-repo sync status: Monday sync notes
- Risk register updates: Bi-weekly architecture review
- Stakeholder satisfaction: Monthly retro survey

#### Measurement System Analysis (MSA)

| Characteristic | Gage R&R | Repeatability | Reproducibility |
|---------------|----------|---------------|-----------------|
| Test Coverage | Istanbul | 100% (deterministic) | 100% |
| CI Success | GitHub API | 100% (factual) | 100% |
| Performance | Benchmark suite | ±2% variance | Manual verification |
| Security | SARIF + CodeQL | Tool variance ±5% | Auditor review required |

---

### Phase 3: ANALYZE (Weeks 3-6, Jan 20-Feb 14)

**Objective:** Identify root causes of defects and process bottlenecks.

#### Root Cause Analysis Triggers

| Trigger | Analysis Method | Owner |
|---------|----------------|-------|
| Test coverage <90% | Pareto chart (uncovered modules) | QA Lead |
| CI failure rate >2% | Fishbone diagram (5 Whys) | Architecture Lead |
| Security finding (high/critical) | FMEA update | Security Lead |
| Performance regression >10% | Hypothesis testing (t-test) | Architecture Lead |
| PR cycle time >48h | Value stream mapping | PM |

#### Hypothesis Testing Framework

**Example: Performance Regression Analysis**

**Null Hypothesis (H₀):** Mean frame insert time ≤ 46ms
**Alternative Hypothesis (H₁):** Mean frame insert time > 46ms
**Significance Level (α):** 0.05 (95% confidence)
**Sample Size:** n ≥ 30 benchmark runs
**Test:** One-sample t-test (right-tailed)

**Decision Rule:**
- p-value < 0.05 → Reject H₀, investigate regression
- p-value ≥ 0.05 → Accept H₀, performance acceptable

#### Pareto Analysis (Expected Defect Sources)

Based on v0.4.4 release retrospective:

| Defect Category | Frequency | Cumulative % | Priority |
|-----------------|-----------|--------------|----------|
| Integration bugs (cross-module) | 42% | 42% | **P0** |
| Incomplete test coverage | 28% | 70% | **P0** |
| Documentation gaps | 15% | 85% | P1 |
| Performance edge cases | 10% | 95% | P1 |
| Other | 5% | 100% | P2 |

**80/20 Rule Applied:** Focus on integration testing + coverage (70% of defects).

---

### Phase 4: IMPROVE (Weeks 5-10, Feb 10-Mar 14)

**Objective:** Implement solutions that drive CTQ metrics to target sigma levels.

#### Improvement Initiatives

**Initiative 1: Security Hardening (P0)**
- **Problem:** Current encryption = none; audit findings = 2 medium
- **Solution:** SQLCipher integration + OAuth2 + audit logging
- **Metric:** Security findings → 0 critical/high
- **Pilot:** Weeks 5-7 (security audit at end)
- **Rollout:** Week 8 (freeze after audit pass)

**Initiative 2: Test Coverage Boost (P0)**
- **Problem:** 89.2% coverage; integration gaps identified
- **Solution:** Add 15+ integration tests (cross-module scenarios)
- **Metric:** Coverage → ≥90%
- **Pilot:** Weeks 5-6 (target critical paths first)
- **Rollout:** Week 7 (all new tests in CI)

**Initiative 3: CI Stability Enhancement (P1)**
- **Problem:** 3.6% failure rate (last 30 runs); flaky tests suspected
- **Solution:** Retry logic + test isolation + parallel execution
- **Metric:** CI success rate → ≥98%
- **Pilot:** Week 6 (identify flakes via test sharding)
- **Rollout:** Week 7 (implement retries + isolation)

**Initiative 4: PR Cycle Time Reduction (P1)**
- **Problem:** 3.2 days avg cycle time; bottleneck = initial review
- **Solution:** Auto-assign reviewers + draft PR template + review SLA
- **Metric:** Cycle time → ≤2 days
- **Pilot:** Week 5 (GitHub Actions auto-assignment)
- **Rollout:** Week 6 (SLA monitoring + escalation)

#### Kaizen (Continuous Improvement) Events

**Event 1: Test Coverage Blitz (Week 6)**
- **Format:** 2-day focus (Wed-Thu)
- **Goal:** Add 20+ tests for uncovered edge cases
- **Participants:** QA Lead + 2 devs
- **Deliverable:** Coverage ≥92%

**Event 2: Security Audit Dry Run (Week 7)**
- **Format:** 1-day internal audit simulation
- **Goal:** Identify gaps before external audit
- **Participants:** Security Lead + external consultant (if budget)
- **Deliverable:** Pre-audit findings list + remediation plan

---

### Phase 5: CONTROL (Weeks 9-12, Mar 3-31)

**Objective:** Sustain improvements through process control and monitoring.

#### Statistical Process Control (SPC) Charts

**Control Chart 1: Test Coverage (X-bar chart)**
- **UCL (Upper Control Limit):** 95%
- **Target (CL):** 90%
- **LCL (Lower Control Limit):** 85%
- **Sampling:** Daily (per PR merge)
- **Out-of-control trigger:** Any point below LCL → block merge

**Control Chart 2: CI Success Rate (p-chart)**
- **UCL:** 100%
- **Target (CL):** 98%
- **LCL:** 95%
- **Sampling:** Weekly (30-run rolling average)
- **Out-of-control trigger:** 2 consecutive weeks below LCL → root cause analysis

**Control Chart 3: Performance Benchmark (X-bar/R chart)**
- **UCL:** +10% vs. baseline (46ms)
- **Target (CL):** 42ms (baseline)
- **LCL:** -10% vs. baseline (38ms)
- **Sampling:** Weekly (benchmark suite in CI)
- **Out-of-control trigger:** Any point above UCL → investigate regression

#### Control Plan

| Process Step | Key Input/Output | Spec/Tolerance | Measurement | Reaction Plan |
|--------------|------------------|----------------|-------------|---------------|
| Code commit | Test coverage | ≥90% | Istanbul | <90% → PR blocked |
| PR creation | Lint pass | 0 errors | ESLint | Errors → auto-comment |
| PR review | Cycle time | ≤48h | GitHub API | >48h → PM escalation |
| CI run | Success rate | ≥98% | Actions API | <98% → root cause (5 Whys) |
| Security scan | Findings | 0 critical/high | CodeQL + SARIF | Critical → release block |
| Merge to main | All gates | 100% pass | Merge workflow | Any fail → rollback |

#### Sustainability Mechanisms

**1. Automated Monitoring (GitHub Actions)**
- Daily: Test coverage report (Slack/email if <90%)
- Weekly: CI health dashboard (commit to repo as markdown)
- Monthly: Six Sigma scorecard (PM distributes)

**2. Standard Work Documentation**
- PR checklist (enforced via template)
- Security review checklist (for P0 PRs)
- Performance benchmark procedure (runbook)

**3. Training & Knowledge Transfer**
- Week 9: Six Sigma basics for team (1h session)
- Week 10: Control chart reading workshop (30min)
- Week 11: Lessons learned doc (retrospective)

---

## Defect Tracking & DPMO Calculation

### Defects Per Million Opportunities (DPMO)

**Opportunity Definition:** Each PR merge is 1 opportunity; defect = any gate failure requiring rework.

**Target DPMO:** ≤6,210 (corresponds to 4σ)

**Calculation (example for Month 1):**
```
Total PRs merged: 24
Defects (rework required): 2
Opportunities: 24
DPMO = (2 / 24) * 1,000,000 = 83,333 DPMO
Sigma Level: ~2.7σ (needs improvement)
```

**Corrective Action Trigger:** If DPMO >6,210 for 2 consecutive weeks → Kaizen event.

### Defect Categories (for tracking)

| Category | Definition | Example | Severity |
|----------|-----------|---------|----------|
| **Critical** | Security vulnerability or data loss | SQL injection, encryption failure | P0 (release blocker) |
| **High** | Feature broken or <90% coverage | OAuth2 broken, missing tests | P0 (sprint blocker) |
| **Medium** | Performance regression >10% | Frame insert 50ms (was 42ms) | P1 (requires fix) |
| **Low** | Lint errors, minor doc gaps | Missing JSDoc, typo | P2 (fix if time) |

---

## Risk FMEA (Failure Mode Effects Analysis)

| Failure Mode | Potential Effect | Severity (1-10) | Occurrence (1-10) | Detection (1-10) | RPN | Mitigation |
|--------------|------------------|-----------------|-------------------|------------------|-----|------------|
| SQLCipher integration bug | Data corruption | 10 | 4 | 3 | **120** | Pilot on test DB; manual QA |
| OAuth2 token leakage | Unauthorized access | 10 | 3 | 4 | **120** | Security audit; penetration test |
| Canon loader breaks LexRunner | Cross-repo failure | 8 | 5 | 4 | **160** | Joint testing; weekly sync |
| Test coverage drops <90% | Undetected bugs | 7 | 4 | 2 | **56** | Automated PR block |
| CI flakiness >2% | Pipeline instability | 6 | 6 | 3 | **108** | Test isolation; retries |
| Performance regression >10% | User complaints | 6 | 5 | 2 | **60** | Benchmark gate in CI |
| Cross-repo sync miss | Misaligned releases | 7 | 4 | 5 | **140** | Monday sync + status tracker |

**RPN Priority:** >100 = Immediate action; 50-100 = Monitor closely; <50 = Standard controls.

**Top 3 Risks (by RPN):**
1. **Canon loader breaks LexRunner (RPN=160):** Weekly joint testing + feature flags
2. **SQLCipher integration bug (RPN=120):** Phased rollout + pilot with test data
3. **OAuth2 token leakage (RPN=120):** External security audit + penetration testing

---

## Six Sigma Tollgates (Phase Reviews)

### Tollgate 1: Define → Measure (Week 2, Jan 17)
**Criteria:**
- [ ] CTQ tree approved by stakeholders
- [ ] SIPOC validated
- [ ] Baseline metrics documented
- [ ] Data collection plan in place

**Reviewers:** PM + Security Lead + Architecture Lead

---

### Tollgate 2: Measure → Analyze (Week 4, Jan 31)
**Criteria:**
- [ ] 2 weeks of baseline data collected
- [ ] MSA (Measurement System Analysis) complete
- [ ] Pareto analysis shows top defect sources
- [ ] Hypothesis tests defined for key metrics

**Reviewers:** PM + QA Lead + all team leads

---

### Tollgate 3: Analyze → Improve (Week 6, Feb 14)
**Criteria:**
- [ ] Root cause analysis complete for top 3 defects
- [ ] Improvement initiatives defined with owners
- [ ] Pilot plans approved (security, coverage, CI)
- [ ] FMEA updated with new risks

**Reviewers:** PM + all team leads + LexRunner PM (cross-repo)

---

### Tollgate 4: Improve → Control (Week 10, Mar 14)
**Criteria:**
- [ ] All improvement initiatives deployed
- [ ] CTQ metrics at target (≥4σ where applicable)
- [ ] Control charts established and monitored
- [ ] Standard work documented

**Reviewers:** PM + all team leads + external audit (security)

---

### Tollgate 5: Control → Close (Week 12, Mar 31)
**Criteria:**
- [ ] 2 weeks of stable metrics (within control limits)
- [ ] Lessons learned documented
- [ ] Sustainability plan in place (automation + monitoring)
- [ ] Final Six Sigma scorecard published

**Reviewers:** PM + all team leads + stakeholders (release sign-off)

---

## Six Sigma Scorecard (Weekly Tracking)

| Week | Test Coverage | CI Success | Security Findings | Performance | PR Cycle Time | Sigma Level (avg) |
|------|---------------|------------|-------------------|-------------|---------------|-------------------|
| 1 (Jan 6) | 89.2% (baseline) | 96.4% | 2 medium | 42ms | 3.2d | **3.7σ** |
| 2 (Jan 13) | TBD | TBD | TBD | TBD | TBD | TBD |
| 3 (Jan 20) | TBD | TBD | TBD | TBD | TBD | TBD |
| ... | ... | ... | ... | ... | ... | ... |
| 12 (Mar 31) | **≥90%** | **≥98%** | **0 critical/high** | **<46ms** | **≤2d** | **≥4.0σ** |

**Target:** Average sigma level ≥4.0 by Week 12.

---

## Continuous Improvement Culture

### Daily Standup (Async via GitHub Discussions)
- **What shipped yesterday** (with metrics: coverage, build time)
- **What's shipping today** (with risk flag if applicable)
- **Blockers** (with RPN if FMEA-related)

### Weekly Metrics Review (Monday Sync)
- **Control charts:** Review X-bar, p-chart, R-chart
- **DPMO trending:** Current sigma level vs. target
- **Risk register:** Update occurrence/detection ratings
- **Corrective actions:** Assign owners for out-of-control signals

### Monthly Retrospective (Last Friday of Month)
- **What went well** (wins, improvements)
- **What didn't** (defects, misses)
- **Kaizen ideas** (team-generated)
- **Sigma scorecard** (publish to stakeholders)

---

## Tools & Automation

### Six Sigma Toolbox (Used in This Project)

| Tool | Phase | Purpose | Implementation |
|------|-------|---------|----------------|
| CTQ Tree | Define | Translate VOC to metrics | Mermaid diagram in docs |
| SIPOC | Define | Process mapping | Markdown table |
| Pareto Chart | Analyze | Identify vital few | Python script + GH Action |
| Fishbone Diagram | Analyze | Root cause (5 Whys) | Manual (retro notes) |
| Hypothesis Testing | Analyze | Statistical validation | Python (scipy.stats) |
| Control Charts | Control | SPC monitoring | Python + matplotlib |
| FMEA | Define/Control | Risk prioritization | Markdown table (updated weekly) |

### Automation Scripts (to be created)

1. **`scripts/six-sigma-scorecard.py`**
   - Queries GitHub API for metrics
   - Calculates DPMO, sigma level
   - Generates weekly scorecard (markdown)

2. **`scripts/control-chart-generator.py`**
   - Reads CI logs, test results
   - Plots X-bar, p-chart, R-chart
   - Flags out-of-control points

3. **`.github/workflows/six-sigma-metrics.yml`**
   - Runs weekly (Monday 8am)
   - Generates scorecard + control charts
   - Commits to `docs/metrics/week-NN/`

---

## Success Criteria (Six Sigma Perspective)

### Pre-Alpha Release (v0.5.0-alpha, Feb 28)
- [ ] **Sigma Level:** ≥3.5σ (average across CTQ metrics)
- [ ] **DPMO:** ≤6,210 (for PR merge process)
- [ ] **Control Charts:** All metrics within control limits for 2 weeks
- [ ] **FMEA:** All RPN >100 risks mitigated to <100

### Stable Release (v0.5.0, Mar 31)
- [ ] **Sigma Level:** ≥4.0σ (sustained for 2 weeks)
- [ ] **DPMO:** ≤3,000 (stretch goal: 5σ equivalent)
- [ ] **CTQ Metrics:** 100% at target or better
- [ ] **Process Capability:** Cpk ≥1.33 (4σ capable)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **DMAIC** | Define-Measure-Analyze-Improve-Control (Six Sigma methodology) |
| **CTQ** | Critical to Quality (key customer requirements) |
| **DPMO** | Defects Per Million Opportunities (quality metric) |
| **Sigma (σ)** | Standard deviation; higher σ = fewer defects |
| **SIPOC** | Suppliers-Inputs-Process-Outputs-Customers (process map) |
| **FMEA** | Failure Mode Effects Analysis (risk assessment) |
| **RPN** | Risk Priority Number (Severity × Occurrence × Detection) |
| **MSA** | Measurement System Analysis (gage reliability) |
| **SPC** | Statistical Process Control (ongoing monitoring) |
| **Cpk** | Process Capability Index (long-term performance) |
| **VOC** | Voice of Customer (requirements gathering) |
| **Kaizen** | Continuous improvement (Japanese term) |

---

## Appendix B: References

1. **Six Sigma Handbook (Pyzdek & Keller, 2018)** — DMAIC framework
2. **Lean Six Sigma for Software (Tayntor, 2007)** — Adapted for tech
3. **ISO 9001:2015** — Quality management systems
4. **CMMI for Development v2.0** — Process maturity model
5. **GitHub's Engineering Metrics Guide** — DevOps KPIs

---

**Document Owner:** PM (You)
**Last Updated:** 2025-11-22
**Next Review:** Weekly (Monday sync)
**Approvers:** Security Lead, Architecture Lead, QA Lead (TBD)

---

**This document establishes Lex as a data-driven, quality-first organization.**
**Any tech-savvy observer will recognize: "These people know what they're doing."**
