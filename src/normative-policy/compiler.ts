import { z } from "zod";

import { canonicalizeJson, compareUtf16CodeUnits } from "./canonical-json.js";
import {
  computePolicyDeclarationDigestV1,
  computePolicySemanticDigestV1,
  computePolicySourceContentDigestV1,
} from "./canonical.js";
import { POLICY_JSON_MAX_BYTES_V1, PolicyJsonError, readPolicyJson } from "./raw-json.js";
import {
  NORMATIVE_POLICY_CONTRACT_VERSION,
  POLICY_CANONICALIZATION_VERSION_V1,
  PolicyDeclarationDigestV1Schema,
  PolicyDeclarationSourceEvidenceV1Schema,
  PolicyDeclarationV1Schema,
  PolicyLogicalIdV1Schema,
  PolicyRuleTargetV1Schema,
  PolicySourceLocatorV1Schema,
  type PolicyDeclarationDigestV1,
  type PolicyDeclarationSourceEvidenceV1,
  type PolicyDeclarationV1,
  type PolicyLogicalIdV1,
  type PolicyRuleTargetV1,
} from "./types.js";

export { POLICY_JSON_MAX_BYTES_V1, POLICY_JSON_MAX_DEPTH_V1 } from "./raw-json.js";
export const POLICY_COMPILER_VERSION_V1 = "lex:normative-policy:compiler:v1" as const;
export const POLICY_RAW_PARSER_PROFILES_V1 = Object.freeze(["json-utf8-v1"] as const);

export const POLICY_COMPILER_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "invalid_source_bytes",
  "source_too_large",
  "invalid_utf8",
  "invalid_json",
  "duplicate_json_key",
  "source_too_deep",
  "invalid_source_locator",
  "invalid_compilation_input",
  "invalid_declaration",
  "invalid_source_evidence",
  "source_declaration_digest_mismatch",
  "duplicate_rule_id",
  "duplicate_declaration",
  "declaration_revision_conflict",
  "missing_target",
  "self_relation",
  "multiple_relation_types",
  "target_digest_mismatch",
  "relation_cycle",
] as const);

type Immutable<T> = T extends string | number | boolean | null | undefined
  ? T
  : { readonly [K in keyof T]: Immutable<T[K]> };

function freeze<T>(value: T): Immutable<T> {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as Immutable<T>;
}

// Preflight before Zod reads members: reject getters, proxies, symbols, exotic
// objects and non-JSON values using the existing strict canonicalizer.
const jsonInput = z.unknown().superRefine((value, context) => {
  try {
    canonicalizeJson(value);
  } catch {
    context.addIssue({ code: "custom", message: "Expected inert canonicalizable JSON data" });
  }
});

const diagnosticShape = z
  .object({
    code: z.enum(POLICY_COMPILER_DIAGNOSTIC_CODES_V1),
    inputIndex: z.number().int().nonnegative().safe().nullable(),
    ruleId: PolicyLogicalIdV1Schema.nullable(),
    target: PolicyRuleTargetV1Schema.nullable(),
    offset: z.number().int().nonnegative().safe().nullable(),
  })
  .strict();

export type PolicyCompilerDiagnosticV1 = Immutable<{
  code: (typeof POLICY_COMPILER_DIAGNOSTIC_CODES_V1)[number];
  inputIndex: number | null;
  ruleId: PolicyLogicalIdV1 | null;
  target: PolicyRuleTargetV1 | null;
  offset: number | null;
}>;
export const PolicyCompilerDiagnosticV1Schema: z.ZodType<PolicyCompilerDiagnosticV1> = jsonInput
  .pipe(diagnosticShape)
  .transform(freeze);

function diagnostic(
  code: PolicyCompilerDiagnosticV1["code"],
  inputIndex: number | null = null,
  ruleId: PolicyCompilerDiagnosticV1["ruleId"] = null,
  target: PolicyRuleTargetV1 | null = null,
  offset: number | null = null
): PolicyCompilerDiagnosticV1 {
  return { code, inputIndex, ruleId, target, offset };
}

