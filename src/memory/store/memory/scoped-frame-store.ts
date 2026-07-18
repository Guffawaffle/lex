/** In-memory reference implementation of Lex 3.0 scope-bound Frame storage. */

import type { Frame } from "../../frames/types.js";
import { Frame as FrameSchema } from "../../frames/types.js";
import type { AuthorizedScopeV1, CapabilityId } from "../../../shared/runtime-scope/index.js";
import { RUNTIME_SCOPE_CONTRACT_VERSION } from "../../../shared/runtime-scope/index.js";
import type {
  FrameListResult,
  FrameStoreHealth,
  FrameStoreMetadata,
  SaveResult,
  StoreStats,
  TurnCostMetrics,
} from "../frame-store.js";
import {
  FRAME_STORE_CAPABILITIES,
  FRAME_STORE_SCOPE_CONTRACT_VERSION,
  SCOPED_FRAME_STORE_ERROR_CODES,
  ScopedFrameStoreError,
  type FrameOwnershipV1,
  type FrameStoreAdmin,
  type FrameStoreAdminBinder,
  type FrameStoreCapability,
  type ScopedFrameInput,
  type ScopedFrameListOptions,
  type ScopedFrameSearchCriteria,
  type ScopedFrameStore,
  type ScopedFrameStoreBinder,
  type ScopedFrameUpdate,
} from "../scoped-frame-store.js";
import { MemoryFrameStore } from "./frame-store.js";

interface ScopePartition {
  readonly store: MemoryFrameStore;
  readonly ownershipByFrameId: Map<string, FrameOwnershipV1>;
}

export interface MemoryScopedFrameStoreOptions {
  /** Explicit clock seam for deterministic expiry and statistics tests. */
  readonly now?: () => Date;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function immutableScope(scope: AuthorizedScopeV1): AuthorizedScopeV1 {
  if (
    !scope ||
    scope.schemaVersion !== RUNTIME_SCOPE_CONTRACT_VERSION ||
    !isNonEmptyString(scope.grantId) ||
    !isNonEmptyString(scope.tenantId) ||
    !isNonEmptyString(scope.workspaceId) ||
    !isNonEmptyString(scope.principalId) ||
    !Array.isArray(scope.capabilities) ||
    !scope.capabilities.every(isNonEmptyString) ||
    !isNonEmptyString(scope.authorityVersion) ||
    !isNonEmptyString(scope.scopeVersion) ||
    !isNonEmptyString(scope.authorityDigest) ||
    !isNonEmptyString(scope.verifiedAt) ||
    (scope.expiresAt !== undefined && !isNonEmptyString(scope.expiresAt)) ||
    Number.isNaN(Date.parse(scope.verifiedAt)) ||
    (scope.expiresAt !== undefined && Number.isNaN(Date.parse(scope.expiresAt)))
  ) {
    throw new ScopedFrameStoreError(
      SCOPED_FRAME_STORE_ERROR_CODES.INVALID_SCOPE,
      "FrameStore binding requires a valid AuthorizedScope v1"
    );
  }

  const snapshot: AuthorizedScopeV1 = {
    schemaVersion: RUNTIME_SCOPE_CONTRACT_VERSION,
    grantId: scope.grantId,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    principalId: scope.principalId,
    capabilities: Object.freeze([...scope.capabilities] as CapabilityId[]),
    authorityVersion: scope.authorityVersion,
    scopeVersion: scope.scopeVersion,
    authorityDigest: scope.authorityDigest,
    verifiedAt: scope.verifiedAt,
    ...(scope.expiresAt === undefined ? {} : { expiresAt: scope.expiresAt }),
  };
  return Object.freeze(snapshot);
}

function scopePartitionKey(scope: AuthorizedScopeV1): string {
  return JSON.stringify([scope.tenantId, scope.workspaceId]);
}

function stripLegacyOwnership(frame: Frame): Frame {
  const copy = structuredClone(frame);
  delete copy.userId;
  return copy;
}

function parseScopedInput(frame: ScopedFrameInput): ReturnType<typeof FrameSchema.safeParse> {
  return FrameSchema.safeParse(stripLegacyOwnership(frame as Frame));
}

function publicFrame(frame: Frame): Frame {
  return stripLegacyOwnership(frame);
}

function ownershipFromScope(scope: AuthorizedScopeV1): FrameOwnershipV1 {
  return Object.freeze({
    schemaVersion: FRAME_STORE_SCOPE_CONTRACT_VERSION,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    creatorPrincipalId: scope.principalId,
    scopeVersion: scope.scopeVersion,
  });
}

abstract class MemoryBoundView {
  private closed = false;

