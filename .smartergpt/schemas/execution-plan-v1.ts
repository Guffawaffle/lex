import { z } from "zod";

/**
 * Execution Plan v1 Schema
 * Corresponds to execution-plan-v1.json
 */

const SourceSpecSchema = z
  .object({
    schemaVersion: z.string(),
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()).optional(),
    technicalContext: z.string().optional(),
    repo: z.string(),
    createdAt: z.string().datetime().optional(),
  })
  .strict();

const EpicSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()).optional(),
  })
  .strict();

const SubIssueSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    type: z.enum(["feature", "testing", "docs", "refactor", "bug"]),
    acceptanceCriteria: z.array(z.string()).optional(),
    dependsOn: z.array(z.string()),
  })
  .strict();

export const ExecutionPlanV1Schema = z
  .object({
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    sourceSpec: SourceSpecSchema,
    epic: EpicSchema,
    subIssues: z.array(SubIssueSchema),
    createdAt: z.string().datetime().optional(),
  })
  .strict();

export type ExecutionPlanV1 = z.infer<typeof ExecutionPlanV1Schema>;
export type SourceSpec = z.infer<typeof SourceSpecSchema>;
export type Epic = z.infer<typeof EpicSchema>;
export type SubIssue = z.infer<typeof SubIssueSchema>;
