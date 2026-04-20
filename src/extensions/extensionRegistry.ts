import {
  createExtensionHost,
  negotiateManifestCompatibility,
  validateExtensionManifest,
  type ExtensionCapability,
  type ExtensionCapabilityAuditPayload,
  type ExtensionHostOptions,
  type ExtensionHooks,
  type ExtensionHost,
  type ExtensionLifecycleState,
  type ExtensionLoadResult,
  type ExtensionManifestV1,
} from './extensionRuntime';

export type ExtensionSource = 'official';

export type ExtensionCapabilityInvocationRecord = ExtensionCapabilityAuditPayload & { at: number };

export interface ExtensionListItem {
  id: string;
  name: string;
  version: string;
  capabilities: ExtensionCapability[];
  state: ExtensionLifecycleState;
  source: ExtensionSource;
  compatible: boolean;
  compatibilityReason: string;
  lastLoadReason: string;
  /** Manifest 契约字段；实际 hooks 由宿主注册时注入 | Declared entry; hooks injected by host at register time */
  entryActivate: string;
}

export interface ExtensionRegistry {
  getHostVersion: () => string;
  list: () => ExtensionListItem[];
  getCapabilityAuditTail: (max?: number) => ExtensionCapabilityInvocationRecord[];
  registerOfficial: (manifest: ExtensionManifestV1, hooks: ExtensionHooks) => Promise<ExtensionLoadResult>;
  unregister: (id: string) => Promise<void>;
  invokeCapability: (extensionId: string, capability: ExtensionCapability, payload: unknown) => Promise<unknown>;
}

const DEFAULT_AUDIT_CAP = 200;

type ExtensionRegistrationSnapshot = {
  manifest: ExtensionManifestV1;
  source: ExtensionSource;
  state: ExtensionLifecycleState;
  loadReason: string;
};

export function createExtensionRegistry(input: {
  hostVersion: string;
  capabilityHandlers: ExtensionHostOptions['capabilityHandlers'];
  activationTimeoutMs?: number;
  capabilityInvocationTimeoutMs?: number;
}): ExtensionRegistry {
  const auditLog: ExtensionCapabilityInvocationRecord[] = [];
  const hosts = new Map<string, ExtensionHost>();
  const snapshots = new Map<string, ExtensionRegistrationSnapshot>();

  const pushAudit = (payload: ExtensionCapabilityAuditPayload): void => {
    auditLog.push({ ...payload, at: Date.now() });
    if (auditLog.length > DEFAULT_AUDIT_CAP) {
      auditLog.splice(0, auditLog.length - DEFAULT_AUDIT_CAP);
    }
  };

  const buildHost = (): ExtensionHost => createExtensionHost({
    hostVersion: input.hostVersion,
    capabilityHandlers: input.capabilityHandlers,
    ...(input.activationTimeoutMs !== undefined ? { activationTimeoutMs: input.activationTimeoutMs } : {}),
    ...(input.capabilityInvocationTimeoutMs !== undefined ? { capabilityInvocationTimeoutMs: input.capabilityInvocationTimeoutMs } : {}),
    onCapabilityAudit: pushAudit,
  });

  return {
    getHostVersion: () => input.hostVersion,

    list: (): ExtensionListItem[] => {
      const out: ExtensionListItem[] = [];
      for (const [id, snapshot] of snapshots) {
        const host = hosts.get(id);
        const m = host?.getManifest() ?? snapshot.manifest;
        const compat = negotiateManifestCompatibility(m, input.hostVersion);
        const isCompatibilityDenied = snapshot.loadReason.startsWith('compatibility_denied:');
        const compatibilityReason = isCompatibilityDenied
          ? snapshot.loadReason.slice('compatibility_denied:'.length).trim()
          : compat.reason;
        out.push({
          id,
          name: m?.name ?? id,
          version: m?.version ?? '—',
          capabilities: m?.capabilities ?? [],
          state: host?.getState() ?? snapshot.state,
          source: snapshot.source,
          compatible: compat.compatible && !isCompatibilityDenied,
          compatibilityReason,
          lastLoadReason: snapshot.loadReason,
          entryActivate: m?.entry.activate ?? '',
        });
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    },

    getCapabilityAuditTail: (max = 50): ExtensionCapabilityInvocationRecord[] => {
      if (max <= 0) return [];
      return auditLog.slice(-max);
    },

    registerOfficial: async (manifest: ExtensionManifestV1, hooks: ExtensionHooks): Promise<ExtensionLoadResult> => {
      const validated = validateExtensionManifest(manifest);
      if (!validated.ok || !validated.manifest) {
        const fallbackId = manifest.id?.trim() || '__invalid_manifest__';
        snapshots.set(fallbackId, {
          manifest,
          source: 'official',
          state: 'disabled',
          loadReason: validated.errors.join('; '),
        });
        return { ok: false, degraded: false, reason: validated.errors.join('; ') };
      }
      const id = validated.manifest.id;
      const existing = hosts.get(id);
      if (existing) {
        await existing.unload();
        hosts.delete(id);
      }
      const host = buildHost();
      const result = await host.load(validated.manifest, hooks);
      snapshots.set(id, {
        manifest: validated.manifest,
        source: 'official',
        state: host.getState(),
        loadReason: result.reason,
      });
      if (result.ok) {
        hosts.set(id, host);
      } else {
        hosts.delete(id);
      }
      return result;
    },

    unregister: async (id: string): Promise<void> => {
      const h = hosts.get(id);
      if (h) {
        await h.unload();
        hosts.delete(id);
      }
      snapshots.delete(id);
    },

    invokeCapability: async (extensionId: string, capability: ExtensionCapability, payload: unknown) => {
      const h = hosts.get(extensionId);
      if (!h) {
        throw new Error(`Unknown extension: ${extensionId}`);
      }
      return h.invokeCapability(capability, payload);
    },
  };
}