  protected constructor(
    readonly authorizedScope: AuthorizedScopeV1,
    protected readonly partition: ScopePartition,
    private readonly backendIsClosed: () => boolean,
    private readonly now: () => Date
  ) {}

  protected assertActive(): void {
    if (this.closed || this.backendIsClosed()) {
      throw new ScopedFrameStoreError(
        SCOPED_FRAME_STORE_ERROR_CODES.STORE_CLOSED,
        "Scope-bound FrameStore is closed"
      );
    }
    const expiresAt = this.authorizedScope.expiresAt;
    if (expiresAt !== undefined && Date.parse(expiresAt) <= this.now().getTime()) {
      throw new ScopedFrameStoreError(
        SCOPED_FRAME_STORE_ERROR_CODES.SCOPE_EXPIRED,
        "Authorized FrameStore scope has expired"
      );
    }
  }

  protected assertCapability(capability: FrameStoreCapability): void {
    this.assertActive();
    if (!this.authorizedScope.capabilities.includes(capability as CapabilityId)) {
      throw new ScopedFrameStoreError(
        SCOPED_FRAME_STORE_ERROR_CODES.CAPABILITY_MISSING,
        `FrameStore operation requires ${capability}`,
        capability
      );
    }
  }

  protected metadata(): FrameStoreMetadata {
    this.assertActive();
    return {
      backend: "memory",
      location: "memory-scoped-store",
      canonicalLocation: "memory-scoped-store",
      identity: "memory-scoped-v1:ephemeral",
      capabilities: { encryption: false, images: false },
    };
  }

  protected async health(): Promise<FrameStoreHealth> {
    this.assertActive();
    return {
      healthy: true,
      schemaVersion: "memory-scoped-v1",
      checkedAt: this.now().toISOString(),
    };
  }

  protected closeView(): void {
    this.closed = true;
  }
}

class ScopedMemoryFrameStore extends MemoryBoundView implements ScopedFrameStore {
  constructor(
    authorizedScope: AuthorizedScopeV1,
    partition: ScopePartition,
    backendIsClosed: () => boolean,
    now: () => Date
  ) {
    super(authorizedScope, partition, backendIsClosed, now);
  }

  getMetadata(): FrameStoreMetadata {
    return this.metadata();
  }

  async getHealth(): Promise<FrameStoreHealth> {
    return this.health();
  }

  async saveFrame(frame: ScopedFrameInput): Promise<void> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.WRITE);
    const result = parseScopedInput(frame);
    if (!result.success) throw result.error;

