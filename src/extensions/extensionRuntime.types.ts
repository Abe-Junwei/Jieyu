export const EXTENSION_MANIFEST_SCHEMA_VERSION = '1.0.0' as const;

export type ExtensionCapability =
  | 'read.transcription'
  | 'write.transcription'
  | 'read.language-assets'
  | 'write.language-assets'
  | 'invoke.ai';

export type ExtensionTrustLevel = 'official' | 'trusted' | 'community' | 'untrusted';

export interface ExtensionManifestV1 {
  schemaVersion: typeof EXTENSION_MANIFEST_SCHEMA_VERSION;
  id: string;
  name: string;
  version: string;
  engine: {
    minHostVersion: string;
    maxHostVersion?: string;
  };
  capabilities: ExtensionCapability[];
  trustLevel?: ExtensionTrustLevel;
  declaredCapabilitiesVersion?: string;
  quotaProfile?: {
    maxCallsPerMinute?: number;
  };
  entry: {
    activate: string;
    deactivate?: string;
  };
}

export type ExtensionLifecycleState =
  | 'idle'
  | 'loaded'
  | 'active'
  | 'disabled'
  | 'unloaded'
  | 'error';

export interface ManifestValidationResult {
  ok: boolean;
  errors: string[];
  manifest?: ExtensionManifestV1;
}

export interface CompatibilityResult {
  compatible: boolean;
  reason: string;
}

export interface ExtensionActivationContext {
  hostVersion: string;
  manifest: ExtensionManifestV1;
}

export interface ExtensionInvocationContext {
  hostVersion: string;
  manifest: ExtensionManifestV1;
}

export interface ExtensionHooks {
  activate: (context: ExtensionActivationContext) => Promise<void> | void;
  deactivate?: (context: ExtensionActivationContext) => Promise<void> | void;
}

export interface ExtensionLoadResult {
  ok: boolean;
  degraded: boolean;
  reason: string;
}

export type CapabilityHandler = (payload: unknown, context: ExtensionInvocationContext) => Promise<unknown> | unknown;

export type ExtensionCapabilityAuditPayload = {
  extensionId: string;
  capability: ExtensionCapability;
  ok: boolean;
  durationMs: number;
  errorMessage?: string;
  trustLevel?: ExtensionTrustLevel;
  denyReason?: string;
};

export interface ExtensionHostOptions {
  hostVersion: string;
  capabilityHandlers: Partial<Record<ExtensionCapability, CapabilityHandler>>;
  activationTimeoutMs?: number;
  /** 单次能力调用超时（ms）；≤0 或未设置则不套超时 | Per-invocation timeout; omit or ≤0 to disable */
  capabilityInvocationTimeoutMs?: number;
  onCapabilityAudit?: (payload: ExtensionCapabilityAuditPayload) => void;
}
