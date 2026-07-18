/**
 * Opaque identifiers used by the trusted runtime-scope contract.
 *
 * The public contract deliberately does not expose a UUID generation version.
 * Persisted values are UUIDs, but callers must not parse or derive semantics
 * from their representation.
 */

declare const runtimeScopeIdBrand: unique symbol;
declare const runtimeScopeValueBrand: unique symbol;

type OpaqueId<Kind extends string> = string & {
  readonly [runtimeScopeIdBrand]: Kind;
};

type OpaqueValue<Kind extends string> = string & {
  readonly [runtimeScopeValueBrand]: Kind;
};

export type TenantId = OpaqueId<"TenantId">;
export type PrincipalId = OpaqueId<"PrincipalId">;
export type WorkspaceId = OpaqueId<"WorkspaceId">;
export type WorkspaceInstanceId = OpaqueId<"WorkspaceInstanceId">;
export type RepositoryId = OpaqueId<"RepositoryId">;
export type RepositoryInstanceId = OpaqueId<"RepositoryInstanceId">;
export type RuntimeId = OpaqueId<"RuntimeId">;
export type ExecutionSurfaceId = OpaqueId<"ExecutionSurfaceId">;
export type RegistryInstanceId = OpaqueId<"RegistryInstanceId">;
export type BindingId = OpaqueId<"BindingId">;
export type BindingReceiptId = OpaqueId<"BindingReceiptId">;
export type AuthorityGrantId = OpaqueId<"AuthorityGrantId">;
export type TraceId = OpaqueId<"TraceId">;

export type TenantSlug = OpaqueValue<"TenantSlug">;
export type WorkspaceSlug = OpaqueValue<"WorkspaceSlug">;
export type RepositorySlug = OpaqueValue<"RepositorySlug">;
export type CapabilityId = OpaqueValue<"CapabilityId">;
export type ContentDigest = OpaqueValue<"ContentDigest">;
export type AuthorityVersion = OpaqueValue<"AuthorityVersion">;
export type ScopeVersion = OpaqueValue<"ScopeVersion">;
export type AuthenticationRef = OpaqueValue<"AuthenticationRef">;
export type SecretHandleRef = OpaqueValue<"SecretHandleRef">;

type AssertFalse<Value extends false> = Value;
type _TenantAndWorkspaceIdsRemainDistinct = AssertFalse<
  TenantId extends WorkspaceId ? true : false
>;
type _RepositoryAndInstanceIdsRemainDistinct = AssertFalse<
  RepositoryId extends RepositoryInstanceId ? true : false
>;
type _AuthenticationAndSecretHandlesRemainDistinct = AssertFalse<
  AuthenticationRef extends SecretHandleRef ? true : false
>;
