const EXTENSION_MANIFEST_SCHEMA_VERSION = '1.0.0' as const;

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

export type ExtensionCapabilityAuditPayload = {
  extensionId: string;
  capability: ExtensionCapability;
  ok: boolean;
  durationMs: number;
  errorMessage?: string;
  trustLevel?: ExtensionTrustLevel;
  denyReason?: string;
};
