import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import Database from "better-sqlite3-multiple-ciphers";

import {
  LOCAL_REGISTRY_APPLICATION_ID,
  LOCAL_REGISTRY_SCHEMA_VERSION,
  LocalRegistryError,
  SqliteLocalBindingRegistry,
  detectExecutionSurface,
  type AuthorityVersion,
  type BindingId,
  type BindingReceiptId,
  type CachedAuthorityEvidenceV1,
  type ContentDigest,
  type ExecutionSurfaceId,
  type LocalRegistryIdFactoryV1,
  type PrincipalId,
  type RegistryInstanceId,
  type RepositoryDeclarationV1,
  type RepositoryId,
  type RepositoryInstanceEvidenceV1,
  type RepositoryInstanceId,
  type RepositorySlug,
  type TenantId,
  type WorkspaceId,
  type WorkspaceInstanceId,
} from "../../../src/shared/runtime-scope/index.js";

const NOW = "2026-07-18T05:00:00.000Z";
const EXPIRES = "2026-07-18T06:00:00.000Z";

function ids(prefix: string) {
  return {
    registryInstanceId: `${prefix}-registry` as RegistryInstanceId,
    executionSurfaceId: `${prefix}-surface` as ExecutionSurfaceId,
    tenantId: "tenant-platform" as TenantId,
    workspaceId: "workspace-lex" as WorkspaceId,
    repositoryId: "repository-lex" as RepositoryId,
    workspaceInstanceId: `${prefix}-workspace-instance` as WorkspaceInstanceId,
    repositoryInstanceId: `${prefix}-repository-instance` as RepositoryInstanceId,
    principalId: "principal-guff" as PrincipalId,
  };
}

function deterministicIds(prefix: string): LocalRegistryIdFactoryV1 {
  let binding = 0;
  let receipt = 0;
  return {
    bindingId: () => `${prefix}-binding-${++binding}` as BindingId,
    receiptId: () => `${prefix}-receipt-${++receipt}` as BindingReceiptId,
  };
}

function authority(overrides: Partial<CachedAuthorityEvidenceV1> = {}): CachedAuthorityEvidenceV1 {
  return {
    schemaVersion: 1,
    authoritySource: "authority:test",
    authorityVersion: "authority-v1" as AuthorityVersion,
    authorityDigest: "sha256:authority" as ContentDigest,
    verifiedAt: NOW,
    expiresAt: EXPIRES,
    ...overrides,
  };
}

const declaration: RepositoryDeclarationV1 = {
  schemaVersion: 1,
  repositoryId: "repository-lex" as RepositoryId,
  repositorySlug: "lex" as RepositorySlug,
};

function evidence(root: string): RepositoryInstanceEvidenceV1 {
  return {
    schemaVersion: 1,
    canonicalRoot: root,
    manifestDigest: "sha256:manifest" as ContentDigest,
    gitCommonDirectoryDigest: "sha256:git-common" as ContentDigest,
    filesystemEvidenceDigest: "sha256:filesystem" as ContentDigest,
    provider: {
      provider: "github",
      providerRepositoryId: "Guffawaffle/lex",
      remoteDigest: "sha256:remote" as ContentDigest,
    },
  };
}

function registerRequest(prefix: string, root: string) {
  const identity = ids(prefix);
  return {
    tenantId: identity.tenantId,
    workspaceId: identity.workspaceId,
    repositoryId: identity.repositoryId,
    repositoryInstanceId: identity.repositoryInstanceId,
    workspaceInstanceId: identity.workspaceInstanceId,
    evidence: evidence(root),
    authorityEvidence: authority(),
    registeredByPrincipalId: identity.principalId,
  };
}

function withTempRegistry(
  prefix: string,
  run: (context: {
    root: string;
    databasePath: string;
    registry: SqliteLocalBindingRegistry;
    surface: ReturnType<typeof detectExecutionSurface>;
  }) => Promise<void>
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), `lex-local-registry-${prefix}-`));
  const databasePath = join(root, "registry.db");
  const identity = ids(prefix);
  const surface = detectExecutionSurface({
    platform: "linux",
    installationRef: `${prefix}-installation`,
    wslDistribution: "Ubuntu-24.04",
  });
  const registry = SqliteLocalBindingRegistry.initialize({
    databasePath,
    registryInstanceId: identity.registryInstanceId,
    executionSurfaceId: identity.executionSurfaceId,
    executionSurface: surface,
    createdAt: NOW,
    now: () => NOW,
    idFactory: deterministicIds(prefix),
  });

  return run({ root, databasePath, registry, surface }).finally(() => {
    try {
      registry.close();
    } catch {
      // A test may close the original handle before reopening it.
    }
    rmSync(root, { recursive: true, force: true });
  });
}

