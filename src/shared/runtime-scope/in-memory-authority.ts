import type {
  AuthorityDirectory,
  AuthorizedWorkspaceGrantV1,
  PrincipalIdentityV1,
  PrincipalResolutionRequestV1,
  RepositoryRecordV1,
  RepositorySelectorV1,
  TenantRecordV1,
  TenantSelectorV1,
  WorkspaceAuthorizationDecisionV1,
  WorkspaceAuthorizationRequestV1,
  WorkspaceRecordV1,
  WorkspaceSelectorV1,
} from "./authority.js";
import type { AuthenticationRef, PrincipalId } from "./ids.js";

export interface InMemoryAuthenticationBindingV1 {
  readonly authenticationRef: AuthenticationRef;
  readonly principalId: PrincipalId;
}

export interface InMemoryAuthorityGrantV1 {
  readonly grant: AuthorizedWorkspaceGrantV1;
  readonly revokedAt?: string;
}

export interface InMemoryAuthoritySeedV1 {
  readonly principals: readonly PrincipalIdentityV1[];
  readonly tenants: readonly TenantRecordV1[];
  readonly workspaces: readonly WorkspaceRecordV1[];
  readonly repositories: readonly RepositoryRecordV1[];
  readonly authentication: readonly InMemoryAuthenticationBindingV1[];
  readonly grants: readonly InMemoryAuthorityGrantV1[];
}

function uniqueMap<Value>(
  values: readonly Value[],
  keyFor: (value: Value) => string,
  name: string
): ReadonlyMap<string, Value> {
  const result = new Map<string, Value>();
  for (const value of values) {
    const key = keyFor(value);
    if (result.has(key)) throw new TypeError(`Duplicate ${name}: ${key}.`);
    result.set(key, Object.freeze({ ...value }));
  }
  return result;
}

function isExpired(expiresAt: string | undefined, now: string): boolean {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  const current = Date.parse(now);
  if (!Number.isFinite(expiry) || !Number.isFinite(current)) {
    throw new TypeError("Authority timestamps must be ISO-compatible values.");
  }
  return expiry <= current;
}

/**
 * Deterministic injected authority for resolver and conformance tests.
 * It deliberately has no local topology or persistence behavior.
 */
export class InMemoryAuthorityDirectory implements AuthorityDirectory {
  private readonly principalsById: ReadonlyMap<string, PrincipalIdentityV1>;
  private readonly tenantsById: ReadonlyMap<string, TenantRecordV1>;
  private readonly tenantsBySlug: ReadonlyMap<string, TenantRecordV1>;
  private readonly workspacesById: ReadonlyMap<string, WorkspaceRecordV1>;
  private readonly workspacesBySlug: ReadonlyMap<string, WorkspaceRecordV1>;
  private readonly repositoriesById: ReadonlyMap<string, RepositoryRecordV1>;
  private readonly authentication: ReadonlyMap<string, InMemoryAuthenticationBindingV1>;
  private readonly grants: readonly InMemoryAuthorityGrantV1[];

  constructor(
    seed: InMemoryAuthoritySeedV1,
    private readonly now: () => string = () => new Date().toISOString()
  ) {
    this.principalsById = uniqueMap(
      seed.principals,
      ({ principalId }) => principalId,
      "principal ID"
    );
    this.tenantsById = uniqueMap(seed.tenants, ({ tenantId }) => tenantId, "tenant ID");
    this.tenantsBySlug = uniqueMap(seed.tenants, ({ tenantSlug }) => tenantSlug, "tenant slug");
    this.workspacesById = uniqueMap(
      seed.workspaces,
      ({ workspaceId }) => workspaceId,
      "workspace ID"
    );
    this.workspacesBySlug = uniqueMap(
      seed.workspaces,
      ({ tenantId, workspaceSlug }) => `${tenantId}/${workspaceSlug}`,
      "tenant-scoped workspace slug"
    );
    this.repositoriesById = uniqueMap(
      seed.repositories,
      ({ repositoryId }) => repositoryId,
      "repository ID"
    );
    this.authentication = uniqueMap(
      seed.authentication,
      ({ authenticationRef }) => authenticationRef,
      "authentication reference"
    );
    this.grants = Object.freeze(
      seed.grants
        .map((entry) =>
          Object.freeze({
            ...entry,
            grant: Object.freeze({
              ...entry.grant,
              capabilities: Object.freeze([...entry.grant.capabilities]),
            }),
          })
        )
        .sort((left, right) => left.grant.grantId.localeCompare(right.grant.grantId))
    );
  }

