-- ============================================================================
-- Lex Database Reference Schema
-- Version: 8 (as of 2.0.0)
--
-- This file documents the complete current schema for reference.
-- It is NOT executed — actual migrations are in src/memory/store/db.ts.
-- ============================================================================

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- FRAMES (V1, V2, V3, V4)
-- Core episodic memory records
-- ============================================================================

CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  branch TEXT NOT NULL,
  jira TEXT,
  module_scope TEXT NOT NULL,        -- JSON array of module IDs
  summary_caption TEXT NOT NULL,
  reference_point TEXT NOT NULL,
  status_snapshot TEXT NOT NULL,      -- JSON object
  keywords TEXT,                      -- JSON array
  atlas_frame_id TEXT,
  feature_flags TEXT,                 -- JSON array
  permissions TEXT,                   -- JSON array
  -- V3: Execution provenance
  run_id TEXT,
  plan_hash TEXT,
  spend TEXT,                         -- JSON object
  -- V4: OAuth2/JWT user isolation
  user_id TEXT,
  -- V4: Turn Cost and Capability Tier (Wave 2)
  turn_cost TEXT,                     -- JSON object (TurnCost)
  capability_tier TEXT CHECK (
    capability_tier IS NULL OR 
    capability_tier IN ('senior', 'mid', 'junior')
  ),
  task_complexity TEXT                -- JSON object (TaskComplexity)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
  reference_point,
  summary_caption,
  keywords,
  content='frames',
  content_rowid='rowid'
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN
  INSERT INTO frames_fts(rowid, reference_point, summary_caption, keywords)
  VALUES (new.rowid, new.reference_point, new.summary_caption, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames BEGIN
  DELETE FROM frames_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames BEGIN
  UPDATE frames_fts
  SET reference_point = new.reference_point,
      summary_caption = new.summary_caption,
      keywords = new.keywords
  WHERE rowid = new.rowid;
END;

-- Frame indexes
CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_frames_branch ON frames(branch);
CREATE INDEX IF NOT EXISTS idx_frames_jira ON frames(jira);
CREATE INDEX IF NOT EXISTS idx_frames_atlas_frame_id ON frames(atlas_frame_id);
CREATE INDEX IF NOT EXISTS idx_frames_user_id ON frames(user_id);
CREATE INDEX IF NOT EXISTS idx_frames_capability_tier ON frames(capability_tier) WHERE capability_tier IS NOT NULL;

-- ============================================================================
-- IMAGES (V2)
-- Binary attachments for frames
-- ============================================================================

CREATE TABLE IF NOT EXISTS images (
  image_id TEXT PRIMARY KEY,
  frame_id TEXT NOT NULL,
  data BLOB NOT NULL,
  mime_type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (frame_id) REFERENCES frames(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_images_frame_id ON images(frame_id);

-- ============================================================================
-- USERS + REFRESH_TOKENS (V4)
-- OAuth2/JWT authentication
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT,
  UNIQUE(provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- ============================================================================
-- CODE_UNITS (V5)
-- Code Atlas: discovered code symbols
-- ============================================================================

CREATE TABLE IF NOT EXISTS code_units (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  language TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('module', 'class', 'function', 'method')),
  symbol_path TEXT NOT NULL,
  name TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  tags TEXT,                          -- JSON array
  doc_comment TEXT,
  discovered_at TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'code-unit-v0',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_code_units_repo ON code_units(repo_id);
CREATE INDEX IF NOT EXISTS idx_code_units_file ON code_units(repo_id, file_path);
CREATE INDEX IF NOT EXISTS idx_code_units_kind ON code_units(repo_id, kind);
CREATE INDEX IF NOT EXISTS idx_code_units_symbol ON code_units(symbol_path);

-- ============================================================================
-- CODE_ATLAS_RUNS (V6)
-- Code Atlas: extraction run provenance
-- ============================================================================

CREATE TABLE IF NOT EXISTS code_atlas_runs (
  run_id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  files_requested TEXT NOT NULL,       -- JSON array
  files_scanned TEXT NOT NULL,         -- JSON array
  units_emitted INTEGER NOT NULL,
  max_files INTEGER,
  max_bytes INTEGER,
  truncated INTEGER NOT NULL DEFAULT 0,
  strategy TEXT CHECK (strategy IN ('static', 'llm-assisted', 'mixed')),
  created_at TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'code-atlas-run-v0'
);

CREATE INDEX IF NOT EXISTS idx_code_atlas_runs_repo ON code_atlas_runs(repo_id);
CREATE INDEX IF NOT EXISTS idx_code_atlas_runs_created ON code_atlas_runs(created_at);

-- ============================================================================
-- LEXSONA_BEHAVIOR_RULES (V7)
-- LexSona: behavioral memory rules with Bayesian confidence
-- ============================================================================

CREATE TABLE IF NOT EXISTS lexsona_behavior_rules (
  rule_id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  text TEXT NOT NULL,
  scope TEXT NOT NULL,                -- JSON object (RuleScope)
  alpha INTEGER NOT NULL DEFAULT 2,   -- Bayesian Beta: successes + prior
  beta INTEGER NOT NULL DEFAULT 5,    -- Bayesian Beta: failures + prior
  observation_count INTEGER NOT NULL DEFAULT 0,
  severity TEXT NOT NULL CHECK(severity IN ('must', 'should', 'style')) DEFAULT 'should',
  decay_tau INTEGER NOT NULL DEFAULT 180,  -- Decay time constant in days
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_observed TEXT NOT NULL DEFAULT (datetime('now')),
  frame_id TEXT                       -- Optional link to Frame for auditability
);

CREATE INDEX IF NOT EXISTS idx_lexsona_rules_module ON lexsona_behavior_rules(json_extract(scope, '$.module_id'));
CREATE INDEX IF NOT EXISTS idx_lexsona_rules_category ON lexsona_behavior_rules(category);
CREATE INDEX IF NOT EXISTS idx_lexsona_rules_observation_last ON lexsona_behavior_rules(observation_count, last_observed DESC);
CREATE INDEX IF NOT EXISTS idx_lexsona_rules_severity ON lexsona_behavior_rules(severity);
CREATE INDEX IF NOT EXISTS idx_lexsona_rules_frame_id ON lexsona_behavior_rules(frame_id) WHERE frame_id IS NOT NULL;

-- ============================================================================
-- OAUTH_STATES (created in auth/state-storage.ts)
-- OAuth2 PKCE flow state storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- ============================================================================
-- LEXSONA_BEHAVIOR_RULES (V7)
-- LexSona: Behavioral rules with Bayesian confidence scoring
-- @see docs/LEXSONA.md for architecture overview
-- @see docs/research/LexSona/MATH_FRAMEWORK_v0.1.md for mathematical framework
-- ============================================================================

CREATE TABLE IF NOT EXISTS lexsona_behavior_rules (
  rule_id TEXT PRIMARY KEY,
  context TEXT NOT NULL,                -- JSON object (module, task_type, etc.)
  correction TEXT NOT NULL,             -- The behavioral pattern/rule
  confidence_alpha REAL NOT NULL DEFAULT 1.0,   -- Beta distribution α
  confidence_beta REAL NOT NULL DEFAULT 1.0,    -- Beta distribution β
  observation_count INTEGER NOT NULL DEFAULT 0, -- N
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_observed TEXT NOT NULL,
  decay_tau INTEGER NOT NULL DEFAULT 180        -- Decay time constant (days)
);

CREATE INDEX IF NOT EXISTS idx_lexsona_context ON lexsona_behavior_rules(context);
CREATE INDEX IF NOT EXISTS idx_lexsona_updated ON lexsona_behavior_rules(updated_at);
