import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  canonicalizeJson,
  createPolicyResolverV1,
  EffectivePolicySnapshotV1Schema,
  PolicyResolutionRequestV1Schema,
  PolicyExceptionOverlayV1Schema,
  computePolicyDeclarationAuthorityDecisionDigestV1,
  STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1,
  type PolicyResolutionRequestV1,
  type EffectivePolicySnapshotV1,
} from "../../src/normative-policy/index.js";
import {
  asOf,
  before,
  after,
  declaration,
  digest,
  evidence,
  request,
  target,
  uuid,
  verification,
} from "./resolver-fixture.js";

type Verification = ReturnType<typeof verification>;
const resolve = (input: unknown, change: (value: Verification) => unknown = (value) => value) =>
  createPolicyResolverV1({
    version: "test.verifier.v1",
    verify: (input) => change(verification(input)),
  }).resolve(input);
const codes = (snapshot: EffectivePolicySnapshotV1) =>
  snapshot.payload.diagnostics.map((item) => item.code);
const blocked = (snapshot: EffectivePolicySnapshotV1) => {
  assert.equal(snapshot.payload.policyAdmission, "blocked");
  assert.equal(snapshot.payload.authorizesExecution, false);
};
function withRoute(id: string, kind: "require" | "forbid" | "permit", route: unknown) {
  const value = declaration(id, kind);
  return {
    ...value,
    rules: [
      {
        ...value.rules[0],
        proposition: { type: "operation_route", operationId: "test.operation", route },
      },
    ],
  };
}
const proposedRoute = (input: PolicyResolutionRequestV1) => ({
  ...input,
  proposal: {
    operationId: "test.operation",
    capabilityId: "test.capability",
    implementationDigest: digest,
  },
});

describe("protected resolver boundary", () => {
  test("authenticates the complete join and returns immutable non-authorizing policy data", async () => {
    const input = request();
    const snapshot = await resolve(input);
    assert.equal(snapshot.payload.policyAdmission, "satisfied");
    assert.equal(snapshot.payload.rules[0].satisfaction, "satisfied");
    assert(Object.isFrozen(snapshot.payload.rules[0].rule));
    assert.equal(snapshot.payload.authorizesExecution, false);
    assert.deepEqual(EffectivePolicySnapshotV1Schema.parse(snapshot), snapshot);
  });
  test("rejects caller-supplied decisions and confidence labels before invoking verifier", async () => {
    let called = false;
    const resolver = createPolicyResolverV1({
      version: "test.verifier.v1",
      verify() {
        called = true;
      },
    });
    await assert.rejects(resolver.resolve({ ...request(), confidence: "verified" }));
    await assert.rejects(resolver.resolve({ ...request(), verification: {} }));
    assert.equal(called, false);
  });
  test("rejects accessors and proxies without running them", async () => {
    let read = false;
    const input = {
      ...request(),
      get confidence() {
        read = true;
        return "verified";
      },
    };
    await assert.rejects(resolve(input));
    assert.equal(read, false);
    await assert.rejects(resolve(new Proxy(request(), {})));
  });
  test("captures verifier method and snapshots request before awaiting", async () => {
    const input = structuredClone(request());
    let resume!: () => void;
    const waiting = new Promise<void>((done) => {
      resume = done;
    });
    const host = {
      version: "test.verifier.v1",
      async verify(value: Parameters<typeof verification>[0]) {
        assert(Object.isFrozen(value.request));
        await waiting;
        return verification(value);
      },
    };
    const resolver = createPolicyResolverV1(host);
    const pending = resolver.resolve(input);
    Object.assign(input, { asOf: after });
    host.verify = async () => {
      throw Error("replacement");
    };
    resume();
    const result = await pending;
    assert.equal(result.payload.asOf, asOf);
    assert.equal(result.payload.policyAdmission, "satisfied");
  });
  for (const [name, change] of [
    [
      "forged decision digest",
      (v: Verification) => {
        v.declarations[0].decision.declarationAuthorityDecisionDigest = digest as never;
      },
    ],
    [
      "attestation digest mismatch",
      (v: Verification) => {
        v.declarations[0].sourceAttestationDigest = `sha256:${"2".repeat(64)}`;
      },
    ],
    [
      "attestation reference mismatch",
      (v: Verification) => {
        v.declarations[0].sourceAttestationRef = "attestation:other";
      },
    ],
    [
      "missing declaration proof",
      (v: Verification) => {
        v.declarations = [];
      },
    ],
    [
      "stale proof evidence",
      (v: Verification) => {
        v.declarations[0].evidence[0].validity.validUntil = asOf;
      },
    ],
    [
      "future proof evidence",
      (v: Verification) => {
        v.declarations[0].evidence[0].observedAt = after;
      },
    ],
    [
      "missing proof qualification",
      (v: Verification) => {
        v.declarations[0].evidence = [];
      },
    ],
    [
      "request mismatch",
      (v: Verification) => {
        v.requestDigest = digest;
      },
    ],
    [
      "verifier version mismatch",
      (v: Verification) => {
        v.verifierVersion = "another.verifier";
      },
    ],
  ] as const)
    test(name, async () =>
      blocked(
        await resolve(request(), (v) => {
          change(v);
          return v;
        })
      )
    );
  test("correctly digested expired/future decisions fail currentness", async () => {
    for (const bounds of [
      { evaluatedAt: before, validUntil: asOf },
      { evaluatedAt: after, validUntil: "2026-09-06T00:00:00.000Z" },
    ]) {
      blocked(
        await resolve(request(), (v) => {
          Object.assign(v.declarations[0].decision.payload, bounds);
          v.declarations[0].decision.declarationAuthorityDecisionDigest =
            computePolicyDeclarationAuthorityDecisionDigestV1(v.declarations[0].decision.payload);
          return v;
        })
      );
    }
  });
  test("missing and changed raw bytes cannot authenticate a compiled declaration", async () => {
    blocked(await resolve({ ...request(), rawSources: [] }));
    const input = request();
    blocked(
      await resolve({
        ...input,
        rawSources: [{ ...input.rawSources[0], base64: Buffer.from("{}").toString("base64") }],
      })
    );
  });
  test("verifier failures yield blocked snapshots without leaking exception text", async () => {
    const result = await createPolicyResolverV1({
      version: "test.verifier.v1",
      verify() {
        throw Error("secret-value");
      },
    }).resolve(request());
    blocked(result);
    assert(codes(result).includes("verifier_failed"));
    assert(!canonicalizeJson(result).includes("secret-value"));
    blocked(await resolve(request(), () => ({ confidence: "verified" })));
  });
});

