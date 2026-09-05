import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { describe, test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  canonicalizeJson,
  compilePolicyV1,
  CompiledPolicyV1Schema,
  computePolicyDeclarationDigestV1,
  computePolicySemanticDigestV1,
  computePolicySourceContentDigestV1,
  NORMATIVE_POLICY_CONFORMANCE_FIXTURES,
  parsePolicyDeclarationJsonV1,
  POLICY_CANONICALIZATION_VERSION_V1,
  POLICY_COMPILER_VERSION_V1,
  POLICY_JSON_MAX_BYTES_V1,
  PolicyCompilerDiagnosticV1Schema,
  PolicyDeclarationV1Schema,
  PolicyRuleV1Schema,
  PolicySemanticDigestV1Schema,
  SYNTHETIC_PERMIT_CONFORMANCE_DECLARATION_V1,
} from "../../src/normative-policy/index.js";

const source = { type: "synthetic_fixture", fixtureId: "compiler.test" };
const declaration = (id = "compiler.test") => ({
  ...structuredClone(SYNTHETIC_PERMIT_CONFORMANCE_DECLARATION_V1),
  declarationId: id,
});
const request = (declarations: unknown[]) => ({
  schemaVersion: 1,
  canonicalizationVersion: POLICY_CANONICALIZATION_VERSION_V1,
  compilerVersion: POLICY_COMPILER_VERSION_V1,
  inputs: declarations.map((declaration) => ({ declaration, sourceEvidence: null })),
});
const raw = (value: unknown) => Buffer.from(JSON.stringify(value));
const parse = (text: string) => parsePolicyDeclarationJsonV1(Buffer.from(text), source);
const codes = (result: ReturnType<typeof compilePolicyV1>) => {
  assert.equal(result.ok, false);
  assert.equal("compiled" in result, false);
  for (const diagnostic of result.diagnostics) PolicyCompilerDiagnosticV1Schema.parse(diagnostic);
  return result.diagnostics.map(({ code }) => code);
};
const targetOf = (value: ReturnType<typeof declaration>) => ({
  declarationId: value.declarationId,
  declarationRevision: value.revision,
  ruleId: value.rules[0].ruleId,
  expectedSemanticDigest: computePolicySemanticDigestV1(PolicyRuleV1Schema.parse(value.rules[0])),
});
function relate(
  from: ReturnType<typeof declaration>,
  to: ReturnType<typeof declaration>,
  type = "depends_on"
) {
  const relation =
    type === "depends_on"
      ? { type, target: targetOf(to) }
      : { type, target: targetOf(to), requiredAuthorityCapabilityId: "policy.relate" };
  return { ...from, rules: [{ ...from.rules[0], relations: [relation] }] };
}

