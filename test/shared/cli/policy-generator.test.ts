import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AXErrorException } from "../../../src/shared/errors/ax-error.js";
import { policyGenerate } from "../../../src/shared/cli/policy-generate.js";
import { discoverModules, generatePolicyFile } from "../../../src/shared/cli/policy-generator.js";
import { validatePolicySchema } from "../../../src/shared/policy/schema.js";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "lex-policy-generator-"));
  roots.push(root);
  return root;
}

function code(root: string, relativePath: string, content = "// fixture\n"): void {
  const target = join(root, relativePath);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, content);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discovers legacy TypeScript and JavaScript modules", () => {
  const root = fixture();
  code(root, "src/api/index.ts");
  code(root, "src/scripts/tool.py");
  code(root, "src/web/index.jsx");

  assert.deepEqual(
    discoverModules({ rootDir: root }).map((module) => module.id),
    ["api", "scripts", "web"]
  );
});

test("recognizes C and C++ implementation and header extensions", () => {
  const root = fixture();
  for (const extension of [
    "c",
    "cc",
    "cpp",
    "cxx",
    "c++",
    "h",
    "hh",
    "hpp",
    "hxx",
    "h++",
    "inc",
    "inl",
    "ipp",
    "tpp",
  ]) {
    code(root, `native/src/core/file.${extension}`);
  }

  const [module] = discoverModules({ rootDir: root });
  assert.equal(module.id, "native/core");
  assert.deepEqual(module.ownsPaths, ["native/src/core/*"]);
});

test("recognizes Objective-C++ and C++ module interfaces", () => {
  const root = fixture();
  for (const extension of ["m", "mm", "ixx", "cppm", "mpp", "ccm", "cxxm"]) {
    code(root, `platform/src/bridge/file.${extension}`);
  }

  assert.deepEqual(
    discoverModules({ rootDir: root }).map((module) => module.id),
    ["platform/bridge"]
  );
});

test("retains Swift and protobuf neighbors in mixed native repositories", () => {
  const root = fixture();
  code(root, "launcher/src/view-model/state.swift");
  code(root, "mods/src/protocol/events.proto");

  assert.deepEqual(
    discoverModules({ rootDir: root }).map((module) => module.id),
    ["launcher/view-model", "mods/protocol"]
  );
});

test("discovers nested repository roots instead of assuming root src", () => {
  const root = fixture();
  code(root, "mods/src/patches/patch.cc");
  code(root, "win-proxy-dll/src/main.cc");
  code(root, "tests/tools/decode.cc");

  assert.deepEqual(
    discoverModules({ rootDir: root }).map((module) => module.id),
    ["mods/patches", "tests/tools", "win-proxy-dll"]
  );
});

test("pairs equivalent src and include directories", () => {
  const root = fixture();
  code(root, "engine/src/math/vector.cpp");
  code(root, "engine/include/math/vector.hpp");

  const [module] = discoverModules({ rootDir: root });
  assert.equal(module.id, "engine/math");
  assert.deepEqual(module.ownsPaths, ["engine/include/math/*", "engine/src/math/*"]);
  assert.equal(module.description, "Auto-detected from engine/include/math/, engine/src/math/");
});

test("uses non-overlapping direct-directory ownership for nested modules", () => {
  const root = fixture();
  code(root, "mods/src/patches/root.cc");
  code(root, "mods/src/patches/parts/nested.cc");

  const policy = generatePolicyFile(discoverModules({ rootDir: root }));
  assert.deepEqual(policy.modules["mods/patches"].owns_paths, ["mods/src/patches/*"]);
  assert.deepEqual(policy.modules["mods/patches/parts"].owns_paths, ["mods/src/patches/parts/*"]);
  assert.ok(!policy.modules["mods/patches"].owns_paths[0].includes("**"));
});

test("excludes dependency, build, cache, and generated-output roots", () => {
  const root = fixture();
  code(root, "src/owned/main.cpp");
  for (const excluded of [
    "node_modules",
    "vendor",
    "deps",
    "third_party",
    "external",
    "xmake-packages",
    "vcpkg_installed",
    "build",
    "dist",
    "out",
    "target",
    "coverage",
    "generated",
    "_deps",
    "cache",
    "tmp",
  ]) {
    code(root, `${excluded}/foreign/file.cpp`);
  }

  assert.deepEqual(
    discoverModules({ rootDir: root }).map((module) => module.id),
    ["owned"]
  );
});

test("excludes hidden roots", () => {
  const root = fixture();
  code(root, ".cache/native/file.cpp");
  code(root, ".private/file.cpp");
  code(root, "src/public/file.cpp");

  assert.deepEqual(
    discoverModules({ rootDir: root }).map((module) => module.id),
    ["public"]
  );
});

test("ignores documentation and configuration-only directories", () => {
  const root = fixture();
  code(root, "docs/README.md");
  code(root, "config/settings.json", "{}");

  assert.deepEqual(discoverModules({ rootDir: root }), []);
});

test("normalizes uppercase and punctuation in module IDs", () => {
  const root = fixture();
  code(root, "MacOS Launcher/src/View Model/main.mm");

  const [module] = discoverModules({ rootDir: root });
  assert.equal(module.id, "macos-launcher/view-model");
  assert.deepEqual(module.ownsPaths, ["MacOS Launcher/src/View Model/*"]);
});