    await this.partition.store.saveFrame(result.data);
    if (!this.partition.ownershipByFrameId.has(result.data.id)) {
      this.partition.ownershipByFrameId.set(
        result.data.id,
        ownershipFromScope(this.authorizedScope)
      );
    }
  }

  async saveFrames(frames: readonly ScopedFrameInput[]): Promise<SaveResult[]> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.WRITE);
    const parsed = frames.map(parseScopedInput);
    const invalidIndex = parsed.findIndex((result) => !result.success);
    if (invalidIndex !== -1) {
      const invalid = parsed[invalidIndex];
      return frames.map((frame, index) => ({
        id: frame.id ?? `frame-${index}`,
        success: false,
        error:
          index === invalidIndex && !invalid.success
            ? `Validation failed: ${invalid.error.message}`
            : "Transaction aborted due to validation failure in another frame",
      }));
    }

    const validFrames = parsed.map((result) => {
      if (!result.success) throw new Error("Unreachable scoped Frame validation state");
      return result.data;
    });
    const results = await this.partition.store.saveFrames(validFrames);
    for (const [index, result] of results.entries()) {
      if (result.success && !this.partition.ownershipByFrameId.has(result.id)) {
        this.partition.ownershipByFrameId.set(
          validFrames[index].id,
          ownershipFromScope(this.authorizedScope)
        );
      }
    }
    return results;
  }

  async getFrameById(id: string): Promise<Frame | null> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.READ);
    const frame = await this.partition.store.getFrameById(id);
    return frame ? publicFrame(frame) : null;
  }

  async searchFrames(criteria: ScopedFrameSearchCriteria): Promise<Frame[]> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.READ);
    const { userId: _discardedUserId, ...safeCriteria } = criteria as ScopedFrameSearchCriteria & {
      userId?: unknown;
    };
    const frames = await this.partition.store.searchFrames(safeCriteria);
    return frames.map(publicFrame);
  }

  async listFrames(options?: ScopedFrameListOptions): Promise<FrameListResult> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.READ);
    const { userId: _discardedUserId, ...safeOptions } = (options ??
      {}) as ScopedFrameListOptions & {
      userId?: unknown;
    };
    const result = await this.partition.store.listFrames(safeOptions);
    return { ...result, frames: result.frames.map(publicFrame) };
  }

  async deleteFrame(id: string): Promise<boolean> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.DELETE);
    const deleted = await this.partition.store.deleteFrame(id);
    if (deleted) this.partition.ownershipByFrameId.delete(id);
    return deleted;
  }

  async deleteFramesBefore(date: Date): Promise<number> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.DELETE);
    const matchingIds = (await this.allFrames())
      .filter((frame) => new Date(frame.timestamp).getTime() < date.getTime())
      .map((frame) => frame.id);
    const deleted = await this.partition.store.deleteFramesBefore(date);
    this.deleteOwnership(matchingIds);
    return deleted;
  }

  async deleteFramesByBranch(branch: string): Promise<number> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.DELETE);
    const matchingIds = (await this.allFrames())
      .filter((frame) => frame.branch === branch)
      .map((frame) => frame.id);
    const deleted = await this.partition.store.deleteFramesByBranch(branch);
    this.deleteOwnership(matchingIds);
    return deleted;
  }

  async deleteFramesByModule(moduleId: string): Promise<number> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.DELETE);
    const matchingIds = (await this.allFrames())
      .filter((frame) => frame.module_scope.includes(moduleId))
      .map((frame) => frame.id);
    const deleted = await this.partition.store.deleteFramesByModule(moduleId);
    this.deleteOwnership(matchingIds);
    return deleted;
  }

  async getFrameCount(): Promise<number> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.READ);
    return this.partition.store.getFrameCount();
  }

  async getStats(detailed = false): Promise<StoreStats> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.READ);
    return this.partition.store.getStats(detailed);
  }

  async getTurnCostMetrics(since?: string): Promise<TurnCostMetrics> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.READ);
    return this.partition.store.getTurnCostMetrics(since);
  }

  async updateFrame(id: string, updates: ScopedFrameUpdate): Promise<boolean> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.WRITE);
    const {
      id: _discardedId,
      timestamp: _discardedTimestamp,
      userId: _discardedUserId,
      tenantId: _discardedTenantId,
      workspaceId: _discardedWorkspaceId,
      principalId: _discardedPrincipalId,
      creatorPrincipalId: _discardedCreatorPrincipalId,
      ...safeUpdates
    } = updates as ScopedFrameUpdate & Record<string, unknown>;
    return this.partition.store.updateFrame(
      id,
      safeUpdates as Partial<Omit<Frame, "id" | "timestamp">>
    );
  }

  async purgeSuperseded(): Promise<number> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.DELETE);
    const matchingIds = (await this.allFrames())
      .filter((frame) => Boolean(frame.superseded_by))
      .map((frame) => frame.id);
    const deleted = await this.partition.store.purgeSuperseded();
    this.deleteOwnership(matchingIds);
    return deleted;
  }

  async close(): Promise<void> {
    this.closeView();
  }

  private async allFrames(): Promise<Frame[]> {
    const result = await this.partition.store.listFrames({ limit: Number.MAX_SAFE_INTEGER });
    return result.frames;
  }

  private deleteOwnership(ids: readonly string[]): void {
    for (const id of ids) this.partition.ownershipByFrameId.delete(id);
  }
}