describe("facts, activation, routes and qualification", () => {
  const scoped = () =>
    request([
      {
        ...declaration(),
        scope: { type: "workspace_repository", workspaceId: uuid, repositoryId: uuid },
      },
    ]);
  test("verified exact scope is applicable; contradictory, stale and missing facts are unknown", async () => {
    assert.equal((await resolve(scoped())).payload.policyAdmission, "satisfied");
    for (const change of [
      (v: Verification) => {
        v.facts = [];
      },
      (v: Verification) => {
        v.facts[1].status = "unknown";
      },
      (v: Verification) => {
        v.facts[1].evidence[0].validity.validUntil = asOf;
      },
      (v: Verification) => {
        v.facts.push({ ...v.facts[1], value: "00000000-0000-4000-8000-000000000002" });
      },
    ]) {
      const result = await resolve(scoped(), (v) => {
        change(v);
        return v;
      });
      blocked(result);
      assert.equal(result.payload.rules[0].applicability, "unknown");
    }
  });
  test("different verified scope is not applicable", async () => {
    const result = await resolve(scoped(), (v) => {
      v.facts[1].value = "00000000-0000-4000-8000-000000000002";
      return v;
    });
    assert.equal(result.payload.rules[0].applicability, "not_applicable");
    assert.equal(result.payload.policyAdmission, "satisfied");
  });
  test("revalidation at use must bind the exact asOf", async () => {
    for (const revalidatedAt of [null, before, asOf]) {
      const result = await resolve(scoped(), (v) => {
        Object.assign(v.facts[1].evidence[0], {
          validity: { type: "revalidate_at_use", revalidatedAt },
        });
        return v;
      });
      assert.equal(
        result.payload.policyAdmission,
        revalidatedAt === asOf ? "satisfied" : "blocked"
      );
    }
  });
  test("dormant rules create no operation request and need no effect grant", async () => {
    const input = request();
    const result = await resolve({
      ...input,
      proposal: { ...input.proposal, operationId: "other.operation" },
    });
    assert.equal(result.payload.rules[0].activation, "dormant");
    assert.equal(result.payload.rules[0].disposition, "inactive");
    assert.equal(result.payload.policyAdmission, "satisfied");
    assert.equal((await resolve(input)).payload.policyAdmission, "satisfied");
  });
  test("missing operation leaves conditional mandatory activation unknown", async () => {
    const input = request();
    const result = await resolve({ ...input, proposal: { ...input.proposal, operationId: null } });
    blocked(result);
    assert.equal(result.payload.rules[0].activation, "unknown");
  });
  test("unknown permit supplies no satisfied allowance; no permit is not default denial", async () => {
    const input = request([declaration("permit.test", "permit")]);
    const result = await resolve({ ...input, proposal: { ...input.proposal, operationId: null } });
    assert.equal(result.payload.rules[0].disposition, "unknown");
    assert.equal(result.payload.rules[0].satisfaction, "not_evaluated");
    assert.equal(result.payload.affirmativeAllowances.length, 0);
    assert.equal((await resolve(request([]))).payload.policyAdmission, "satisfied");
  });
  test("route membership and implementation qualification are independent", async () => {
    const input = proposedRoute(
      request([
        withRoute("route.test", "require", { type: "route_class", routeClassId: "managed" }),
      ])
    );
    const classify = (v: Verification) => {
      v.routeClassifications.push({
        capabilityId: "test.capability",
        routeClassId: "managed",
        status: "member",
        evidence: evidence(),
      });
      return v;
    };
    blocked(await resolve(input));
    assert.equal((await resolve(input, classify)).payload.policyAdmission, "satisfied");
    blocked(
      await resolve(input, (v) => {
        classify(v);
        v.selectedImplementation = null;
        return v;
      })
    );
    blocked(
      await resolve(input, (v) => {
        classify(v);
        v.selectedImplementation!.implementationDigest = `sha256:${"2".repeat(64)}`;
        return v;
      })
    );
    blocked(
      await resolve(input, (v) => {
        classify(v);
        v.routeClassifications[0].status = "not_member";
        return v;
      })
    );
  });
});