function orderedDiagnostics(
  values: readonly PolicyCompilerDiagnosticV1[]
): readonly PolicyCompilerDiagnosticV1[] {
  const unique = new Map(values.map((value) => [canonicalizeJson(value), value]));
  return freeze(
    [...unique].sort(([a], [b]) => compareUtf16CodeUnits(a, b)).map(([, value]) => value)
  );
}

export type PolicyCompilationInputV1 = Immutable<{
  declaration: PolicyDeclarationV1;
  sourceEvidence: PolicyDeclarationSourceEvidenceV1 | null;
}>;
export const PolicyCompilationInputV1Schema: z.ZodType<PolicyCompilationInputV1> = jsonInput
  .pipe(
    z
      .object({
        declaration: PolicyDeclarationV1Schema,
        sourceEvidence: PolicyDeclarationSourceEvidenceV1Schema.nullable(),
      })
      .strict()
  )
  .transform(freeze);

export type PolicyDeclarationParseResultV1 =
  | {
      readonly ok: true;
      readonly input: PolicyCompilationInputV1;
      readonly diagnostics: readonly [];
      readonly authorizesExecution: false;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly PolicyCompilerDiagnosticV1[];
      readonly authorizesExecution: false;
    };

function failure(values: readonly PolicyCompilerDiagnosticV1[]) {
  return freeze({
    ok: false as const,
    diagnostics: orderedDiagnostics(values),
    authorizesExecution: false as const,
  });
}

function validateDeclaration(value: unknown, index: number | null) {
  // Duplicate rule identities get a stable dedicated code, independent of Zod messages.
  const json = jsonInput.safeParse(value);
  if (
    json.success &&
    value !== null &&
    typeof value === "object" &&
    "rules" in value &&
    Array.isArray(value.rules)
  ) {
    const identities = new Set<string>();
    for (const rule of value.rules as unknown[]) {
      const id = PolicyLogicalIdV1Schema.safeParse(
        rule !== null && typeof rule === "object" && "ruleId" in rule ? rule.ruleId : undefined
      );
      if (!id.success) continue;
      if (identities.has(id.data))
        return { error: diagnostic("duplicate_rule_id", index, id.data) };
      identities.add(id.data);
    }
  }
  const result = PolicyDeclarationV1Schema.safeParse(value);
  return result.success
    ? { declaration: result.data }
    : { error: diagnostic("invalid_declaration", index) };
}

/** Parse JSON bytes and construct untrusted attribution evidence outside the declaration. */
export function parsePolicyDeclarationJsonV1(
  rawSource: Uint8Array,
  source: unknown
): PolicyDeclarationParseResultV1 {
  let value: unknown;
  let bytes: Uint8Array;
  try {
    if (!(rawSource instanceof Uint8Array)) throw new PolicyJsonError("invalid_source_bytes");
    if (rawSource.byteLength > POLICY_JSON_MAX_BYTES_V1)
      throw new PolicyJsonError("source_too_large");
    bytes = Uint8Array.from(rawSource);
    value = readPolicyJson(bytes);
  } catch (error) {
    if (!(error instanceof PolicyJsonError)) throw error;
    return failure([diagnostic(error.code, null, null, null, error.offset)]);
  }
  const locator = PolicySourceLocatorV1Schema.safeParse(source);
  if (!locator.success) return failure([diagnostic("invalid_source_locator")]);
  const validated = validateDeclaration(value, null);
  if (!validated.declaration) return failure([validated.error!]);
  const declaration = validated.declaration;
  return freeze({
    ok: true,
    input: {
      declaration,
      sourceEvidence: {
        schemaVersion: NORMATIVE_POLICY_CONTRACT_VERSION,
        source: locator.data,
        sourceContentDigest: computePolicySourceContentDigestV1(bytes),
        declarationDigest: computePolicyDeclarationDigestV1(declaration),
        authorizesExecution: false,
      },
    },
    diagnostics: [],
    authorizesExecution: false,
  });
}

const compiledDeclarationShape = z
  .object({
    declaration: PolicyDeclarationV1Schema,
    declarationDigest: PolicyDeclarationDigestV1Schema,
    sourceEvidence: PolicyDeclarationSourceEvidenceV1Schema.nullable(),
  })
  .strict();
