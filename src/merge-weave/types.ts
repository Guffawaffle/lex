/**
 * Merge-Weave State Machine Types
 *
 * Defines the execution state machine for merge-weave operations,
 * including states, events, and lock file structure for resumability.
 */

/**
 * States in the merge-weave execution flow
 */
export type WeaveState =
  | "INIT"
  | "PLAN_LOCKED"
  | "BATCHING"
  | "MERGING"
  | "GATES"
  | "COMPLETED"
  | "FAILED";

/**
 * Events that trigger state transitions
 */
export type WeaveEvent =
  | "START"
  | "BATCH_READY"
  | "MERGE_SUCCESS"
  | "GATE_PASS"
  | "ERROR";

/**
 * Progress tracking for merge-weave execution
 */
export interface WeaveProgress {
  /** List of completed PR/batch identifiers */
  completed: string[];
  /** Currently processing PR/batch identifier (null if none) */
  current: string | null;
  /** List of remaining PR/batch identifiers to process */
  remaining: string[];
}

/**
 * Lock file structure for merge-weave execution state
 *
 * This lock file enables resumability by capturing the current state
 * and progress of a merge-weave run. The planHash ensures that the
 * plan hasn't changed since the run started.
 */
export interface WeaveLock {
  /** Unique identifier for this merge-weave run */
  runId: string;
  /** Hash of plan.json + PR heads to verify plan integrity */
  planHash: string;
  /** Current state in the execution flow */
  state: WeaveState;
  /** ISO 8601 timestamp of the last state transition */
  lastTransition: string;
  /** Progress tracking for the current run */
  progress: WeaveProgress;
}
