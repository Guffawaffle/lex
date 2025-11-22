-- LexSona Behavioral Rules - Reference SQL Schema
-- Canonical CptPlnt version 1.0
-- Author: Joseph M. Gustavson (ORCID: 0009-0001-0669-0749)
-- AI Collaborators: OpenAI GPT-5.1 Thinking ("Lex"/"Eve"), Claude Sonnet 4.5 ("Adam")

-- ============================================================================
-- persona_rules: Core behavioral rule storage
-- ============================================================================

CREATE TABLE persona_rules (
  -- Identity
  rule_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  rule_text TEXT NOT NULL,

  -- Scope (all nullable for partial matching)
  environment TEXT,
  project TEXT,
  agent_family TEXT,
  context_tags TEXT, -- JSON array: ["php", "cli", "security"]

  -- Bayesian Beta confidence model
  -- Prior: Beta(alpha_0=2, beta_0=5) — skeptical, requires evidence
  alpha INTEGER NOT NULL DEFAULT 2,
  beta INTEGER NOT NULL DEFAULT 5,

  -- Derived confidence: alpha / (alpha + beta)
  -- Recomputed with recency weighting at query time
  confidence REAL GENERATED ALWAYS AS (
    CAST(alpha AS REAL) / (alpha + beta)
  ) STORED,

  -- Metadata
  severity TEXT NOT NULL CHECK(severity IN ('must', 'should', 'style')),
  reinforcements INTEGER NOT NULL DEFAULT 0,
  counter_examples INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  first_seen TIMESTAMP NOT NULL,
  last_correction TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Optional: Link to Lex Frame for auditability
  -- Required in Lex ecosystem, NULL in standalone deployments
  frame_id TEXT
);

-- ============================================================================
-- Indexes for query performance
-- ============================================================================

-- Scope-based filtering
CREATE INDEX idx_persona_rules_environment ON persona_rules(environment)
  WHERE environment IS NOT NULL;

CREATE INDEX idx_persona_rules_project ON persona_rules(project)
  WHERE project IS NOT NULL;

CREATE INDEX idx_persona_rules_agent_family ON persona_rules(agent_family)
  WHERE agent_family IS NOT NULL;

-- Confidence + recency filtering (for active rule queries)
CREATE INDEX idx_persona_rules_confidence_last ON persona_rules(confidence, last_correction DESC);

-- Category-based grouping (for UI/reporting)
CREATE INDEX idx_persona_rules_category ON persona_rules(category);

-- Frame linkage (if using Lex ecosystem)
CREATE INDEX idx_persona_rules_frame_id ON persona_rules(frame_id)
  WHERE frame_id IS NOT NULL;

-- ============================================================================
-- persona_events: Correction event log
-- ============================================================================

CREATE TABLE persona_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('reinforcement', 'counterexample')),

  -- Context
  scope_environment TEXT,
  scope_project TEXT,
  scope_agent_family TEXT,
  scope_context_tags TEXT, -- JSON array

  -- User input
  user_text TEXT NOT NULL,
  agent_output TEXT, -- Snippet that was corrected

  -- Provenance
  frame_id TEXT, -- Link to Lex Frame (optional)
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rule_id) REFERENCES persona_rules(rule_id) ON DELETE CASCADE
);

CREATE INDEX idx_persona_events_rule_id ON persona_events(rule_id);
CREATE INDEX idx_persona_events_timestamp ON persona_events(timestamp DESC);
CREATE INDEX idx_persona_events_frame_id ON persona_events(frame_id)
  WHERE frame_id IS NOT NULL;

-- ============================================================================
-- persona_embeddings: Cached sentence transformer embeddings
-- ============================================================================

CREATE TABLE persona_embeddings (
  rule_id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL, -- e.g., "sentence-transformers/all-MiniLM-L6-v2"
  embedding BLOB NOT NULL, -- Binary representation of float32 vector
  dimension INTEGER NOT NULL, -- e.g., 384 for all-MiniLM-L6-v2
  computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rule_id) REFERENCES persona_rules(rule_id) ON DELETE CASCADE
);

CREATE INDEX idx_persona_embeddings_model ON persona_embeddings(model_name);

-- ============================================================================
-- Triggers: Maintain updated_at timestamp
-- ============================================================================

CREATE TRIGGER persona_rules_update_timestamp
AFTER UPDATE ON persona_rules
FOR EACH ROW
BEGIN
  UPDATE persona_rules
  SET updated_at = CURRENT_TIMESTAMP
  WHERE rule_id = NEW.rule_id;
END;

-- ============================================================================
-- Configuration: Activation thresholds
-- ============================================================================

CREATE TABLE persona_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default hyperparameters (canonical CptPlnt values)
INSERT INTO persona_config (key, value, description) VALUES
  ('N_min_default', '5', 'Minimum sample size for rule activation (alpha + beta >= N_min)'),
  ('C_min_default', '0.7', 'Minimum confidence for rule activation'),
  ('tau_recency', '180', 'Time constant for recency decay (days)'),
  ('threshold_auto_match', '0.85', 'Cosine similarity threshold for auto-matching corrections to rules'),
  ('threshold_confirmation', '0.70', 'Lower bound for confirmation-required range'),
  ('dormancy_weak_months', '12', 'Flag rules as stale if last_correction older than this (months)'),
  ('dormancy_full_months', '24', 'Mark rules as dormant if last_correction older than this (months)');

-- Category-specific overrides
INSERT INTO persona_config (key, value, description) VALUES
  ('N_min_security', '10', 'Minimum samples for security-related behavioral rules'),
  ('C_min_security', '0.8', 'Minimum confidence for security-related behavioral rules'),
  ('N_min_style', '3', 'Minimum samples for style/tooling preferences'),
  ('C_min_style', '0.6', 'Minimum confidence for style/tooling preferences');

-- ============================================================================
-- Example Queries
-- ============================================================================

-- Get active rules for a given scope and confidence threshold
-- (Application code applies recency weighting: confidence * exp(-days/tau))

-- Example: Get active rules for AWA lex-core project
/*
SELECT
  rule_id,
  category,
  rule_text,
  severity,
  alpha,
  beta,
  confidence AS base_confidence,
  last_correction,
  julianday('now') - julianday(last_correction) AS days_since_last
FROM persona_rules
WHERE (environment IS NULL OR environment = 'awa')
  AND (project IS NULL OR project = 'lex-core')
  AND (agent_family IS NULL OR agent_family = 'claude')
  AND alpha + beta >= 5
  AND confidence >= 0.7
ORDER BY
  -- Scope specificity (more fields set = higher priority)
  (CASE WHEN environment IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN project IS NOT NULL THEN 2 ELSE 0 END +
   CASE WHEN agent_family IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN context_tags IS NOT NULL THEN 0.5 ELSE 0 END) DESC,
  -- Severity
  CASE severity WHEN 'must' THEN 3 WHEN 'should' THEN 2 ELSE 1 END DESC,
  -- Recency
  last_correction DESC,
  -- Confidence
  confidence DESC;
*/