type CompiledDeclaration = {
  declaration: PolicyDeclarationV1;
  declarationDigest: PolicyDeclarationDigestV1;
  sourceEvidence: PolicyDeclarationSourceEvidenceV1 | null;
};

const declarationKey = (id: string, revision: number): string => canonicalizeJson([id, revision]);
const ruleKey = (id: string, revision: number, ruleId: string): string =>
  canonicalizeJson([id, revision, ruleId]);

/** Structural relation validity only: no suppression, applicability, or authority decisions. */
function graphDiagnostics(entries: readonly CompiledDeclaration[]): PolicyCompilerDiagnosticV1[] {
  const diagnostics: PolicyCompilerDiagnosticV1[] = [];
  const declarations = new Map<string, CompiledDeclaration>();
  const rules = new Map<string, { rule: PolicyDeclarationV1["rules"][number]; index: number }>();
  entries.forEach((entry, index) => {
    const { declaration } = entry;
    const key = declarationKey(declaration.declarationId, declaration.revision);
    const previous = declarations.get(key);
    if (previous) {
      diagnostics.push(
        diagnostic(
          previous.declarationDigest === entry.declarationDigest
            ? "duplicate_declaration"
            : "declaration_revision_conflict",
          index
        )
      );
    } else {
      declarations.set(key, entry);
    }
    for (const rule of declaration.rules)
      rules.set(ruleKey(declaration.declarationId, declaration.revision, rule.ruleId), {
        rule,
        index,
      });
  });
  // Ambiguous identities cannot produce a well-defined relation graph.
  if (diagnostics.length) return diagnostics;
  const edges = new Map<string, Set<string>>();
  const incoming = new Map([...rules.keys()].map((key) => [key, 0]));
  for (const [key, { rule, index }] of rules) {
    const targets = new Set<string>();
    const types = new Map<string, string>();
    for (const relation of rule.relations) {
      const target = relation.target;
      const targetKey = ruleKey(target.declarationId, target.declarationRevision, target.ruleId);
      const previousType = types.get(targetKey);
      if (previousType && previousType !== relation.type)
        diagnostics.push(diagnostic("multiple_relation_types", index, rule.ruleId, target));
      types.set(targetKey, relation.type);
      if (key === targetKey)
        diagnostics.push(diagnostic("self_relation", index, rule.ruleId, target));
      const resolved = rules.get(targetKey);
      if (!resolved) {
        diagnostics.push(diagnostic("missing_target", index, rule.ruleId, target));
        continue;
      }
      if (computePolicySemanticDigestV1(resolved.rule) !== target.expectedSemanticDigest)
        diagnostics.push(diagnostic("target_digest_mismatch", index, rule.ruleId, target));
      targets.add(targetKey);
    }
    edges.set(key, targets);
    for (const target of targets) incoming.set(target, incoming.get(target)! + 1);
  }
  // Iterative Kahn traversal detects every cycle (including mixed relation types)
  // without recursion or inventing a transitive precedence order.
  const ready = [...incoming].filter(([, count]) => count === 0).map(([key]) => key);
  let visited = 0;
  for (let cursor = 0; cursor < ready.length; cursor++) {
    const key = ready[cursor];
    visited++;
    for (const target of edges.get(key)!) {
      const count = incoming.get(target)! - 1;
      incoming.set(target, count);
      if (count === 0) ready.push(target);
    }
  }
  if (visited !== rules.size) diagnostics.push(diagnostic("relation_cycle"));
  return diagnostics;
}

const versions = {
  schemaVersion: z.literal(NORMATIVE_POLICY_CONTRACT_VERSION),
  canonicalizationVersion: z.literal(POLICY_CANONICALIZATION_VERSION_V1),
  compilerVersion: z.literal(POLICY_COMPILER_VERSION_V1),
};