describe("JSON-only raw declaration profile", () => {
  test("binds exact source bytes and independently normalized declaration", () => {
    const value = declaration();
    const bytes = raw(value);
    const result = parsePolicyDeclarationJsonV1(bytes, source);
    assert(result.ok);
    assert.equal(
      result.input.sourceEvidence?.sourceContentDigest,
      computePolicySourceContentDigestV1(bytes)
    );
    assert.equal(
      result.input.sourceEvidence?.declarationDigest,
      computePolicyDeclarationDigestV1(PolicyDeclarationV1Schema.parse(value))
    );
    assert.equal(result.authorizesExecution, false);
    assert(Object.isFrozen(result.input.declaration.rules[0]));
    bytes.fill(0);
    assert.equal(result.input.declaration.declarationId, value.declarationId);
  });

  test("formatting changes evidence but preserves declaration identity", () => {
    const compact = parsePolicyDeclarationJsonV1(raw(declaration()), source);
    const pretty = parse(JSON.stringify(declaration(), null, 2) + "\r\n");
    assert(compact.ok && pretty.ok);
    assert.equal(
      compact.input.sourceEvidence?.declarationDigest,
      pretty.input.sourceEvidence?.declarationDigest
    );
    assert.notEqual(
      compact.input.sourceEvidence?.sourceContentDigest,
      pretty.input.sourceEvidence?.sourceContentDigest
    );
  });

  for (const text of [
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"x":[{"id":0,"id":1}]}',
    '{"__proto__":0,"__proto__":1}',
  ]) {
    test(`rejects decoded duplicate key before shape validation: ${text}`, () => {
      assert.deepEqual(codes(parse(text)), ["duplicate_json_key"]);
    });
  }
  for (const text of [
    "",
    "---\na: b",
    "{} {}",
    "[]\n---\n[]",
    "[1,]",
    '{"a":1,}',
    '{"a":01}',
    '{"a":+1}',
    '{"a":NaN}',
    '{"a":Infinity}',
    '{"a":1e400}',
    '{"a":"\\uD800"}',
    '{"a":"\\q"}',
    '{"a":"\n"}',
    "\uFEFF{}",
    '{"a":truefalse}',
  ]) {
    test(`rejects invalid JSON profile ${JSON.stringify(text)}`, () => {
      assert.deepEqual(codes(parse(text)), ["invalid_json"]);
    });
  }
  test("rejects invalid UTF-8, oversized source and excessive nesting", () => {
    assert.deepEqual(codes(parsePolicyDeclarationJsonV1(new Uint8Array([0xc0, 0xaf]), source)), [
      "invalid_utf8",
    ]);
    assert.deepEqual(
      codes(parsePolicyDeclarationJsonV1(new Uint8Array(POLICY_JSON_MAX_BYTES_V1 + 1), source)),
      ["source_too_large"]
    );
    assert.deepEqual(codes(parse("[".repeat(130) + "0" + "]".repeat(130))), ["source_too_deep"]);
    assert.deepEqual(codes(parsePolicyDeclarationJsonV1("{}" as unknown as Uint8Array, source)), [
      "invalid_source_bytes",
    ]);
  });
  test("rejects unknown declaration fields and malformed source locators", () => {
    assert.deepEqual(
      codes(parsePolicyDeclarationJsonV1(raw({ ...declaration(), grants: [] }), source)),
      ["invalid_declaration"]
    );
    assert.deepEqual(
      codes(parsePolicyDeclarationJsonV1(raw(declaration()), { ...source, credentials: "secret" })),
      ["invalid_source_locator"]
    );
  });
});

