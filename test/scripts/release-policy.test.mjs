import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  formatGitHubSignerOutputs,
  parseAuthorizedFingerprints,
  parseValidSignatures,
  requireAuthorizedSignature,
  writeGitHubSignerOutputs,
} from "../../scripts/verify-release-signatures.mjs";
import { classifyPublishedIntegrity } from "../../scripts/verify-npm-publishability.mjs";

const verifier = path.resolve("scripts/verify-release-tag.mjs");
const provenanceVerifier = path.resolve("scripts/verify-npm-provenance.mjs");
const lexMcpVerifier = path.resolve("scripts/verify-lex-mcp-public.mjs");
const workflowPath = path.resolve(".github/workflows/release.yml");
const mcpWorkflowPath = path.resolve(".github/workflows/mcp-publish.yml");
const packagePath = path.resolve("package.json");
const serverManifestPath = path.resolve("server.json");
const registrySchemaPath = path.resolve(
  "scripts/schemas/mcp-registry-server-2025-12-11.schema.json"
);
const registrySchemaSha256 = "3fba09590c99f61735d234822279f4223fab9e300c0a81e81c91ab62a4114de0";

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result;
}

test("release workflow separates npm publication from signed-tag release creation", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const publishStart = workflow.indexOf("  publish-npm:");
  const releaseStart = workflow.indexOf("  create-github-release:");
  assert.ok(publishStart > 0, "publish-npm job is missing");
  assert.ok(releaseStart > publishStart, "create-github-release job is missing");

  const publishJob = workflow.slice(publishStart, releaseStart);
  const releaseJob = workflow.slice(releaseStart);

  assert.match(
    workflow,
    /publish:\n\s+description:.*\n\s+required: true\n\s+default: false\n\s+type: boolean/
  );
  assert.match(
    publishJob,
    /if: github\.event_name == 'workflow_dispatch' && inputs\.publish == true/
  );
  assert.match(publishJob, /environment: npm-release/);
  assert.match(publishJob, /npm publish "\$TARBALL" --access public --provenance/);
  assert.match(publishJob, /OBSERVED_MAIN.*npm publish/s);
  assert.match(publishJob, /RECEIPT_RELEASE_IDENTITY.*!= "null"/s);
  assert.match(publishJob, /npm audit signatures --json --include-attestations/);
  assert.match(publishJob, /verify-npm-provenance\.mjs/);

  assert.match(releaseJob, /if: github\.event_name == 'push'/);
  assert.match(releaseJob, /Verify immutable public npm integrity/);
  assert.match(releaseJob, /Verify the exact public Lex-MCP dependency edge/);
  assert.match(releaseJob, /verify-lex-mcp-public\.mjs/);
  assert.match(releaseJob, /Verify public npm workflow provenance/);
  assert.match(releaseJob, /softprops\/action-gh-release@[0-9a-f]{40}/);
  assert.doesNotMatch(releaseJob, /npm publish/);

  const installers = [
    ...workflow.matchAll(
      /- name: Install verified GitHub attestation CLI([\s\S]*?)(?=\n\s+- (?:name:|uses:))/gu
    ),
  ];
  assert.equal(installers.length, 2);
  for (const [, installer] of installers) {
    assert.match(installer, /GH_ROOT="\$RUNNER_TEMP\/gh-verify"/u);
    assert.doesNotMatch(installer, /-o gh\.tar\.gz/u);
    assert.doesNotMatch(installer, /echo "\$PWD\//u);
  }
});

test("full CI builds runtime artifacts before tests execute the packed CLI", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  const commands = packageJson.scripts["ci:full"].split(" && ");
  const buildIndex = commands.indexOf("npm run build");
  const testIndex = commands.indexOf("npm test");

  assert.ok(buildIndex >= 0, "ci:full must build runtime artifacts");
  assert.ok(testIndex >= 0, "ci:full must run the default test suite");
  assert.ok(buildIndex < testIndex, "ci:full must build dist before CLI tests execute it");
});