  async resolvePrincipal(
    request: PrincipalResolutionRequestV1
  ): Promise<PrincipalIdentityV1 | null> {
    const binding = this.authentication.get(request.authenticationRef);
    return binding ? (this.principalsById.get(binding.principalId) ?? null) : null;
  }

  async getTenant(selector: TenantSelectorV1): Promise<TenantRecordV1 | null> {
    return "tenantId" in selector
      ? (this.tenantsById.get(selector.tenantId) ?? null)
      : (this.tenantsBySlug.get(selector.tenantSlug) ?? null);
  }

  async getWorkspace(selector: WorkspaceSelectorV1): Promise<WorkspaceRecordV1 | null> {
    if ("workspaceId" in selector) return this.workspacesById.get(selector.workspaceId) ?? null;
    const tenant = await this.getTenant(selector.tenant);
    return tenant
      ? (this.workspacesBySlug.get(`${tenant.tenantId}/${selector.workspaceSlug}`) ?? null)
      : null;
  }

  async getRepository(selector: RepositorySelectorV1): Promise<RepositoryRecordV1 | null> {
    return this.repositoriesById.get(selector.repositoryId) ?? null;
  }

  async authorizeWorkspace(
    request: WorkspaceAuthorizationRequestV1
  ): Promise<WorkspaceAuthorizationDecisionV1> {
    const principal = this.principalsById.get(request.principalId);
    if (!principal || principal.state !== "active") {
      return Object.freeze({ authorized: false, reason: "principal-unknown" });
    }

    let tenant: TenantRecordV1 | null = null;
    if (!("workspaceId" in request.workspace)) {
      tenant = await this.getTenant(request.workspace.tenant);
      if (!tenant || tenant.state !== "active") {
        return Object.freeze({ authorized: false, reason: "tenant-unknown" });
      }
    }

    const workspace = await this.getWorkspace(request.workspace);
    if (!workspace || workspace.state !== "active") {
      return Object.freeze({ authorized: false, reason: "workspace-unknown" });
    }
    tenant ??= this.tenantsById.get(workspace.tenantId) ?? null;
    if (!tenant || tenant.state !== "active" || tenant.tenantId !== workspace.tenantId) {
      return Object.freeze({ authorized: false, reason: "tenant-unknown" });
    }

    const matching = this.grants.filter(
      ({ grant }) =>
        grant.principalId === principal.principalId &&
        grant.tenantId === tenant.tenantId &&
        grant.workspaceId === workspace.workspaceId
    );
    if (matching.length === 0) {
      return Object.freeze({ authorized: false, reason: "membership-missing" });
    }

    const active = matching.filter(({ revokedAt }) => revokedAt === undefined);
    if (active.length === 0) {
      return Object.freeze({
        authorized: false,
        reason: "grant-revoked",
        authorityVersion: matching[0]?.grant.authorityVersion,
      });
    }

    const current = active.filter(({ grant }) => !isExpired(grant.expiresAt, this.now()));
    if (current.length === 0) {
      return Object.freeze({
        authorized: false,
        reason: "grant-expired",
        authorityVersion: active[0]?.grant.authorityVersion,
      });
    }

    const capable = current.find(({ grant }) =>
      request.requestedCapabilities.every((capability) => grant.capabilities.includes(capability))
    );
    if (!capable) {
      return Object.freeze({
        authorized: false,
        reason: "capability-missing",
        authorityVersion: current[0]?.grant.authorityVersion,
      });
    }

    return Object.freeze({ authorized: true, grant: capable.grant });
  }
}