describe("deterministic, non-authorizing compilation", () => {
  test("compiles all modalities without inventing operation requests or gates", () => {
    for (const fixture of NORMATIVE_POLICY_CONFORMANCE_FIXTURES) {
      const result = compilePolicyV1(request([fixture.declaration]));
      assert(result.ok);
      assert.deepEqual(
        result.compiled.declarations[0].declaration,
        PolicyDeclarationV1Schema.parse(fixture.declaration)
      );
      assert.deepEqual(result.diagnostics, []);
      assert.equal(result.compiled.authorizesExecution, false);
      assert(Object.isFrozen(result.compiled.declarations[0].declaration.scope));
      assert.throws(() => {
        (result.compiled as unknown as { authorizesExecution: boolean }).authorizesExecution = true;
      });
    }
  });
  test("raw parse products compile and evidence remains outside semantic input", () => {
    const parsed = parsePolicyDeclarationJsonV1(raw(declaration()), source);
    assert(parsed.ok);
    const result = compilePolicyV1({ ...request([]), inputs: [parsed.input] });
    assert(result.ok);
    assert.equal(
      result.compiled.declarations[0].declarationDigest,
      parsed.input.sourceEvidence?.declarationDigest
    );
    assert.deepEqual(result.compiled.declarations[0].sourceEvidence, parsed.input.sourceEvidence);
    const mismatch = structuredClone(parsed.input);
    assert(mismatch.sourceEvidence);
    const bad = {
      ...mismatch,
      sourceEvidence: { ...mismatch.sourceEvidence, declarationDigest: `sha256:${"0".repeat(64)}` },
    };
    assert.deepEqual(codes(compilePolicyV1({ ...request([]), inputs: [bad] })), [
      "source_declaration_digest_mismatch",
    ]);
  });
  test("normalizes set order, preserves input and preference order, permits empty policy", () => {
    const a = declaration("a");
    const b = declaration("b");
    const input = request([b, a]);
    const before = structuredClone(input);
    const left = compilePolicyV1(input);
    const right = compilePolicyV1(request([a, b]));
    assert(left.ok && right.ok);
    assert.equal(canonicalizeJson(left.compiled), canonicalizeJson(right.compiled));
    assert.deepEqual(input, before);
    assert(compilePolicyV1(request([])).ok);
  });
  for (const field of ["schemaVersion", "compilerVersion", "canonicalizationVersion"]) {
    test(`rejects unsupported ${field}`, () => {
      assert.deepEqual(codes(compilePolicyV1({ ...request([]), [field]: "unknown" })), [
        "invalid_compilation_input",
      ]);
    });
  }
  for (const field of ["persona", "memory", "facts", "workspaceGrants", "attemptGrant"]) {
    test(`rejects ${field} as compiler input`, () => {
      assert.deepEqual(codes(compilePolicyV1({ ...request([]), [field]: {} })), [
        "invalid_compilation_input",
      ]);
    });
  }
  test("rejects active values without invoking getters", () => {
    let calls = 0;
    const value = {
      ...request([]),
      get authority() {
        calls++;
        return true;
      },
    };
    assert.deepEqual(codes(compilePolicyV1(value)), ["invalid_compilation_input"]);
    assert.equal(calls, 0);
    assert.deepEqual(codes(compilePolicyV1(new Proxy(request([]), {}))), [
      "invalid_compilation_input",
    ]);
  });
  test("rejects prose, compound modalities and advisory gate strengthening", () => {
    const base = declaration();
    for (const rule of [
      { ...base.rules[0], directive: "Always execute the operation" },
      { ...base.rules[0], require: true, forbid: true },
      { ...base.rules[0], kind: "recommend", enforcementIntents: ["capability_gate"] },
      { ...base.rules[0], kind: "permit", enforcementIntents: ["verifier"] },
    ]) {
      assert.deepEqual(codes(compilePolicyV1(request([{ ...base, rules: [rule] }]))), [
        "invalid_declaration",
      ]);
    }
  });
  test("compiled schema rejects extra fields, authority, tampered digests and dangling graphs", () => {
    const result = compilePolicyV1(request([declaration()]));
    assert(result.ok);
    assert(!CompiledPolicyV1Schema.safeParse({ ...result.compiled, grants: [] }).success);
    assert(
      !CompiledPolicyV1Schema.safeParse({ ...result.compiled, authorizesExecution: true }).success
    );
    const tampered = {
      ...result.compiled,
      declarations: [
        { ...result.compiled.declarations[0], declarationDigest: `sha256:${"0".repeat(64)}` },
      ],
    };
    assert(!CompiledPolicyV1Schema.safeParse(tampered).success);
    const changed = relate(declaration(), declaration("missing"));
    assert(
      !CompiledPolicyV1Schema.safeParse({
        ...result.compiled,
        declarations: [
          {
            declaration: changed,
            declarationDigest: computePolicyDeclarationDigestV1(
              PolicyDeclarationV1Schema.parse(changed)
            ),
            sourceEvidence: null,
          },
        ],
      }).success
    );
  });
});