export type CompiledPolicyV1 = Immutable<{
  schemaVersion: typeof NORMATIVE_POLICY_CONTRACT_VERSION;
  canonicalizationVersion: typeof POLICY_CANONICALIZATION_VERSION_V1;
  compilerVersion: typeof POLICY_COMPILER_VERSION_V1;
  declarations: CompiledDeclaration[];
  authorizesExecution: false;
}>;
export const CompiledPolicyV1Schema: z.ZodType<CompiledPolicyV1> = jsonInput
  .pipe(
    z
      .object({
        ...versions,
        declarations: z.array(compiledDeclarationShape),
        authorizesExecution: z.literal(false),
      })
      .strict()
  )
  .superRefine((compiled, context) => {
    for (const entry of compiled.declarations) {
      if (
        computePolicyDeclarationDigestV1(entry.declaration) !== entry.declarationDigest ||
        (entry.sourceEvidence !== null &&
          entry.sourceEvidence.declarationDigest !== entry.declarationDigest)
      ) {
        context.addIssue({
          code: "custom",
          message: "Compiled declaration digest binding mismatch",
        });
      }
    }
    for (const diagnostic of graphDiagnostics(compiled.declarations)) {
      context.addIssue({ code: "custom", message: diagnostic.code });
    }
  })
  .transform((compiled) =>
    freeze({
      ...compiled,
      declarations: [...compiled.declarations].sort(
        (a, b) =>
          compareUtf16CodeUnits(a.declaration.declarationId, b.declaration.declarationId) ||
          a.declaration.revision - b.declaration.revision
      ),
    })
  );

export type PolicyCompilationRequestV1 = {
  readonly schemaVersion: typeof NORMATIVE_POLICY_CONTRACT_VERSION;
  readonly canonicalizationVersion: typeof POLICY_CANONICALIZATION_VERSION_V1;
  readonly compilerVersion: typeof POLICY_COMPILER_VERSION_V1;
  readonly inputs: readonly PolicyCompilationInputV1[];
};
export type PolicyCompilationResultV1 =
  | {
      readonly ok: true;
      readonly compiled: CompiledPolicyV1;
      readonly diagnostics: readonly [];
      readonly authorizesExecution: false;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly PolicyCompilerDiagnosticV1[];
      readonly authorizesExecution: false;
    };

const requestShape = jsonInput.pipe(
  z
    .object({
      ...versions,
      inputs: z.array(z.object({ declaration: z.unknown(), sourceEvidence: z.unknown() }).strict()),
    })
    .strict()
);

/** Compile inert declarations; a successful result establishes no source trust or effect authority. */
export function compilePolicyV1(input: unknown): PolicyCompilationResultV1 {
  const request = requestShape.safeParse(input);
  if (!request.success) return failure([diagnostic("invalid_compilation_input")]);
  const entries: CompiledDeclaration[] = [];
  const diagnostics: PolicyCompilerDiagnosticV1[] = [];
  request.data.inputs.forEach((entry, index) => {
    const validated = validateDeclaration(entry.declaration, index);
    if (!validated.declaration) {
      diagnostics.push(validated.error!);
      return;
    }
    const declaration = validated.declaration;
    const source = PolicyDeclarationSourceEvidenceV1Schema.nullable().safeParse(
      entry.sourceEvidence
    );
    if (!source.success) {
      diagnostics.push(diagnostic("invalid_source_evidence", index));
      return;
    }
    const declarationDigest = computePolicyDeclarationDigestV1(declaration);
    if (source.data !== null && source.data.declarationDigest !== declarationDigest) {
      diagnostics.push(diagnostic("source_declaration_digest_mismatch", index));
      return;
    }
    entries.push({ declaration, declarationDigest, sourceEvidence: source.data });
  });
  // Keep diagnostic indexes bound to the original input array; don't build a
  // partial graph after invalid inputs have been removed.
  if (diagnostics.length) return failure(diagnostics);
  diagnostics.push(...graphDiagnostics(entries));
  if (diagnostics.length) return failure(diagnostics);
  return freeze({
    ok: true,
    compiled: CompiledPolicyV1Schema.parse({
      schemaVersion: NORMATIVE_POLICY_CONTRACT_VERSION,
      canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
      compilerVersion: POLICY_COMPILER_VERSION_V1,
      declarations: entries,
      authorizesExecution: false,
    }),
    diagnostics: [],
    authorizesExecution: false,
  });
}
