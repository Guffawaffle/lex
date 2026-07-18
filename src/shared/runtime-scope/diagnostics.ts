import type { ContentDigest, RuntimeId, TraceId } from "./ids.js";

export const DIAGNOSTIC_CONTRACT_VERSION = 1 as const;

export type DiagnosticLevel = "summary" | "full";
export type DiagnosticSection =
  "configuration" | "authority" | "selection" | "binding" | "projection";

export interface DiagnosticRequestV1 {
  readonly schemaVersion: typeof DIAGNOSTIC_CONTRACT_VERSION;
  readonly level: DiagnosticLevel;
  readonly sections?: readonly DiagnosticSection[];
}

export type DiagnosticJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly DiagnosticJsonValue[]
  | { readonly [key: string]: DiagnosticJsonValue };

export interface DiagnosticDecisionV1 {
  readonly code: string;
  readonly outcome: "selected" | "accepted" | "rejected" | "redacted";
  readonly summary: string;
  readonly evidenceRefs?: readonly string[];
}

export interface DiagnosticWarningV1 {
  readonly code: string;
  readonly summary: string;
}

export interface DiagnosticRedactionV1 {
  readonly field: string;
  readonly reason: "capability-required" | "secret" | "topology" | "principal-data";
}

export interface RedactedConfigurationDiagnosticV1 {
  readonly configurationDigest: ContentDigest;
  readonly policyDigest?: ContentDigest;
  readonly sources: readonly {
    readonly source: string;
    readonly key: string;
    readonly redacted: boolean;
  }[];
}

export interface RedactedAuthorityDiagnosticV1 {
  readonly authoritySource: string;
  readonly authorityVersion: string;
  readonly principalRef?: string;
  readonly tenantRef?: string;
  readonly workspaceRef?: string;
  readonly capabilities?: readonly string[];
}

export interface BindingDiagnosticV1 {
  readonly bindingRef?: string;
  readonly registryRef: string;
  readonly executionSurfaceRef: string;
  readonly verification: string;
  readonly evidenceRefs: readonly string[];
}

export interface SelectionDiagnosticV1 {
  readonly requestedRef: string;
  readonly selectedRef?: string;
  readonly decisions: readonly string[];
}

export interface ProjectionDiagnosticV1 {
  readonly projectionRef: string;
  readonly sourceDigest?: ContentDigest;
  readonly state: string;
}

/**
 * Versioned, deterministic evidence for decisions already made by an
 * operation. Requesting diagnostics never grants access or changes behavior.
 */
export interface DiagnosticEnvelopeV1 {
  readonly schemaVersion: typeof DIAGNOSTIC_CONTRACT_VERSION;
  readonly runtimeId: RuntimeId;
  readonly traceId: TraceId;
  readonly resolutionDigest: ContentDigest;
  readonly policyDigest?: ContentDigest;
  readonly decisions: readonly DiagnosticDecisionV1[];
  readonly warnings: readonly DiagnosticWarningV1[];
  readonly redactions: readonly DiagnosticRedactionV1[];
  readonly configuration?: RedactedConfigurationDiagnosticV1;
  readonly authority?: RedactedAuthorityDiagnosticV1;
  readonly binding?: BindingDiagnosticV1;
  readonly selection?: SelectionDiagnosticV1;
  readonly projection?: ProjectionDiagnosticV1;
  readonly extensions?: Readonly<Record<string, DiagnosticJsonValue>>;
}

export type DiagnosticRequest = DiagnosticRequestV1;
export type DiagnosticEnvelope = DiagnosticEnvelopeV1;
