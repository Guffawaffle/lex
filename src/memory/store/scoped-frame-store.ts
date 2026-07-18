/**
 * Scope-bound persistence contract for Lex 3.0 Frame operations.
 *
 * Normal consumers receive this interface only after trusted bootstrap has
 * resolved an immutable, attenuated AuthorizedScope. Physical adapters and
 * administrative operations remain behind separately named boundaries.
 */

import type { Frame } from "../frames/types.js";
import type {
  FrameStore,
  FrameListOptions,
  FrameListResult,
  FrameSearchCriteria,
  FrameStoreHealth,
  FrameStoreMetadata,
  SaveResult,
  StoreStats,
  TurnCostMetrics,
} from "./frame-store.js";
import type {
  AuthorizedScopeV1,
  CapabilityId,
  PrincipalId,
  ScopeVersion,
  TenantId,
  WorkspaceId,
} from "../../shared/runtime-scope/index.js";

export const FRAME_STORE_SCOPE_CONTRACT_VERSION = 1 as const;

/** Stable capability names checked by scope-bound FrameStore operations. */
export const FRAME_STORE_CAPABILITIES = Object.freeze({
  READ: "frame:read" as CapabilityId,
  WRITE: "frame:write" as CapabilityId,
  DELETE: "frame:delete" as CapabilityId,
  ADMIN: "frame:admin" as CapabilityId,
});

export type FrameStoreCapability =
  (typeof FRAME_STORE_CAPABILITIES)[keyof typeof FRAME_STORE_CAPABILITIES];

/** Ownership persisted beside a Frame and omitted from normal Frame results. */
export interface FrameOwnershipV1 {
  readonly schemaVersion: typeof FRAME_STORE_SCOPE_CONTRACT_VERSION;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly creatorPrincipalId: PrincipalId;
  readonly scopeVersion: ScopeVersion;
}

/**
 * Normal writes cannot provide an ownership identity. Runtime implementations
 * also discard legacy `userId` values before validation and storage.
 */
export type ScopedFrameInput = Omit<Frame, "userId">;

/** Normal updates cannot replace immutable identity, time, or ownership. */
export type ScopedFrameUpdate = Partial<Omit<Frame, "id" | "timestamp" | "userId">>;

/** Workspace/principal filters are invalid after a store has been scope-bound. */
export type ScopedFrameSearchCriteria = Omit<FrameSearchCriteria, "userId">;

/** Workspace/principal filters are invalid after a store has been scope-bound. */
export type ScopedFrameListOptions = Omit<FrameListOptions, "userId">;

export const SCOPED_FRAME_STORE_ERROR_CODES = Object.freeze({
  INVALID_SCOPE: "LEX_FRAME_STORE_INVALID_SCOPE",
  CAPABILITY_MISSING: "LEX_FRAME_STORE_CAPABILITY_MISSING",
  SCOPE_EXPIRED: "LEX_FRAME_STORE_SCOPE_EXPIRED",
  STORE_CLOSED: "LEX_FRAME_STORE_CLOSED",
});

export type ScopedFrameStoreErrorCode =
  (typeof SCOPED_FRAME_STORE_ERROR_CODES)[keyof typeof SCOPED_FRAME_STORE_ERROR_CODES];

/** Stable, compact authorization failures for adapters to map at entrypoints. */
export class ScopedFrameStoreError extends Error {
  constructor(
    public readonly code: ScopedFrameStoreErrorCode,
    message: string,
    public readonly requiredCapability?: FrameStoreCapability
  ) {
    super(message);
    this.name = "ScopedFrameStoreError";
  }
}

/**
 * The only FrameStore surface intended for normal CLI, MCP, and SDK use in
 * Lex 3.0. No method accepts a tenant, workspace, or principal selector.
 */
export interface ScopedFrameStore {
  /** Immutable snapshot of the exact attenuated scope used for this view. */
  readonly authorizedScope: AuthorizedScopeV1;

  getMetadata(): FrameStoreMetadata;
  getHealth(): Promise<FrameStoreHealth>;
  saveFrame(frame: ScopedFrameInput): Promise<void>;
  saveFrames(frames: readonly ScopedFrameInput[]): Promise<SaveResult[]>;
  getFrameById(id: string): Promise<Frame | null>;
  searchFrames(criteria: ScopedFrameSearchCriteria): Promise<Frame[]>;
  listFrames(options?: ScopedFrameListOptions): Promise<FrameListResult>;
  deleteFrame(id: string): Promise<boolean>;
  deleteFramesBefore(date: Date): Promise<number>;
  deleteFramesByBranch(branch: string): Promise<number>;
  deleteFramesByModule(moduleId: string): Promise<number>;
  getFrameCount(): Promise<number>;
  getStats(detailed?: boolean): Promise<StoreStats>;
  getTurnCostMetrics(since?: string): Promise<TurnCostMetrics>;
  updateFrame(id: string, updates: ScopedFrameUpdate): Promise<boolean>;
  purgeSuperseded(): Promise<number>;
  close(): Promise<void>;
}

/** Authority-binding boundary implemented by each physical FrameStore. */
export interface ScopedFrameStoreBinder {
  bind(authorizedScope: AuthorizedScopeV1): ScopedFrameStore;
}

/**
 * Administrative diagnostics are deliberately absent from ScopedFrameStore.
 * Migration, repair, and lifecycle implementations can extend this separately
 * authorized interface without special selectors on the normal store.
 */
export interface FrameStoreAdmin {
  readonly authorizedScope: AuthorizedScopeV1;

  getMetadata(): FrameStoreMetadata;
  getHealth(): Promise<FrameStoreHealth>;
  getFrameOwnership(id: string): Promise<FrameOwnershipV1 | null>;
  close(): Promise<void>;
}

/** Separate binding boundary for explicitly authorized administration. */
export interface FrameStoreAdminBinder {
  bindAdmin(authorizedScope: AuthorizedScopeV1): FrameStoreAdmin;
}

/**
 * Transitional lexical adapter for existing command/tool handlers. It does
 * not add selectors or retain scope globally; every method remains enforced
 * by the already-bound ScopedFrameStore view.
 */
export function scopedFrameStoreAsLegacyView(store: ScopedFrameStore): FrameStore {
  return Object.freeze({
    getMetadata: () => store.getMetadata(),
    getHealth: () => store.getHealth(),
    saveFrame: (frame: Frame) => store.saveFrame(frame),
    saveFrames: (frames: Frame[]) => store.saveFrames(frames),
    getFrameById: (id: string) => store.getFrameById(id),
    searchFrames: (criteria: FrameSearchCriteria) => store.searchFrames(criteria),
    listFrames: (options?: FrameListOptions) => store.listFrames(options),
    deleteFrame: (id: string) => store.deleteFrame(id),
    deleteFramesBefore: (date: Date) => store.deleteFramesBefore(date),
    deleteFramesByBranch: (branch: string) => store.deleteFramesByBranch(branch),
    deleteFramesByModule: (moduleId: string) => store.deleteFramesByModule(moduleId),
    getFrameCount: () => store.getFrameCount(),
    getStats: (detailed?: boolean) => store.getStats(detailed),
    getTurnCostMetrics: (since?: string) => store.getTurnCostMetrics(since),
    updateFrame: (id: string, updates: Partial<Frame>) => store.updateFrame(id, updates),
    purgeSuperseded: () => store.purgeSuperseded(),
    close: () => store.close(),
  });
}
