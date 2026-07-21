import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { semanticErrors, validateManifest } from "../../scripts/validate-ecosystem-release.mjs";

const manifestUrl = new URL("../../releases/ecosystem-3.1.json", import.meta.url);

async function draftManifest() {
  return JSON.parse(await readFile(manifestUrl, "utf8"));
}

test("the checked-in draft manifest is structurally and semantically valid", async () => {
  const manifest = await draftManifest();
  assert.deepEqual(await validateManifest(manifest), []);
});

test("the semantic validator requires every ecosystem component", async () => {
  const manifest = await draftManifest();
  manifest.components = manifest.components.filter((component) => component.id !== "lexsona");
  assert.match(semanticErrors(manifest).join("\n"), /missing required components: lexsona/);
});

test("Lex and Lex-MCP target versions must remain exact", async () => {
  const manifest = await draftManifest();
  const wrapper = manifest.components.find((component) => component.id === "lex-mcp");
  wrapper.package.targetVersion = "3.1.1";
  assert.match(semanticErrors(manifest).join("\n"), /target versions must match exactly/);
});

test("sealed manifests require immutable package, source, gate, and evidence receipts", async () => {
  const manifest = await draftManifest();
  manifest.state = "sealed";
  const errors = await validateManifest(manifest, { requireSealed: true });
  assert.ok(errors.some((error) => error.includes("lexsona must be verified")));
  assert.ok(errors.some((error) => error.includes("package evidence is incomplete")));
  assert.ok(errors.some((error) => error.includes("required gate node-24 must pass")));
});

test("a fully evidenced manifest can be sealed", async () => {
  const manifest = await draftManifest();
  manifest.state = "sealed";

  for (const [index, component] of manifest.components.entries()) {
    component.status = "verified";
    component.source.commit = String(index + 1).padStart(40, "0");
    component.source.tag = component.package ? `${component.id}-verified` : null;
    component.evidence = [`https://github.com/Guffawaffle/lex/issues/${780 + index}`];
    if (component.package) {
      component.package.targetVersion ??= `1.${index}.0`;
      component.package.publishedVersion = component.package.targetVersion;
      component.package.integrity = "sha512-YWJjZA==";
    }
  }

  const lex = manifest.components.find((component) => component.id === "lex");
  const wrapper = manifest.components.find((component) => component.id === "lex-mcp");
  wrapper.package.targetVersion = lex.package.targetVersion;
  wrapper.package.publishedVersion = lex.package.targetVersion;

  for (const gate of manifest.gates) {
    gate.status = "passed";
    gate.evidence = ["https://github.com/Guffawaffle/lex/issues/780"];
  }

  assert.deepEqual(await validateManifest(manifest, { requireSealed: true }), []);
});

test("--sealed semantics reject a valid draft", async () => {
  const manifest = await draftManifest();
  assert.match(semanticErrors(manifest, { requireSealed: true }).join("\n"), /must be sealed/);
});