describe("exact directed relation graph", () => {
  test("rejects duplicate identity and conflicting revision reuse distinctly", () => {
    const a = declaration();
    assert.deepEqual(codes(compilePolicyV1(request([a, a]))), ["duplicate_declaration"]);
    assert.deepEqual(
      codes(
        compilePolicyV1(
          request([
            a,
            {
              ...a,
              scope: { type: "global" },
              issuer: { ...a.issuer, authorityDomainId: "other" },
            },
          ])
        )
      ),
      ["declaration_revision_conflict"]
    );
    assert.deepEqual(codes(compilePolicyV1(request([{ ...a, rules: [a.rules[0], a.rules[0]] }]))), [
      "duplicate_rule_id",
    ]);
    assert(compilePolicyV1(request([a, { ...a, revision: 2 }])).ok);
  });
  test("accepts pinned acyclic relations without suppressing targets", () => {
    const a = declaration("a");
    const b = declaration("b");
    for (const type of ["depends_on", "refines", "overrides"]) {
      const result = compilePolicyV1(request([relate(a, b, type), b]));
      assert(result.ok);
      assert.equal(result.compiled.declarations.length, 2);
      assert.equal(result.compiled.declarations[0].declaration.rules[0].relations[0].type, type);
    }
  });
  test("rejects missing revisions and rule identities, self-relations, digest mismatches", () => {
    const a = declaration("a");
    const b = declaration("b");
    assert(codes(compilePolicyV1(request([relate(a, b)]))).includes("missing_target"));
    assert(
      codes(compilePolicyV1(request([relate(a, b), { ...b, revision: 2 }]))).includes(
        "missing_target"
      )
    );
    assert(codes(compilePolicyV1(request([relate(a, a)]))).includes("self_relation"));
    const wrong = relate(a, b);
    wrong.rules[0].relations[0].target.expectedSemanticDigest = PolicySemanticDigestV1Schema.parse(
      `sha256:${"0".repeat(64)}`
    );
    assert(codes(compilePolicyV1(request([wrong, b]))).includes("target_digest_mismatch"));
  });
  test("rejects floating and malformed targets", () => {
    const a = relate(declaration("a"), declaration("b"));
    const floating = {
      ...a,
      rules: [
        {
          ...a.rules[0],
          relations: [{ type: "depends_on", target: { declarationId: "b", ruleId: "r" } }],
        },
      ],
    };
    assert.deepEqual(codes(compilePolicyV1(request([floating]))), ["invalid_declaration"]);
  });
  test("rejects multiple relation types to the exact same target", () => {
    const b = declaration("b");
    const a = relate(declaration("a"), b);
    const multiple = {
      ...a,
      rules: [
        {
          ...a.rules[0],
          relations: [
            a.rules[0].relations[0],
            relate(declaration("a"), b, "overrides").rules[0].relations[0],
          ],
        },
      ],
    };
    assert(codes(compilePolicyV1(request([multiple, b]))).includes("multiple_relation_types"));
  });
  for (const types of [
    ["depends_on", "depends_on", "depends_on"],
    ["depends_on", "refines", "overrides"],
  ]) {
    test(`rejects directed cycle ${types.join("/")}`, () => {
      const a = declaration("a"),
        b = declaration("b"),
        c = declaration("c");
      assert.deepEqual(
        codes(
          compilePolicyV1(
            request([relate(a, b, types[0]), relate(b, c, types[1]), relate(c, a, types[2])])
          )
        ),
        ["relation_cycle"]
      );
    });
  }
  test("returns deterministically ordered errors with no partial compiled product", () => {
    const input = request([
      relate(declaration("z"), declaration("absent-z")),
      relate(declaration("a"), declaration("absent-a")),
    ]);
    const first = compilePolicyV1(input);
    assert.deepEqual(first, compilePolicyV1(structuredClone(input)));
    assert.deepEqual(codes(first), ["missing_target", "missing_target"]);
    const canonicalDiagnostics = first.diagnostics.map(canonicalizeJson);
    assert.deepEqual(canonicalDiagnostics, [...canonicalDiagnostics].sort());
  });
});

test("compiled canonical output and diagnostics are identical in independent processes", () => {
  const require = createRequire(import.meta.url);
  const script = `
    import { compilePolicyV1, canonicalizeJson } from './src/normative-policy/index.ts';
    const input = ${JSON.stringify(request([declaration()]))};
    process.stdout.write(canonicalizeJson([compilePolicyV1(input), compilePolicyV1({...input, compilerVersion:'bad'})]));
  `;
  const outputs = [0, 1].map(() => {
    const child = spawnSync(
      process.execPath,
      ["--import", pathToFileURL(require.resolve("tsx")).href, "--input-type=module", "-e", script],
      { encoding: "utf8" }
    );
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  });
  assert.equal(outputs[0], outputs[1]);
  const expected = canonicalizeJson([
    compilePolicyV1(request([declaration()])),
    compilePolicyV1({ ...request([declaration()]), compilerVersion: "bad" }),
  ]);
  assert.equal(outputs[0], expected);
  assert.equal(
    createHash("sha256").update(outputs[0]).digest("hex"),
    "caca42c54b5d927ef8a3ae1129ad8397a2b7c6bebbaf27a6708bd002cb0d0088"
  );
});
