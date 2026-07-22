import { z } from "zod";

export const KNOWLEDGE_FRAME_SCHEMA_VERSION = 1 as const;
export const KNOWLEDGE_COMPILER_VERSION = "1.0.0" as const;

export const KnowledgeFrameTypeSchema = z.enum(["hypothesis", "evidence", "seam", "probe"]);
export const KnowledgeFrameLifecycleSchema = z.enum(["draft", "active", "retired"]);
export const KnowledgeFrameVisibilitySchema = z.literal("workspace");
export const KnowledgeConfidenceSchema = z.enum(["low", "medium", "high"]);

export const KnowledgeFrameIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._/-]*$/, "must be a stable lowercase logical ID");

export const KnowledgeRelationSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/),
    target: KnowledgeFrameIdSchema,
  })
  .strict();

export const KnowledgeProvenanceSchema = z
  .object({
    repositoryKey: z.string().min(1).max(200),
    path: z.string().min(1).max(512),
    anchor: KnowledgeFrameIdSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    startByte: z.number().int().nonnegative(),
    endByte: z.number().int().nonnegative(),
    sourceDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sourceLayer: z.enum(["commit", "working-tree"]),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    baseCommitSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    branch: z.string().min(1).max(255).optional(),
    compilerVersion: z.string().min(1),
    snapshotId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

const CommonKnowledgeFrameSchema = z.object({
  schemaVersion: z.literal(KNOWLEDGE_FRAME_SCHEMA_VERSION),
  id: KnowledgeFrameIdSchema,
  lifecycle: KnowledgeFrameLifecycleSchema,
  visibility: KnowledgeFrameVisibilitySchema,
  title: z.string().min(1).max(300),
  body: z.string().min(1).max(65_536),
  relations: z.array(KnowledgeRelationSchema).max(100),
  provenance: KnowledgeProvenanceSchema,
  recordDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

const HypothesisKnowledgeFrameSchema = CommonKnowledgeFrameSchema.extend({
  type: z.literal("hypothesis"),
  confidence: KnowledgeConfidenceSchema,
}).strict();

const NonHypothesisKnowledgeFrameSchema = (type: "evidence" | "seam" | "probe") =>
  CommonKnowledgeFrameSchema.extend({ type: z.literal(type) }).strict();

export const KnowledgeFrameV1Schema = z.discriminatedUnion("type", [
  HypothesisKnowledgeFrameSchema,
  NonHypothesisKnowledgeFrameSchema("evidence"),
  NonHypothesisKnowledgeFrameSchema("seam"),
  NonHypothesisKnowledgeFrameSchema("probe"),
]);

export type KnowledgeFrameType = z.infer<typeof KnowledgeFrameTypeSchema>;
export type KnowledgeFrameV1 = z.infer<typeof KnowledgeFrameV1Schema>;
export type KnowledgeRelation = z.infer<typeof KnowledgeRelationSchema>;
export type KnowledgeProvenance = z.infer<typeof KnowledgeProvenanceSchema>;
