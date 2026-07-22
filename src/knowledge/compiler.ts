import { createHash } from "node:crypto";
import { posix } from "node:path";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import type { RootContent } from "mdast";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  KNOWLEDGE_COMPILER_VERSION,
  KNOWLEDGE_FRAME_SCHEMA_VERSION,
  KnowledgeConfidenceSchema,
  KnowledgeFrameIdSchema,
  KnowledgeFrameLifecycleSchema,
  KnowledgeFrameTypeSchema,
  KnowledgeFrameV1Schema,
  KnowledgeFrameVisibilitySchema,
  KnowledgeRelationSchema,
  type KnowledgeFrameV1,
} from "./types.js";

const MAX_RECORDS_PER_SNAPSHOT = 1_000;

const MarkerSchema = z
  .object({
    id: KnowledgeFrameIdSchema,
    type: KnowledgeFrameTypeSchema,
    lifecycle: KnowledgeFrameLifecycleSchema,
    confidence: KnowledgeConfidenceSchema.optional(),
    visibility: KnowledgeFrameVisibilitySchema.default("workspace"),
    relations: z.array(KnowledgeRelationSchema).max(100).default([]),
  })
  .strict()
  .superRefine((marker, context) => {
    if (marker.type === "hypothesis" && marker.confidence === undefined) {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: "is required for hypotheses",
      });
    }
    if (marker.type !== "hypothesis" && marker.confidence !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["confidence"],
        message: `is not valid for ${marker.type} records`,
      });
    }
  });

export interface KnowledgeSourceInput {
  readonly path: string;
  readonly content: string;
  readonly sourceLayer: "commit" | "working-tree";
  readonly commitSha: string;
  readonly baseCommitSha?: string;
  readonly branch?: string;
}

export interface CompileKnowledgeSnapshotInput {
  readonly repositoryKey: string;
  readonly sources: readonly KnowledgeSourceInput[];
  readonly compilerVersion?: string;
}

export interface CompiledKnowledgeSnapshotV1 {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly repositoryKey: string;
  readonly compilerVersion: string;
  readonly sourceFingerprint: string;
  readonly records: readonly KnowledgeFrameV1[];
}

