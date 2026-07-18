import {
  WORKSPACE_AUTHORITY_ERROR_CODES,
  type WorkspaceAuthorityErrorCode,
} from "../errors/error-codes.js";
import type { ExecutionSurfaceKind, LaunchOrigin, NativePlatform } from "./bindings.js";
import type {
  ExecutionSurfaceId,
  PrincipalId,
  RegistryInstanceId,
  RepositoryId,
  RepositoryInstanceId,
  TenantId,
  WorkspaceId,
  WorkspaceInstanceId,
} from "./ids.js";

export const RUNTIME_SCOPE_CONFORMANCE_VERSION = 1 as const;

export type RuntimeScopeConformanceFixtureId =
  | "cached-grant-expired"
  | "conflicting-binding-evidence"
  | "copied-registry-no-authority"
  | "diagnostic-observability-only"
  | "edited-manifest-no-authority"
  | "environment-selector-no-authority"
  | "fork-declaration-mismatch"
  | "missing-repository-declaration"
  | "moved-checkout-explicit-rebind"
  | "multiple-wsl-registries"
  | "same-checkout-cross-surface"
  | "separate-registry-files"
  | "verified-clone-new-instance"
  | "windows-process-via-wsl-interop"
  | "worktree-new-instance";

export interface ConformanceCanonicalIdentityV1 {
  readonly principalId: PrincipalId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly repositoryId: RepositoryId;
}

export interface ConformanceLocalIdentityV1 {
  readonly executionSurfaceId: ExecutionSurfaceId;
  readonly registryInstanceId: RegistryInstanceId;
  readonly workspaceInstanceId: WorkspaceInstanceId;
  readonly repositoryInstanceId: RepositoryInstanceId;
}

export interface ConformanceSurfaceV1 {
  readonly ref: string;
  readonly nativePlatform: NativePlatform;
  readonly kind: ExecutionSurfaceKind;
  readonly launchOrigin: LaunchOrigin;
  readonly wslDistribution?: string;
  readonly projectRoot: string;
  readonly registryPath: string;
  readonly canonical?: ConformanceCanonicalIdentityV1;
  readonly local: ConformanceLocalIdentityV1;
}

export type ConformanceResolutionResult = "resolved" | "fail-closed" | "explicit-rebind";
export type ConformanceIdentityRelation =
  "shared" | "distinct" | "preserved" | "not-created" | "not-applicable";

export interface RuntimeScopeConformanceExpectationV1 {
  readonly result: ConformanceResolutionResult;
  readonly errorCode?: WorkspaceAuthorityErrorCode;
  readonly selectedRegistryRef?: string;
  readonly canonicalIdentity: ConformanceIdentityRelation;
  readonly localIdentity: ConformanceIdentityRelation;
  readonly bindingMutation: "none" | "explicit-only";
  readonly diagnosticChangesOutcome: false;
}

/**
 * Data-only behavior fixture. Implementations adapt these cases to their own
 * test harness; the fixtures never open a registry or inspect ambient state.
 */
export interface RuntimeScopeConformanceFixtureV1 {
  readonly schemaVersion: typeof RUNTIME_SCOPE_CONFORMANCE_VERSION;
  readonly id: RuntimeScopeConformanceFixtureId;
  readonly requirement: string;
  readonly surfaces: readonly ConformanceSurfaceV1[];
  readonly given: readonly string[];
  readonly when: string;
  readonly expected: RuntimeScopeConformanceExpectationV1;
}

const canonical = {
  principalId: "01900000-0000-7000-8000-000000000001" as PrincipalId,
  tenantId: "01900000-0000-7000-8000-000000000002" as TenantId,
  workspaceId: "01900000-0000-7000-8000-000000000003" as WorkspaceId,
  repositoryId: "01900000-0000-7000-8000-000000000004" as RepositoryId,
} as const satisfies ConformanceCanonicalIdentityV1;

const windowsSurface: ConformanceSurfaceV1 = {
  ref: "windows",
  nativePlatform: "win32",
  kind: "windows-native",
  launchOrigin: "native-shell",
  projectRoot: "C:\\dev\\lex",
  registryPath: "%LOCALAPPDATA%\\Lex\\registry.db",
  canonical,
  local: {
    executionSurfaceId: "01900000-0000-7000-8000-000000000101" as ExecutionSurfaceId,
    registryInstanceId: "01900000-0000-7000-8000-000000000102" as RegistryInstanceId,
    workspaceInstanceId: "01900000-0000-7000-8000-000000000103" as WorkspaceInstanceId,
    repositoryInstanceId: "01900000-0000-7000-8000-000000000104" as RepositoryInstanceId,
  },
};