test("pinned MCP Registry schema accepts 100 description characters and rejects 101", async () => {
  const schemaBytes = await readFile(registrySchemaPath);
  assert.equal(createHash("sha256").update(schemaBytes).digest("hex"), registrySchemaSha256);
  const schema = JSON.parse(schemaBytes);
  const manifest = JSON.parse(await readFile(serverManifestPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
  assert.ok(manifest.description.length <= 100);
  assert.equal(validate({ ...manifest, description: "a".repeat(100) }), true);
  assert.equal(validate({ ...manifest, description: "a".repeat(101) }), false);
  assert.ok(validate.errors?.some((error) => error.keyword === "maxLength"));
});

test("npm candidate recovery accepts only absent or exact public integrity", () => {
  const identity = "@smartergpt/lex@4.0.4";
  const expectedIntegrity = "sha512-reviewed";
  assert.equal(
    classifyPublishedIntegrity({
      status: 0,
      stdout: JSON.stringify(expectedIntegrity),
      stderr: "",
      expectedIntegrity,
      identity,
    }),
    "exact"
  );
  assert.equal(
    classifyPublishedIntegrity({
      status: 1,
      stdout: "",
      stderr: "npm error code E404",
      expectedIntegrity,
      identity,
    }),
    "absent"
  );
  assert.throws(
    () =>
      classifyPublishedIntegrity({
        status: 0,
        stdout: JSON.stringify("sha512-different"),
        stderr: "",
        expectedIntegrity,
        identity,
      }),
    /different from the retained candidate/
  );
  assert.throws(
    () =>
      classifyPublishedIntegrity({
        status: 1,
        stdout: "",
        stderr: "network timeout",
        expectedIntegrity,
        identity,
      }),
    /Could not determine/
  );
});

test("public Lex-MCP policy reads npm's dotted integrity field", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lex-mcp-public-"));
  try {
    const metadataPath = path.join(root, "metadata.json");
    const metadata = {
      version: "4.0.2",
      engines: { node: ">=24" },
      dependencies: { "@smartergpt/lex": "4.0.2" },
      "dist.integrity": `sha512-${Buffer.from("a".repeat(128), "hex").toString("base64")}`,
    };
    const args = [
      lexMcpVerifier,
      "--metadata",
      metadataPath,
      "--name",
      "@smartergpt/lex-mcp",
      "--version",
      "4.0.2",
      "--lex-version",
      "4.0.2",
    ];

    await writeFile(metadataPath, JSON.stringify(metadata));
    const accepted = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(accepted.status, 0, accepted.stderr);

    delete metadata["dist.integrity"];
    metadata.dist = {
      integrity: `sha512-${Buffer.from("b".repeat(128), "hex").toString("base64")}`,
    };
    await writeFile(metadataPath, JSON.stringify(metadata));
    const rejected = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /does not expose the exact reviewed Lex dependency edge/);

    delete metadata.dist;
    metadata["dist.integrity"] = `sha512-${Buffer.from("c".repeat(128), "hex").toString("base64")}`;
    metadata.dependencies["@smartergpt/lex"] = "4.0.1";
    await writeFile(metadataPath, JSON.stringify(metadata));
    const wrongDependency = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.notEqual(wrongDependency.status, 0);
    assert.match(wrongDependency.stderr, /does not expose the exact reviewed Lex dependency edge/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("npm provenance policy binds package bytes to the protected source workflow", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lex-npm-provenance-"));
  try {
    const integrity = `sha512-${Buffer.from("a".repeat(128), "hex").toString("base64")}`;
    const statement = {
      predicateType: "https://slsa.dev/provenance/v1",
      subject: [
        {
          name: "pkg:npm/%40smartergpt/lex@4.0.2",
          digest: { sha512: "a".repeat(128) },
        },
      ],
      predicate: {
        buildDefinition: {
          buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
          externalParameters: {
            workflow: {
              repository: "https://github.com/Guffawaffle/lex",
              path: ".github/workflows/release.yml",
              ref: "refs/heads/main",
            },
          },
          internalParameters: { github: { event_name: "workflow_dispatch" } },
          resolvedDependencies: [
            {
              uri: "git+https://github.com/Guffawaffle/lex@refs/heads/main",
              digest: { gitCommit: "b".repeat(40) },
            },
          ],
        },
        runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" } },
      },
    };
    const audit = {
      invalid: [],
      missing: [],
      verified: [
        {
          name: "@smartergpt/lex",
          version: "4.0.2",
          registry: "https://registry.npmjs.org/",
          attestationBundles: [
            {
              predicateType: "https://slsa.dev/provenance/v1",
              bundle: {
                dsseEnvelope: {
                  payload: Buffer.from(JSON.stringify(statement)).toString("base64"),
                },
              },
            },
          ],
        },
      ],
    };
    const auditPath = path.join(root, "audit.json");
    await writeFile(auditPath, JSON.stringify(audit));
    const args = [
      provenanceVerifier,
      "--audit",
      auditPath,
      "--name",
      "@smartergpt/lex",
      "--version",
      "4.0.2",
      "--integrity",
      integrity,
      "--repository",
      "https://github.com/Guffawaffle/lex",
      "--workflow",
      ".github/workflows/release.yml",
      "--ref",
      "refs/heads/main",
      "--commit",
      "b".repeat(40),
    ];
    assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 0);

    statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "c".repeat(40);
    audit.verified[0].attestationBundles[0].bundle.dsseEnvelope.payload = Buffer.from(
      JSON.stringify(statement)
    ).toString("base64");
    await writeFile(auditPath, JSON.stringify(audit));
    const rejected = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /expected source commit/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MCP Registry workflow repeats exact signed authority at the protected boundary", async () => {
  const workflow = await readFile(mcpWorkflowPath, "utf8");
  const uses = [...workflow.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/gmu)].map((match) => match[1]);
  assert.ok(uses.length >= 6);
  for (const action of uses) {
    assert.match(action, /@[a-f0-9]{40}$/u, `${action} is not pinned to an exact commit`);
  }
  for (const checkout of workflow.matchAll(
    /uses: actions\/checkout@[a-f0-9]{40}([\s\S]*?)(?=\n\s*- (?:name:|uses:)|$)/gu
  )) {
    assert.match(checkout[1], /persist-credentials: false/u);
  }
  for (const output of [
    "version",
    "tag_name",
    "tag_object",
    "target_commit",
    "main_snapshot",
    "tag_signer",
    "commit_signer",
    "should_publish",
  ]) {
    assert.ok(
      workflow.includes(`      ${output}: \${{ steps.authority.outputs.${output} }}`),
      `${output} is missing from the held authority tuple`
    );
  }
  assert.match(workflow, /ref: \$\{\{ needs\.validate\.outputs\.target_commit \}\}/u);
  assert.equal((workflow.match(/verify-release-tag\.mjs/gu) ?? []).length, 2);
  assert.equal((workflow.match(/verify-release-signatures\.mjs/gu) ?? []).length, 2);
  assert.ok((workflow.match(/verify-mcp-registry-contract\.mjs/gu) ?? []).length >= 2);
  assert.ok((workflow.match(/TRUSTED_RELEASE_FINGERPRINTS/gu) ?? []).length >= 4);
  assert.ok((workflow.match(/TRUSTED_COMMIT_FINGERPRINTS/gu) ?? []).length >= 4);

  const finalStep = workflow.slice(
    workflow.indexOf("Authenticate, re-check remote authority, and publish")
  );
  assert.match(finalStep, /mcp-publisher login[\s\S]*git ls-remote[\s\S]*mcp-publisher publish/u);
});

test("release tag policy rejects an annotated tag object aliased under another ref", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lex-release-tag-"));
  try {
    git(root, ["init"]);
    await writeFile(path.join(root, "fixture.txt"), "release fixture\n");
    git(root, ["add", "fixture.txt"]);
    git(root, [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "user.name=Lex Test",
      "-c",
      "user.email=lex-test@example.invalid",
      "commit",
      "-m",
      "release fixture",
    ]);
    git(root, [
      "-c",
      "tag.gpgSign=false",
      "-c",
      "user.name=Lex Test",
      "-c",
      "user.email=lex-test@example.invalid",
      "tag",
      "-a",
      "v4.0.1",
      "-m",
      "annotated fixture",
    ]);
    const target = git(root, ["rev-parse", "HEAD"]).stdout.trim();
    const tagObject = git(root, ["rev-parse", "refs/tags/v4.0.1"]).stdout.trim();
    git(root, ["update-ref", "refs/tags/v4.0.2", tagObject]);

    const accepted = spawnSync(process.execPath, [verifier, "v4.0.1", target], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(accepted.status, 0, accepted.stderr);
    const aliased = spawnSync(process.execPath, [verifier, "v4.0.2", target], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(aliased.status, 0);
    assert.match(aliased.stderr, /embeds "v4\.0\.1", expected "v4\.0\.2"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release signature policy binds exact object-specific signers", async () => {
  const tagFingerprint = "A".repeat(40);
  const commitFingerprint = "B".repeat(40);
  const tagLine = `[GNUPG:] VALIDSIG ${tagFingerprint} 2026-08-24 0 4 0 1 8 00 ${tagFingerprint}`;
  const commitLine = `[GNUPG:] VALIDSIG ${commitFingerprint} 2026-08-24 0 4 0 1 8 00 ${commitFingerprint}`;
  assert.equal(
    requireAuthorizedSignature({
      kind: "Release tag",
      output: tagLine,
      status: 0,
      authorizedFingerprints: parseAuthorizedFingerprints(tagFingerprint),
    }),
    tagFingerprint
  );
  assert.throws(
    () =>
      requireAuthorizedSignature({
        kind: "Release commit",
        output: commitLine,
        status: 0,
        authorizedFingerprints: parseAuthorizedFingerprints(tagFingerprint),
      }),
    /signer fingerprint is not authorized/
  );
  assert.deepEqual(parseValidSignatures(`${tagLine}\n${tagLine}`), [
    tagFingerprint,
    tagFingerprint,
  ]);

  const root = await mkdtemp(path.join(os.tmpdir(), "lex-release-output-"));
  try {
    const output = path.join(root, "github-output.txt");
    writeGitHubSignerOutputs(output, tagFingerprint, commitFingerprint);
    assert.equal(
      await readFile(output, "utf8"),
      formatGitHubSignerOutputs(tagFingerprint, commitFingerprint)
    );
    assert.throws(
      () => formatGitHubSignerOutputs("", commitFingerprint),
      /exact uppercase 40-hex fingerprints/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
