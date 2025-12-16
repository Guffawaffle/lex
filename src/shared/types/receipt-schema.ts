/**
 * Receipt Schema - Zod validation for Receipt structures
 *
 * Receipts provide audit trail and attribution for all task outcomes.
 * Per governance requirements, a receipt is emitted for EVERY task regardless of outcome.
 *
 * @module shared/types
 */

import { z } from "zod";

/**
 * Receipt status enum
 */
export const ReceiptStatusSchema = z.enum(["success", "failure", "partial", "blocked"]);

export type ReceiptStatus = z.infer<typeof ReceiptStatusSchema>;

/**
 * Executor type enum
 */
export const ExecutorTypeSchema = z.enum(["human", "agent", "tool"]);

export type ExecutorType = z.infer<typeof ExecutorTypeSchema>;

/**
 * Capability tier enum (matches Frame schema)
 */
export const CapabilityTierSchema = z.enum(["senior", "mid", "junior"]);

export type CapabilityTier = z.infer<typeof CapabilityTierSchema>;

/**
 * Executor information
 */
export const ExecutorSchema = z.object({
  /** Type of executor */
  type: ExecutorTypeSchema,

  /** Executor identifier */
  id: z.string().min(1, "executor.id is required"),

  /** Optional version information */
  version: z.string().optional(),
});

export type Executor = z.infer<typeof ExecutorSchema>;

/**
 * Task information
 */
export const TaskSchema = z.object({
  /** Task identifier */
  id: z.string().min(1, "task.id is required"),

  /** Human-readable task description */
  description: z.string().min(1, "task.description is required"),

  /** Optional capability tier classification */
  capabilityTier: CapabilityTierSchema.optional(),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Outcome information
 */
export const OutcomeSchema = z.object({
  /** Execution result (any type) */
  result: z.any().optional(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Blocking issues */
  blockers: z.array(z.string()).optional(),

  /** Artifact references (file paths, URLs, etc.) */
  artifacts: z.array(z.string()).optional(),
});

export type Outcome = z.infer<typeof OutcomeSchema>;

/**
 * Metadata information
 */
export const MetadataSchema = z.object({
  /** Execution duration in milliseconds */
  durationMs: z.number().int().nonnegative().optional(),

  /** Number of retry attempts */
  retryCount: z.number().int().nonnegative().optional(),

  /** Whether task was escalated to higher capability tier */
  escalated: z.boolean().optional(),
});

export type Metadata = z.infer<typeof MetadataSchema>;

/**
 * Receipt schema - audit trail for task execution
 *
 * @example
 * ```json
 * {
 *   "id": "550e8400-e29b-41d4-a716-446655440000",
 *   "frameId": "f-550e8400-e29b-41d4-a716-446655440001",
 *   "timestamp": "2025-12-16T06:00:00Z",
 *   "executor": {
 *     "type": "agent",
 *     "id": "copilot-senior-dev",
 *     "version": "1.0.0"
 *   },
 *   "task": {
 *     "id": "PR-554",
 *     "description": "Add capability tier classification",
 *     "capabilityTier": "mid"
 *   },
 *   "status": "success",
 *   "outcome": {
 *     "artifacts": ["src/shared/types/frame-schema.ts"]
 *   },
 *   "metadata": {
 *     "durationMs": 45000,
 *     "retryCount": 0
 *   }
 * }
 * ```
 */
export const ReceiptSchema = z.object({
  /** Unique receipt identifier (UUID) */
  id: z.string().uuid("id must be a valid UUID"),

  /** Optional link back to Frame */
  frameId: z.string().uuid("frameId must be a valid UUID").optional(),

  /** ISO 8601 timestamp */
  timestamp: z.string().datetime({ message: "timestamp must be ISO 8601 format" }),

  /** Executor information */
  executor: ExecutorSchema,

  /** Task information */
  task: TaskSchema,

  /** Execution status */
  status: ReceiptStatusSchema,

  /** Execution outcome */
  outcome: OutcomeSchema,

  /** Optional metadata */
  metadata: MetadataSchema.optional(),
});

export type Receipt = z.infer<typeof ReceiptSchema>;

/**
 * Validate a Receipt using Zod schema
 *
 * @param value - Unknown value to validate
 * @returns true if valid Receipt, false otherwise
 */
export function isReceipt(value: unknown): value is Receipt {
  return ReceiptSchema.safeParse(value).success;
}

/**
 * Parse and validate a Receipt, throwing on error
 *
 * @param value - Unknown value to parse
 * @returns Validated Receipt
 * @throws ZodError if validation fails
 */
export function parseReceipt(value: unknown): Receipt {
  return ReceiptSchema.parse(value);
}

/**
 * Parse a Receipt safely, returning result object
 *
 * @param value - Unknown value to parse
 * @returns SafeParseResult with success/data or error
 */
export function safeParseReceipt(value: unknown) {
  return ReceiptSchema.safeParse(value);
}

/**
 * Create a minimal valid Receipt
 *
 * @param params - Required receipt parameters
 * @returns Validated Receipt
 *
 * @example
 * ```typescript
 * const receipt = createReceipt({
 *   executor: { type: 'agent', id: 'copilot-1' },
 *   task: { id: 'task-1', description: 'Implement feature' },
 *   status: 'success'
 * });
 * ```
 */
export function createReceipt(params: {
  executor: Executor;
  task: Task;
  status: ReceiptStatus;
  outcome?: Outcome;
  frameId?: string;
  metadata?: Metadata;
}): Receipt {
  return ReceiptSchema.parse({
    id: crypto.randomUUID(),
    frameId: params.frameId,
    timestamp: new Date().toISOString(),
    executor: params.executor,
    task: params.task,
    status: params.status,
    outcome: params.outcome ?? {},
    metadata: params.metadata,
  });
}