describe("exact relations and mandatory closure", () => {
  function override(kind: "require" | "permit" | "recommend" = "permit") {
    const to = declaration("target.policy", "forbid");
    const from = declaration("source.policy", kind);
    return {
      from: {
        ...from,
        rules: [
          {
            ...from.rules[0],
            relations: [
              {
                type: "overrides",
                target: target(to),
                requiredAuthorityCapabilityId: "policy.override",
              },
            ],
          },
        ],
      },
      to,
    };
  }
  test("permit never overrides implicitly; exact independently authorized override can", async () => {
    const { from, to } = override();
    blocked(await resolve(request([declaration("source.policy", "permit"), to])));
    const result = await resolve(request([from, to]));
    assert.equal(result.payload.policyAdmission, "satisfied");
    assert.equal(
      result.payload.rules.find((r) => r.target.declarationId === "target.policy")?.disposition,
      "suppressed"
    );
    const rejected = await resolve(request([from, to]), (v) => {
      v.declarations.forEach((entry) => {
        entry.approvedRelations = [];
      });
      return v;
    });
    blocked(rejected);
    assert(codes(rejected).includes("relation_unauthorized"));
  });
  test("untrusted and unknown-scope sources cannot suppress", async () => {
    const { from, to } = override();
    const result = await resolve(request([from, to]), (v) => {
      v.declarations = v.declarations.filter((d) => !d.approvedRelations.length);
      return v;
    });
    blocked(result);
    assert.equal(
      result.payload.rules.find((r) => r.target.declarationId === "target.policy")?.disposition,
      "effective"
    );
    blocked(
      await resolve(
        request([{ ...from, scope: { type: "workspace", workspaceId: uuid } }, to]),
        (v) => {
          v.facts = [];
          return v;
        }
      )
    );
  });
  test("a narrow permit cannot suppress a broad prohibition for another or unknown route", async () => {
    const to = declaration("target.policy", "forbid");
    const from = withRoute("source.policy", "permit", {
      type: "capability",
      capabilityId: "allowed.route",
    });
    const value = {
      ...from,
      rules: [
        {
          ...from.rules[0],
          relations: [
            {
              type: "overrides",
              target: target(to),
              requiredAuthorityCapabilityId: "policy.override",
            },
          ],
        },
      ],
    };
    const input = request([to, value]);
    for (const proposal of [
      input.proposal,
      {
        operationId: "test.operation",
        capabilityId: "different.route",
        implementationDigest: digest,
      },
    ]) {
      const result = await resolve({ ...input, proposal });
      blocked(result);
      assert.equal(
        result.payload.rules.find((rule) => rule.target.declarationId === "target.policy")
          ?.disposition,
        "effective"
      );
      assert.equal(result.payload.affirmativeAllowances.length, 0);
    }
    const matched = await resolve({
      ...input,
      proposal: {
        operationId: "test.operation",
        capabilityId: "allowed.route",
        implementationDigest: digest,
      },
    });
    assert.equal(matched.payload.policyAdmission, "satisfied");
    assert.equal(matched.payload.affirmativeAllowances.length, 1);
  });
  test("additive refines and advisory overrides cannot erase prohibition", async () => {
    const { from, to } = override();
    const refine = {
      ...from,
      rules: [
        { ...from.rules[0], relations: [{ ...from.rules[0].relations[0], type: "refines" }] },
      ],
    };
    const result = await resolve(request([refine, to]));
    blocked(result);
    assert.equal(result.payload.relations[0].outcome, "additive");
    const advisory = override("recommend");
    blocked(await resolve(request([advisory.from, advisory.to])));
  });
  test("relation-specific authority is required even when the exact target is out of scope", async () => {
    const to = {
      ...declaration("target.policy"),
      scope: { type: "workspace", workspaceId: "00000000-0000-4000-8000-000000000099" },
    };
    const from = declaration("source.policy");
    const value = {
      ...from,
      rules: [
        {
          ...from.rules[0],
          relations: [
            {
              type: "refines",
              target: target(to as ReturnType<typeof declaration>),
              requiredAuthorityCapabilityId: "policy.refine",
            },
          ],
        },
      ],
    };
    const result = await resolve(request([value, to]), (v) => {
      v.declarations.forEach((entry) => {
        entry.approvedRelations = [];
      });
      return v;
    });
    blocked(result);
    assert.equal(
      result.payload.rules.find((rule) => rule.target.declarationId === "source.policy")
        ?.declarationTrusted,
      false
    );
    assert(codes(result).includes("relation_unauthorized"));
  });
  test("non-conflicting override has trace only", async () => {
    const to = declaration("target.policy");
    const from = declaration("source.policy");
    const value = {
      ...from,
      rules: [
        {
          ...from.rules[0],
          relations: [
            {
              type: "overrides",
              target: target(to),
              requiredAuthorityCapabilityId: "policy.override",
            },
          ],
        },
      ],
    };
    const result = await resolve(request([to, value]));
    assert.equal(result.payload.relations[0].outcome, "non_conflicting");
    assert.equal(result.payload.effectiveRules.length, 2);
  });
  test("suppressed source does not transitively suppress a third rule", async () => {
    const c = declaration("c.policy", "require");
    const b = declaration("b.policy", "forbid");
    const bValue = {
      ...b,
      rules: [
        {
          ...b.rules[0],
          relations: [
            {
              type: "overrides",
              target: target(c),
              requiredAuthorityCapabilityId: "policy.override",
            },
          ],
        },
      ],
    };
    const a = declaration("a.policy", "require");
    const aValue = {
      ...a,
      rules: [
        {
          ...a.rules[0],
          relations: [
            {
              type: "overrides",
              target: target(b),
              requiredAuthorityCapabilityId: "policy.override",
            },
          ],
        },
      ],
    };
    const result = await resolve(request([c, bValue, aValue]));
    assert.equal(
      result.payload.rules.find((r) => r.target.declarationId === "c.policy")?.disposition,
      "effective"
    );
    assert.equal(result.payload.policyAdmission, "satisfied");
  });
  test("mandatory dependency closes through an advisory intermediate", async () => {
    const c = declaration("c.policy", "recommend");
    const b = declaration("b.policy", "recommend");
    const bValue = {
      ...b,
      rules: [{ ...b.rules[0], relations: [{ type: "depends_on", target: target(c) }] }],
    };
    const a = declaration("a.policy");
    const aValue = {
      ...a,
      rules: [{ ...a.rules[0], relations: [{ type: "depends_on", target: target(b) }] }],
    };
    const input = request([
      aValue,
      bValue,
      { ...c, scope: { type: "workspace", workspaceId: uuid } },
    ]);
    const result = await resolve(input, (v) => {
      v.facts = [];
      return v;
    });
    blocked(result);
    assert(codes(result).includes("dependency_unsatisfied"));
  });
  test("operation-wide forbids conflict with route requirements", async () => {
    const result = await resolve(
      proposedRoute(
        request([
          declaration("forbid.policy", "forbid"),
          withRoute("require.policy", "require", {
            type: "capability",
            capabilityId: "test.capability",
          }),
        ])
      )
    );
    blocked(result);
    assert.equal(result.payload.conflicts[0].status, "conflict");
  });
  test("two distinct required capabilities conflict; unknown class coverage fails closed", async () => {
    const a = withRoute("a.policy", "require", {
      type: "capability",
      capabilityId: "test.capability",
    });
    const b = withRoute("b.policy", "require", {
      type: "capability",
      capabilityId: "other.capability",
    });
    assert(codes(await resolve(proposedRoute(request([a, b])))).includes("conflict"));
    const c = withRoute("c.policy", "forbid", { type: "route_class", routeClassId: "forbidden" });
    assert(codes(await resolve(proposedRoute(request([a, c])))).includes("conflict_unknown"));
  });
});