const ubuntuSurface: ConformanceSurfaceV1 = {
  ref: "wsl-ubuntu",
  nativePlatform: "linux",
  kind: "wsl",
  launchOrigin: "native-shell",
  wslDistribution: "Ubuntu-24.04",
  projectRoot: "/mnt/c/dev/lex",
  registryPath: "$XDG_STATE_HOME/lex/registry.db",
  canonical,
  local: {
    executionSurfaceId: "01900000-0000-7000-8000-000000000201" as ExecutionSurfaceId,
    registryInstanceId: "01900000-0000-7000-8000-000000000202" as RegistryInstanceId,
    workspaceInstanceId: "01900000-0000-7000-8000-000000000203" as WorkspaceInstanceId,
    repositoryInstanceId: "01900000-0000-7000-8000-000000000204" as RepositoryInstanceId,
  },
};

const debianSurface: ConformanceSurfaceV1 = {
  ref: "wsl-debian",
  nativePlatform: "linux",
  kind: "wsl",
  launchOrigin: "native-shell",
  wslDistribution: "Debian",
  projectRoot: "/home/guff/src/lex",
  registryPath: "/home/guff/.local/state/lex/registry.db",
  canonical,
  local: {
    executionSurfaceId: "01900000-0000-7000-8000-000000000301" as ExecutionSurfaceId,
    registryInstanceId: "01900000-0000-7000-8000-000000000302" as RegistryInstanceId,
    workspaceInstanceId: "01900000-0000-7000-8000-000000000303" as WorkspaceInstanceId,
    repositoryInstanceId: "01900000-0000-7000-8000-000000000304" as RepositoryInstanceId,
  },
};