describe("SQLite local binding registry", () => {
  test("initializes a separate versioned SQLite application and reopens read-only", async () => {
    await withTempRegistry("schema", async ({ databasePath, registry, surface }) => {
      assert.deepEqual(await registry.inspectBindings(), []);
      registry.close();

      const raw = new Database(databasePath, { readonly: true, fileMustExist: true });
      try {
        assert.equal(raw.pragma("application_id", { simple: true }), LOCAL_REGISTRY_APPLICATION_ID);
        assert.equal(raw.pragma("user_version", { simple: true }), LOCAL_REGISTRY_SCHEMA_VERSION);
        const tables = raw
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all() as Array<{ name: string }>;
        assert.deepEqual(
          tables.map(({ name }) => name),
          [
            "binding_events",
            "local_registry_identity",
            "local_registry_migrations",
            "repository_bindings",
          ]
        );
      } finally {
        raw.close();
      }

      const reopened = SqliteLocalBindingRegistry.open({
        databasePath,
        executionSurface: surface,
      });
      try {
        assert.equal(reopened.access, "read-only");
        assert.deepEqual(await reopened.inspectBindings(), []);
        await assert.rejects(
          reopened.registerBinding(registerRequest("schema", "/srv/lex")),
          (error: unknown) =>
            error instanceof LocalRegistryError && error.code === "REGISTRY_READ_ONLY"
        );
      } finally {
        reopened.close();
      }
    });
  });

  test("registers, finds, verifies, rebinds, revokes, and audits explicitly", async () => {
    await withTempRegistry("lifecycle", async ({ registry }) => {
      const identity = ids("lifecycle");
      const receipt = await registry.registerBinding(registerRequest("lifecycle", "/srv/lex"));
      assert.equal(receipt.bindingId, "lifecycle-binding-1");
      assert.equal("action" in receipt, false);

      const found = await registry.findRepositoryInstances({
        projectRoot: "/srv/lex",
        repositoryDeclaration: declaration,
        evidence: evidence("/srv/lex"),
      });
      assert.equal(found.length, 1);
      assert.equal(found[0]?.repositoryId, identity.repositoryId);

      const verified = await registry.verifyBinding({
        binding: found[0]!,
        declaration,
        evidence: evidence("/srv/lex"),
        authorityEvidence: authority(),
        verifiedAt: NOW,
      });
      assert.equal(verified.status, "verified");
      assert.deepEqual(verified.reasons, []);

      const mismatch = await registry.verifyBinding({
        binding: found[0]!,
        declaration,
        evidence: evidence("/srv/other"),
        authorityEvidence: authority(),
        verifiedAt: NOW,
      });
      assert.equal(mismatch.status, "mismatch");
      assert.deepEqual(mismatch.reasons, ["canonical-root-mismatch"]);

      const rebind = await registry.rebindBinding({
        bindingId: receipt.bindingId,
        declaration,
        evidence: evidence("/srv/lex-moved"),
        authorityEvidence: authority(),
        reboundByPrincipalId: identity.principalId,
        reboundAt: "2026-07-18T05:05:00.000Z",
        reason: "Checkout moved by an explicit administrative operation.",
      });
      assert.equal(rebind.action, "rebind");

      const rebound = await registry.inspectBindings({ bindingId: receipt.bindingId });
      assert.equal(rebound[0]?.evidence.canonicalRoot, "/srv/lex-moved");
      assert.equal(rebound[0]?.repositoryInstanceId, identity.repositoryInstanceId);
      assert.equal(rebound[0]?.workspaceInstanceId, identity.workspaceInstanceId);

      await registry.revokeBinding({
        bindingId: receipt.bindingId,
        revokedByPrincipalId: identity.principalId,
        revokedAt: "2026-07-18T05:10:00.000Z",
        reason: "Explicit test revocation.",
      });
      assert.equal(
        (await registry.inspectBindings({ bindingId: receipt.bindingId }))[0]?.state,
        "revoked"
      );
      assert.deepEqual(
        (await registry.inspectReceipts(receipt.bindingId)).map(({ action }) => action),
        ["register", "rebind", "revoke"]
      );
      assert.deepEqual(
        await registry.findRepositoryInstances({
          projectRoot: "/srv/lex-moved",
          repositoryDeclaration: declaration,
          evidence: evidence("/srv/lex-moved"),
        }),
        []
      );
    });
  });

  test("fails closed for expired and revoked cached authority", async () => {
    await withTempRegistry("authority", async ({ registry }) => {
      await assert.rejects(
        registry.registerBinding({
          ...registerRequest("authority", "/srv/lex"),
          authorityEvidence: authority({ expiresAt: NOW }),
        }),
        /Cached authority is expired/
      );

      const receipt = await registry.registerBinding(registerRequest("authority", "/srv/lex"));
      const [binding] = await registry.inspectBindings({ bindingId: receipt.bindingId });
      assert.ok(binding);

      assert.equal(
        (
          await registry.verifyBinding({
            binding,
            declaration,
            evidence: evidence("/srv/lex"),
            authorityEvidence: authority({ expiresAt: NOW }),
            verifiedAt: NOW,
          })
        ).status,
        "authority-expired"
      );
      assert.equal(
        (
          await registry.verifyBinding({
            binding,
            declaration,
            evidence: evidence("/srv/lex"),
            authorityEvidence: authority({ revokedAt: NOW }),
            verifiedAt: NOW,
          })
        ).status,
        "authority-revoked"
      );
    });
  });

  test("does not accept an untrusted declaration as the sole rebind evidence", async () => {
    await withTempRegistry("weak-rebind", async ({ registry }) => {
      const identity = ids("weak-rebind");
      const receipt = await registry.registerBinding({
        ...registerRequest("weak-rebind", "/srv/lex"),
        evidence: { schemaVersion: 1, canonicalRoot: "/srv/lex" },
      });

      await assert.rejects(
        registry.rebindBinding({
          bindingId: receipt.bindingId,
          declaration,
          evidence: { schemaVersion: 1, canonicalRoot: "/srv/lex-moved" },
          authorityEvidence: authority(),
          reboundByPrincipalId: identity.principalId,
          reboundAt: "2026-07-18T05:05:00.000Z",
          reason: "Attempted declaration-only rebind.",
        }),
        /requires stable provider, Git common-directory, or filesystem evidence/
      );
      assert.equal(
        (await registry.inspectBindings({ bindingId: receipt.bindingId }))[0]?.evidence
          .canonicalRoot,
        "/srv/lex"
      );
    });
  });

  test("rejects a copied registry on another surface", async () => {
    await withTempRegistry("copied", async ({ databasePath, registry }) => {
      registry.close();
      const otherSurface = detectExecutionSurface({
        platform: "linux",
        installationRef: "debian-installation",
        wslDistribution: "Debian",
      });

      assert.throws(
        () =>
          SqliteLocalBindingRegistry.open({
            databasePath,
            executionSurface: otherSurface,
          }),
        (error: unknown) =>
          error instanceof LocalRegistryError && error.code === "REGISTRY_SURFACE_MISMATCH"
      );
    });
  });

  test("refuses to initialize inside an unrelated SQLite database", () => {
    const root = mkdtempSync(join(tmpdir(), "lex-local-registry-unrelated-"));
    const databasePath = join(root, "memory.db");
    const raw = new Database(databasePath);
    raw.exec("CREATE TABLE frames (id TEXT PRIMARY KEY)");
    raw.close();
    const before = new Database(databasePath, { readonly: true });
    const applicationIdBefore = before.pragma("application_id", { simple: true });
    before.close();

    try {
      const identity = ids("unrelated");
      assert.throws(
        () =>
          SqliteLocalBindingRegistry.initialize({
            databasePath,
            registryInstanceId: identity.registryInstanceId,
            executionSurfaceId: identity.executionSurfaceId,
            executionSurface: detectExecutionSurface({
              platform: "linux",
              installationRef: "unrelated-installation",
            }),
            createdAt: NOW,
          }),
        (error: unknown) =>
          error instanceof LocalRegistryError && error.code === "REGISTRY_SCHEMA_INCOMPATIBLE"
      );

      const after = new Database(databasePath, { readonly: true });
      try {
        assert.equal(after.pragma("application_id", { simple: true }), applicationIdBefore);
        const tables = after
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all() as Array<{ name: string }>;
        assert.deepEqual(
          tables.map(({ name }) => name),
          ["frames"]
        );
      } finally {
        after.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("blocks newer local-registry schemas without migrating them", async () => {
    await withTempRegistry("newer", async ({ databasePath, registry, surface }) => {
      registry.close();
      const raw = new Database(databasePath);
      raw
        .prepare("INSERT INTO local_registry_migrations (version, applied_at) VALUES (?, ?)")
        .run(LOCAL_REGISTRY_SCHEMA_VERSION + 1, NOW);
      raw.close();

      assert.throws(
        () => SqliteLocalBindingRegistry.open({ databasePath, executionSurface: surface }),
        (error: unknown) =>
          error instanceof LocalRegistryError && error.code === "REGISTRY_SCHEMA_INCOMPATIBLE"
      );
    });
  });
});