test("trims repeated edge punctuation in linear time", () => {
  const root = fixture();
  code(root, "----Native API----/src/----Core----/main.cpp");

  const [module] = discoverModules({ rootDir: root });
  assert.equal(module.id, "native-api/core");
  assert.deepEqual(module.ownsPaths, ["----Native API----/src/----Core----/*"]);
});

test("constrained src-dir discovery preserves legacy relative IDs", () => {
  const root = fixture();
  code(root, "packages/native/src/core/main.cpp");
  code(root, "elsewhere/src/ignored/main.cpp");

  const modules = discoverModules({ rootDir: root, srcDir: "packages/native/src" });
  assert.deepEqual(
    modules.map((module) => module.id),
    ["core"]
  );
  assert.deepEqual(modules[0].ownsPaths, ["packages/native/src/core/*"]);
});

test("missing constrained src-dir produces an empty policy", () => {
  const root = fixture();
  assert.deepEqual(discoverModules({ rootDir: root, srcDir: "missing" }), []);
});

test("rejects an absolute constrained src-dir", () => {
  const root = fixture();
  const absoluteSource = join(root, "src");

  assert.throws(
    () => discoverModules({ rootDir: root, srcDir: absoluteSource }),
    (error: unknown) =>
      error instanceof AXErrorException &&
      error.toAXError().code === "POLICY_SOURCE_DIR_OUTSIDE_ROOT"
  );
});

test("rejects a constrained src-dir that escapes the repository", () => {
  const root = fixture();

  assert.throws(
    () => discoverModules({ rootDir: root, srcDir: "../outside" }),
    (error: unknown) =>
      error instanceof AXErrorException &&
      error.toAXError().code === "POLICY_SOURCE_DIR_OUTSIDE_ROOT"
  );
});

test("rejects a constrained src-dir symlink that escapes the repository", () => {
  const root = fixture();
  const outside = fixture();
  code(outside, "src/core/main.cpp");
  symlinkSync(
    join(outside, "src"),
    join(root, "linked-src"),
    process.platform === "win32" ? "junction" : "dir"
  );

  assert.throws(
    () => discoverModules({ rootDir: root, srcDir: "linked-src" }),
    (error: unknown) =>
      error instanceof AXErrorException &&
      error.toAXError().code === "POLICY_SOURCE_DIR_OUTSIDE_ROOT"
  );
});

test("direct root code uses a stable root module", () => {
  const root = fixture();
  code(root, "main.cpp");

  const [module] = discoverModules({ rootDir: root });
  assert.equal(module.id, "root");
  assert.deepEqual(module.ownsPaths, ["*"]);
  assert.equal(module.description, "Auto-detected from ./");
});

test("generated module IDs and ownership paths are byte deterministic", () => {
  const root = fixture();
  code(root, "zeta/src/z.cpp");
  code(root, "alpha/src/a.cpp");
  code(root, "alpha/include/a.hpp");

  const first = `${JSON.stringify(generatePolicyFile(discoverModules({ rootDir: root })), null, 2)}\n`;
  const second = `${JSON.stringify(generatePolicyFile(discoverModules({ rootDir: root })), null, 2)}\n`;
  assert.equal(first, second);
  assert.deepEqual(Object.keys(JSON.parse(first).modules), ["alpha", "zeta"]);
});

test("generated policy passes canonical runtime schema validation", () => {
  const root = fixture();
  code(root, "native/src/core/main.cpp");

  const validation = validatePolicySchema(generatePolicyFile(discoverModules({ rootDir: root })));
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test("standalone generation writes the canonical default output", async () => {
  const root = fixture();
  code(root, "native/src/core/main.cpp");

  const result = await policyGenerate({ rootDir: root, json: true });
  assert.equal(result.modulesDiscovered, 1);
  assert.ok(existsSync(join(root, ".smartergpt/lex/lexmap.policy.json")));
  const policy = JSON.parse(readFileSync(join(root, ".smartergpt/lex/lexmap.policy.json"), "utf8"));
  assert.deepEqual(policy.modules["native/core"].owns_paths, ["native/src/core/*"]);
});

test("standalone generation refuses overwrite unless force is explicit", async () => {
  const root = fixture();
  code(root, "native/src/core/main.cpp");
  const outputPath = join(root, "policy.json");
  writeFileSync(outputPath, '{"sentinel":true}\n');

  await assert.rejects(
    policyGenerate({ rootDir: root, policyPath: outputPath, json: true }),
    (error: unknown) =>
      error instanceof AXErrorException && error.toAXError().code === "POLICY_ALREADY_EXISTS"
  );
  assert.equal(readFileSync(outputPath, "utf8"), '{"sentinel":true}\n');

  await policyGenerate({
    rootDir: root,
    policyPath: outputPath,
    force: true,
    json: true,
  });
  assert.ok(JSON.parse(readFileSync(outputPath, "utf8")).modules["native/core"]);
});

test("standalone generation accepts a custom nested output", async () => {
  const root = fixture();
  code(root, "src/core/main.cpp");

  const result = await policyGenerate({
    rootDir: root,
    policyPath: "artifacts/policy/generated.json",
    json: true,
  });
  assert.equal(result.policyPath, join(root, "artifacts/policy/generated.json"));
  assert.ok(existsSync(result.policyPath));
});