export const RUNTIME_SCOPE_CONFORMANCE_FIXTURES = [
  {
    schemaVersion: 1,
    id: "cached-grant-expired",
    requirement: "Expired cached authority fails closed.",
    surfaces: [ubuntuSurface],
    given: ["The matching binding contains cached canonical authority whose expiresAt is past."],
    when: "The invocation cannot reverify that authority.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.AUTHORITY_CACHE_EXPIRED,
      canonicalIdentity: "not-created",
      localIdentity: "preserved",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "conflicting-binding-evidence",
    requirement: "Conflicting path, manifest, and registry evidence is deterministic.",
    surfaces: [ubuntuSurface],
    given: ["Two local candidates match different evidence for the same request."],
    when: "No trusted input deterministically disambiguates the candidates.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_BINDING_AMBIGUOUS,
      canonicalIdentity: "not-created",
      localIdentity: "preserved",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "copied-registry-no-authority",
    requirement: "Copying local binding state cannot create canonical authority.",
    surfaces: [ubuntuSurface],
    given: ["A registry copy contains canonical UUIDs but no currently verified server grant."],
    when: "The copied registry is used by another installation.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED,
      canonicalIdentity: "not-created",
      localIdentity: "not-created",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "diagnostic-observability-only",
    requirement: "Diagnostics explain an existing decision without changing it.",
    surfaces: [ubuntuSurface],
    given: ["Repository evidence mismatches the registered binding."],
    when: "The caller repeats the operation with full diagnostics requested.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH,
      canonicalIdentity: "not-created",
      localIdentity: "preserved",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "edited-manifest-no-authority",
    requirement: "An edited repository declaration cannot grant access.",
    surfaces: [ubuntuSurface],
    given: ["The checked-in manifest claims a repository ID not verified by the binding."],
    when: "The invocation requests the manifest's preferred workspace.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH,
      canonicalIdentity: "not-created",
      localIdentity: "preserved",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "environment-selector-no-authority",
    requirement: "An environment selector selects only an already-authorized binding.",
    surfaces: [ubuntuSurface],
    given: ["A compatibility environment value names an ungranted workspace."],
    when: "No matching authorized local binding exists.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_SELECTOR_UNAUTHORIZED,
      canonicalIdentity: "not-created",
      localIdentity: "not-created",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "fork-declaration-mismatch",
    requirement: "A fork carrying an upstream declaration requires explicit registration.",
    surfaces: [ubuntuSurface],
    given: [
      "The manifest claims the upstream repository ID but provider evidence identifies a fork.",
    ],
    when: "Normal bootstrap verifies the binding.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.REPOSITORY_BINDING_MISMATCH,
      canonicalIdentity: "not-created",
      localIdentity: "not-created",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "missing-repository-declaration",
    requirement: "A repository without a checked-in declaration remains representable and unbound.",
    surfaces: [ubuntuSurface],
    given: [
      "The repository has no Lex identity declaration and no previously verified local binding.",
    ],
    when: "Normal bootstrap attempts to resolve the repository without explicit registration.",
    expected: {
      result: "fail-closed",
      errorCode: WORKSPACE_AUTHORITY_ERROR_CODES.WORKSPACE_UNBOUND,
      canonicalIdentity: "not-created",
      localIdentity: "not-created",
      bindingMutation: "explicit-only",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "moved-checkout-explicit-rebind",
    requirement: "A moved checkout is rebound deliberately without changing canonical identity.",
    surfaces: [{ ...ubuntuSurface, projectRoot: "/home/guff/src/lex-moved" }],
    given: ["Verified repository evidence matches an existing instance at a previous root."],
    when: "An authorized administrative rebind operation confirms the new root.",
    expected: {
      result: "explicit-rebind",
      canonicalIdentity: "preserved",
      localIdentity: "preserved",
      bindingMutation: "explicit-only",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "multiple-wsl-registries",
    requirement: "Each WSL distribution owns a separate local registry.",
    surfaces: [ubuntuSurface, debianSurface],
    given: ["Ubuntu and Debian authenticate as the same canonical principal."],
    when: "Both bind to the same canonical workspace.",
    expected: {
      result: "resolved",
      canonicalIdentity: "shared",
      localIdentity: "distinct",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "same-checkout-cross-surface",
    requirement: "Windows and WSL keep distinct local instances for the same checkout.",
    surfaces: [windowsSurface, ubuntuSurface],
    given: ["C:\\dev\\lex and /mnt/c/dev/lex expose the same checkout bytes."],
    when: "Native Windows and native WSL Lex resolve independently.",
    expected: {
      result: "resolved",
      canonicalIdentity: "shared",
      localIdentity: "distinct",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "separate-registry-files",
    requirement: "Windows and WSL never open one shared mutable SQLite registry.",
    surfaces: [windowsSurface, ubuntuSurface],
    given: ["Both surfaces resolve the same canonical scope."],
    when: "Registry locations are selected.",
    expected: {
      result: "resolved",
      canonicalIdentity: "shared",
      localIdentity: "distinct",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "verified-clone-new-instance",
    requirement: "A verified clone retains repository identity and gets a new local instance.",
    surfaces: [
      ubuntuSurface,
      {
        ...ubuntuSurface,
        ref: "wsl-ubuntu-clone",
        projectRoot: "/home/guff/src/lex-clone",
        local: {
          ...ubuntuSurface.local,
          repositoryInstanceId: "01900000-0000-7000-8000-000000000205" as RepositoryInstanceId,
        },
      },
    ],
    given: ["Provider and manifest evidence verify both clones as the same repository."],
    when: "The second clone is explicitly bound.",
    expected: {
      result: "resolved",
      canonicalIdentity: "shared",
      localIdentity: "distinct",
      bindingMutation: "explicit-only",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "windows-process-via-wsl-interop",
    requirement: "The native process selects the registry, not the launching shell.",
    surfaces: [{ ...windowsSurface, launchOrigin: "wsl-interop" }],
    given: ["A Windows Lex process is launched from a WSL shell."],
    when: "Bootstrap selects its local registry.",
    expected: {
      result: "resolved",
      selectedRegistryRef: "windows",
      canonicalIdentity: "preserved",
      localIdentity: "preserved",
      bindingMutation: "none",
      diagnosticChangesOutcome: false,
    },
  },
  {
    schemaVersion: 1,
    id: "worktree-new-instance",
    requirement: "A worktree retains repository identity and gets a new local instance.",
    surfaces: [
      ubuntuSurface,
      {
        ...ubuntuSurface,
        ref: "wsl-ubuntu-worktree",
        projectRoot: "/home/guff/src/lex-feature",
        local: {
          ...ubuntuSurface.local,
          repositoryInstanceId: "01900000-0000-7000-8000-000000000206" as RepositoryInstanceId,
        },
      },
    ],
    given: ["Git common-directory evidence links the worktree to the canonical repository."],
    when: "The worktree is explicitly bound.",
    expected: {
      result: "resolved",
      canonicalIdentity: "shared",
      localIdentity: "distinct",
      bindingMutation: "explicit-only",
      diagnosticChangesOutcome: false,
    },
  },
] as const satisfies readonly RuntimeScopeConformanceFixtureV1[];