describe("bounded overlays and deterministic snapshots", () => {
  test("STFC managed-route conformance accepts the public route and rejects both fallback classes", async () => {
    const policy = STFC_MANAGED_ROUTE_CONFORMANCE_DECLARATION_V1;
    for (const selected of ["public", "manual", "private"]) {
      const input = {
        ...request([policy]),
        proposal: {
          operationId: "stfc.runtime.cycle",
          capabilityId:
            selected === "public"
              ? "stfc.public.lifecycle.cycle.managed"
              : `stfc.${selected}.cycle`,
          implementationDigest: digest,
        },
      };
      const result = await resolve(input, (v) => {
        assert.equal(policy.scope.type, "workspace_repository");
        if (policy.scope.type !== "workspace_repository") throw Error("fixture scope");
        v.facts.find((f) => f.key === "workspaceId")!.value = policy.scope.workspaceId;
        v.facts.find((f) => f.key === "repositoryId")!.value = policy.scope.repositoryId;
        v.routeClassifications = ["manual", "private"].map((route) => ({
          capabilityId: input.proposal.capabilityId,
          routeClassId: `stfc.lifecycle.route.${route}`,
          status: selected === route ? "member" : "not_member",
          evidence: evidence(),
        }));
        return v;
      });
      assert.equal(result.payload.policyAdmission, selected === "public" ? "satisfied" : "blocked");
      assert.equal(result.payload.authorizesExecution, false);
    }
  });
  function excepted() {
    const parent = declaration("parent.policy", "forbid");
    const input = request([parent]);
    const overlay = {
      schemaVersion: 1,
      overlayId: "test.exception",
      issuer: parent.issuer,
      target: target(parent),
      requiredOverrideCapabilityId: "policy.exception",
      revocationEvidenceRef: "revocation:exception",
      scope: parent.scope,
      rationale: "Synthetic bounded test exception",
      issuedAt: before,
      expiresAt: after,
      authorizesExecution: false,
    };
    return { ...input, overlays: [overlay] };
  }
  test("valid exact exception suppresses only its parent", async () => {
    const result = await resolve(excepted());
    assert.equal(result.payload.policyAdmission, "satisfied");
    assert.equal(result.payload.rules[0].disposition, "suppressed");
  });
  test("exceptions may narrow global scope but cannot broaden a workspace parent", async () => {
    const input = excepted();
    const narrow = { ...input.overlays[0], scope: { type: "workspace", workspaceId: uuid } };
    assert.equal(
      (await resolve({ ...input, overlays: [narrow] })).payload.policyAdmission,
      "satisfied"
    );
    const parent = {
      ...declaration("parent.policy", "forbid"),
      scope: { type: "workspace", workspaceId: uuid },
    };
    const scopedInput = request([parent]);
    blocked(await resolve({ ...scopedInput, overlays: input.overlays }));
  });
  for (const state of ["revoked", "unknown"])
    test(`${state} exception is rejected`, async () => {
      const result = await resolve(excepted(), (v) => {
        v.overlays[0].revocation = state;
        return v;
      });
      blocked(result);
      assert(codes(result).includes("overlay_rejected"));
    });
  test("expiry, future issuance, unauthorized issuer and scope changes fail closed", async () => {
    const input = excepted();
    blocked(await resolve({ ...input, overlays: [{ ...input.overlays[0], expiresAt: asOf }] }));
    blocked(
      await resolve({
        ...input,
        overlays: [
          { ...input.overlays[0], issuedAt: after, expiresAt: "2026-09-06T00:00:00.000Z" },
        ],
      })
    );
    blocked(
      await resolve(input, (v) => {
        v.overlays[0].status = "unauthorized";
        return v;
      })
    );
    blocked(
      await resolve({
        ...input,
        overlays: [
          {
            ...input.overlays[0],
            scope: { type: "workspace", workspaceId: "00000000-0000-4000-8000-000000000099" },
          },
        ],
      })
    );
    assert(
      !PolicyExceptionOverlayV1Schema.safeParse({ ...input.overlays[0], expiresAt: undefined })
        .success
    );
  });
  test("exception revocation evidence has its own exact reference and freshness checks", async () => {
    blocked(
      await resolve(excepted(), (v) => {
        v.overlays[0].revocationEvidence.ref = "revocation:other";
        return v;
      })
    );
    blocked(
      await resolve(excepted(), (v) => {
        v.overlays[0].revocationEvidence.validity.validUntil = asOf;
        return v;
      })
    );
    const input = excepted();
    assert(
      !PolicyExceptionOverlayV1Schema.safeParse({
        ...input.overlays[0],
        revocationEvidenceRef: undefined,
      }).success
    );
  });
  test("semantic sets normalize order but reject duplicates; snapshot tampering fails", async () => {
    const input = request([declaration("a.policy"), declaration("b.policy")]);
    const result = await resolve(input);
    const reversed = {
      ...input,
      compiled: { ...input.compiled, declarations: [...input.compiled.declarations].reverse() },
      rawSources: [...input.rawSources].reverse(),
    };
    assert.equal(
      (
        await resolve(reversed, (v) => {
          v.declarations.reverse();
          v.facts.reverse();
          return v;
        })
      ).snapshotDigest,
      result.snapshotDigest
    );
    assert(
      !PolicyResolutionRequestV1Schema.safeParse({
        ...input,
        rawSources: [...input.rawSources, input.rawSources[0]],
      }).success
    );
    assert(
      !EffectivePolicySnapshotV1Schema.safeParse({ ...result, snapshotDigest: digest }).success
    );
    assert(
      !EffectivePolicySnapshotV1Schema.safeParse({
        ...result,
        payload: { ...result.payload, policyAdmission: "blocked" },
      }).success
    );
  });
  test("cross-process canonical output is byte-identical", async () => {
    const require = createRequire(import.meta.url);
    const entry = pathToFileURL(require.resolve("../../src/normative-policy/index.ts")).href;
    const fixture = pathToFileURL(require.resolve("./resolver-fixture.ts")).href;
    const script = `import {createPolicyResolverV1,canonicalizeJson} from ${JSON.stringify(entry)}; import {request,verification} from ${JSON.stringify(fixture)}; console.log(canonicalizeJson(await createPolicyResolverV1({version:'test.verifier.v1',verify:verification}).resolve(request())));`;
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { encoding: "utf8", timeout: 30000 }
    );
    assert.equal(child.status, 0, child.stderr);
    const local = await resolve(request());
    assert.equal(
      local.snapshotDigest,
      "sha256:0b8a13f54fee2cff6b6f1da4fbf1e2b71dd52f93b633746df29f1bcf4a4c2386"
    );
    assert.equal(child.stdout.trim(), canonicalizeJson(local));
  });
});