export class KnowledgeCompileError extends Error {
  constructor(
    message: string,
    public readonly sourcePath?: string,
    public readonly line?: number
  ) {
    super(message);
    this.name = "KnowledgeCompileError";
  }
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function normalizeSourcePath(value: string): string {
  const normalized = posix.normalize(value.replaceAll("\\", "/"));
  if (
    normalized === "." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    /^[a-z]:\//i.test(normalized) ||
    /[*?\[\]{}!]/.test(normalized) ||
    !/\.md$/i.test(normalized)
  ) {
    throw new KnowledgeCompileError(
      `Knowledge source must be an exact repo-relative Markdown path: ${value}`
    );
  }
  return normalized;
}

function byteOffset(content: string, characterOffset: number): number {
  return Buffer.byteLength(content.slice(0, characterOffset), "utf8");
}

function markerBody(value: string): string | null {
  const match = /^<!--[ \t]*lex:frame(?:\r?\n|[ \t]+)([\s\S]*?)[ \t]*-->$/.exec(value.trim());
  return match?.[1]?.trim() ?? null;
}

function isEndMarker(value: string): boolean {
  return /^<!--[ \t]*lex:end[ \t]*-->$/.test(value.trim());
}

function extractTitle(nodes: readonly RootContent[]): string {
  const heading = nodes.find((node) => node.type === "heading");
  if (!heading) {
    throw new KnowledgeCompileError("Knowledge block must contain a Markdown heading");
  }
  return toString(heading).trim();
}

export function compileKnowledgeSnapshot(
  input: CompileKnowledgeSnapshotInput
): CompiledKnowledgeSnapshotV1 {
  if (!input.repositoryKey.trim()) throw new KnowledgeCompileError("repositoryKey is required");

  const sources = input.sources
    .map((source) => ({ ...source, path: normalizeSourcePath(source.path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(sources.map((source) => source.path)).size !== sources.length) {
    throw new KnowledgeCompileError("Knowledge sources contain duplicate paths");
  }

  const compilerVersion = input.compilerVersion ?? KNOWLEDGE_COMPILER_VERSION;
  const sourceDescriptors = sources.map((source) => ({
    path: source.path,
    sourceDigest: digest(source.content),
    sourceLayer: source.sourceLayer,
    commitSha: source.commitSha,
    baseCommitSha: source.baseCommitSha,
    branch: source.branch,
  }));
  const sourceFingerprint = digest(canonicalJson(sourceDescriptors));
  const snapshotId = digest(
    canonicalJson({ repositoryKey: input.repositoryKey, compilerVersion, sourceFingerprint })
  );

  const records: KnowledgeFrameV1[] = [];
  for (const source of sources) {
    const tree = fromMarkdown(source.content);
    const nodes = tree.children;
    let open:
      | {
          metadata: z.infer<typeof MarkerSchema>;
          nodeIndex: number;
          startOffset: number;
          startLine: number;
        }
      | undefined;

    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.type !== "html") continue;
      const body = markerBody(node.value);
      if (body !== null) {
        if (open) {
          throw new KnowledgeCompileError(
            "Nested lex:frame marker",
            source.path,
            node.position?.start.line
          );
        }
        let rawMetadata: unknown;
        try {
          rawMetadata = parseYaml(body);
        } catch (error) {
          throw new KnowledgeCompileError(
            `Invalid lex:frame YAML: ${error instanceof Error ? error.message : String(error)}`,
            source.path,
            node.position?.start.line
          );
        }
        const parsed = MarkerSchema.safeParse(rawMetadata);
        if (!parsed.success) {
          throw new KnowledgeCompileError(
            `Invalid lex:frame metadata: ${parsed.error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`,
            source.path,
            node.position?.start.line
          );
        }
        open = {
          metadata: parsed.data,
          nodeIndex: index,
          startOffset: node.position?.end.offset ?? 0,
          startLine: node.position?.start.line ?? 1,
        };
        continue;
      }

      if (!isEndMarker(node.value)) continue;
      if (!open) {
        throw new KnowledgeCompileError(
          "lex:end marker has no matching lex:frame",
          source.path,
          node.position?.start.line
        );
      }
      const endOffset = node.position?.start.offset ?? source.content.length;
      const blockNodes = nodes.slice(open.nodeIndex + 1, index);
      const title = extractTitle(blockNodes);
      const blockBody = source.content.slice(open.startOffset, endOffset).trim();
      const sourceDigest = digest(source.content);
      const base = {
        schemaVersion: KNOWLEDGE_FRAME_SCHEMA_VERSION,
        id: open.metadata.id,
        type: open.metadata.type,
        lifecycle: open.metadata.lifecycle,
        visibility: open.metadata.visibility,
        title,
        body: blockBody,
        relations: open.metadata.relations,
        provenance: {
          repositoryKey: input.repositoryKey,
          path: source.path,
          anchor: open.metadata.id,
          startLine: open.startLine,
          endLine: node.position?.end.line ?? open.startLine,
          startByte: byteOffset(source.content, open.startOffset),
          endByte: byteOffset(source.content, endOffset),
          sourceDigest,
          sourceLayer: source.sourceLayer,
          commitSha: source.commitSha,
          ...(source.baseCommitSha ? { baseCommitSha: source.baseCommitSha } : {}),
          ...(source.branch ? { branch: source.branch } : {}),
          compilerVersion,
          snapshotId,
        },
        ...(open.metadata.confidence ? { confidence: open.metadata.confidence } : {}),
      };
      const record = KnowledgeFrameV1Schema.parse({
        ...base,
        recordDigest: digest(canonicalJson(base)),
      });
      records.push(record);
      if (records.length > MAX_RECORDS_PER_SNAPSHOT) {
        throw new KnowledgeCompileError(
          `Knowledge snapshot exceeds ${MAX_RECORDS_PER_SNAPSHOT} records`
        );
      }
      open = undefined;
    }

    if (open) {
      throw new KnowledgeCompileError(
        "lex:frame marker has no matching lex:end",
        source.path,
        open.startLine
      );
    }
  }

  records.sort((left, right) => left.id.localeCompare(right.id));
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new KnowledgeCompileError(`Duplicate KnowledgeFrame ID: ${record.id}`);
    }
    ids.add(record.id);
  }
  for (const record of records) {
    for (const relation of record.relations) {
      if (!ids.has(relation.target)) {
        throw new KnowledgeCompileError(
          `KnowledgeFrame ${record.id} relation ${relation.type} targets missing ID ${relation.target}`,
          record.provenance.path,
          record.provenance.startLine
        );
      }
    }
  }

  return {
    schemaVersion: KNOWLEDGE_FRAME_SCHEMA_VERSION,
    snapshotId,
    repositoryKey: input.repositoryKey,
    compilerVersion,
    sourceFingerprint,
    records,
  };
}