class MemoryFrameStoreAdminView extends MemoryBoundView implements FrameStoreAdmin {
  constructor(
    authorizedScope: AuthorizedScopeV1,
    partition: ScopePartition,
    backendIsClosed: () => boolean,
    now: () => Date
  ) {
    super(authorizedScope, partition, backendIsClosed, now);
  }

  getMetadata(): FrameStoreMetadata {
    this.assertCapability(FRAME_STORE_CAPABILITIES.ADMIN);
    return this.metadata();
  }

  async getHealth(): Promise<FrameStoreHealth> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.ADMIN);
    return this.health();
  }

  async getFrameOwnership(id: string): Promise<FrameOwnershipV1 | null> {
    this.assertCapability(FRAME_STORE_CAPABILITIES.ADMIN);
    const ownership = this.partition.ownershipByFrameId.get(id);
    return ownership ? Object.freeze({ ...ownership }) : null;
  }

  async close(): Promise<void> {
    this.closeView();
  }
}

/**
 * Shared in-memory backend used to exercise scope isolation before physical
 * SQLite and PostgreSQL adapters adopt the same binding contract.
 */
export class MemoryScopedFrameStoreBackend
  implements ScopedFrameStoreBinder, FrameStoreAdminBinder
{
  private readonly partitions = new Map<string, ScopePartition>();
  private readonly now: () => Date;
  private closed = false;

  constructor(options: MemoryScopedFrameStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  bind(authorizedScope: AuthorizedScopeV1): ScopedFrameStore {
    const scope = this.bindScope(authorizedScope);
    return new ScopedMemoryFrameStore(scope, this.partitionFor(scope), () => this.closed, this.now);
  }

  bindAdmin(authorizedScope: AuthorizedScopeV1): FrameStoreAdmin {
    const scope = this.bindScope(authorizedScope);
    if (!scope.capabilities.includes(FRAME_STORE_CAPABILITIES.ADMIN)) {
      throw new ScopedFrameStoreError(
        SCOPED_FRAME_STORE_ERROR_CODES.CAPABILITY_MISSING,
        `FrameStore operation requires ${FRAME_STORE_CAPABILITIES.ADMIN}`,
        FRAME_STORE_CAPABILITIES.ADMIN
      );
    }
    return new MemoryFrameStoreAdminView(
      scope,
      this.partitionFor(scope),
      () => this.closed,
      this.now
    );
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await Promise.all([...this.partitions.values()].map(({ store }) => store.close()));
  }

  private bindScope(authorizedScope: AuthorizedScopeV1): AuthorizedScopeV1 {
    if (this.closed) {
      throw new ScopedFrameStoreError(
        SCOPED_FRAME_STORE_ERROR_CODES.STORE_CLOSED,
        "Scope-bound FrameStore backend is closed"
      );
    }
    const scope = immutableScope(authorizedScope);
    if (scope.expiresAt !== undefined && Date.parse(scope.expiresAt) <= this.now().getTime()) {
      throw new ScopedFrameStoreError(
        SCOPED_FRAME_STORE_ERROR_CODES.SCOPE_EXPIRED,
        "Authorized FrameStore scope has expired"
      );
    }
    return scope;
  }

  private partitionFor(scope: AuthorizedScopeV1): ScopePartition {
    const key = scopePartitionKey(scope);
    let partition = this.partitions.get(key);
    if (!partition) {
      partition = {
        store: new MemoryFrameStore(),
        ownershipByFrameId: new Map(),
      };
      this.partitions.set(key, partition);
    }
    return partition;
  }
}
