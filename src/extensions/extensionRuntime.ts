import { featureFlags } from '../ai/config/featureFlags';
import { resolveExtensionTrustDecision, type ExtensionInvocationRecord } from './extensionTrustGovernance';

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

export class ExtensionCapabilityDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtensionCapabilityDeniedError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseSemver(input: string): [number, number, number] | null {
  const normalized = input.trim();
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every((part) => Number.isInteger(part) && part >= 0)) {
    return null;
  }
  return [major, minor, patch];
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (!leftParts || !rightParts) {
    throw new Error(`Invalid semver compare: left=${left}, right=${right}`);
  }
  const [leftMajor, leftMinor, leftPatch] = leftParts;
  const [rightMajor, rightMinor, rightPatch] = rightParts;
  if (leftMajor !== rightMajor) return leftMajor > rightMajor ? 1 : -1;
  if (leftMinor !== rightMinor) return leftMinor > rightMinor ? 1 : -1;
  if (leftPatch !== rightPatch) return leftPatch > rightPatch ? 1 : -1;
  return 0;
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return task;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Extension lifecycle timeout: ${timeoutMs}ms`));
    }, timeoutMs);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const KNOWN_CAPABILITIES: ExtensionCapability[] = [
  'read.transcription',
  'write.transcription',
  'read.language-assets',
  'write.language-assets',
  'invoke.ai',
];

function isKnownCapability(value: string): value is ExtensionCapability {
  return KNOWN_CAPABILITIES.includes(value as ExtensionCapability);
}

export function validateExtensionManifest(input: unknown): ManifestValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ['Manifest must be an object.'] };
  }

  if (input.schemaVersion !== EXTENSION_MANIFEST_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EXTENSION_MANIFEST_SCHEMA_VERSION}.`);
  }
  if (!isNonEmptyString(input.id)) {
    errors.push('id must be a non-empty string.');
  }
  if (!isNonEmptyString(input.name)) {
    errors.push('name must be a non-empty string.');
  }
  if (!isNonEmptyString(input.version) || !parseSemver(input.version)) {
    errors.push('version must be a valid semver string.');
  }

  const engine = input.engine;
  if (!isRecord(engine)) {
    errors.push('engine must be an object.');
  } else {
    if (!isNonEmptyString(engine.minHostVersion) || !parseSemver(engine.minHostVersion)) {
      errors.push('engine.minHostVersion must be a valid semver string.');
    }
    if (
      'maxHostVersion' in engine
      && (!isNonEmptyString(engine.maxHostVersion) || !parseSemver(engine.maxHostVersion))
    ) {
      errors.push('engine.maxHostVersion must be a valid semver string when provided.');
    }
  }

  const capabilitiesRaw = input.capabilities;
  if (!Array.isArray(capabilitiesRaw) || capabilitiesRaw.length === 0) {
    errors.push('capabilities must be a non-empty array.');
  } else {
    const seen = new Set<string>();
    for (const item of capabilitiesRaw) {
      if (!isNonEmptyString(item) || !isKnownCapability(item)) {
        errors.push(`Unknown capability: ${String(item)}`);
        continue;
      }
      if (seen.has(item)) {
        errors.push(`Duplicate capability: ${item}`);
      }
      seen.add(item);
    }
  }

  const entry = input.entry;
  if (!isRecord(entry)) {
    errors.push('entry must be an object.');
  } else {
    if (!isNonEmptyString(entry.activate)) {
      errors.push('entry.activate must be a non-empty string.');
    }
    if ('deactivate' in entry && !isNonEmptyString(entry.deactivate)) {
      errors.push('entry.deactivate must be a non-empty string when provided.');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const manifest: ExtensionManifestV1 = {
    schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
    id: String(input.id),
    name: String(input.name),
    version: String(input.version),
    engine: {
      minHostVersion: String((input.engine as Record<string, unknown>).minHostVersion),
      ...('maxHostVersion' in (input.engine as Record<string, unknown>)
        ? { maxHostVersion: String((input.engine as Record<string, unknown>).maxHostVersion) }
        : {}),
    },
    capabilities: (input.capabilities as string[]).slice() as ExtensionCapability[],
    entry: {
      activate: String((input.entry as Record<string, unknown>).activate),
      ...('deactivate' in (input.entry as Record<string, unknown>)
        ? { deactivate: String((input.entry as Record<string, unknown>).deactivate) }
        : {}),
    },
  };

  return {
    ok: true,
    errors: [],
    manifest,
  };
}

export function negotiateManifestCompatibility(
  manifest: ExtensionManifestV1,
  hostVersion: string,
): CompatibilityResult {
  if (!parseSemver(hostVersion)) {
    return { compatible: false, reason: `Invalid host version: ${hostVersion}` };
  }
  if (compareSemver(hostVersion, manifest.engine.minHostVersion) < 0) {
    return {
      compatible: false,
      reason: `hostVersion ${hostVersion} is lower than minHostVersion ${manifest.engine.minHostVersion}`,
    };
  }
  if (manifest.engine.maxHostVersion && compareSemver(hostVersion, manifest.engine.maxHostVersion) > 0) {
    return {
      compatible: false,
      reason: `hostVersion ${hostVersion} is higher than maxHostVersion ${manifest.engine.maxHostVersion}`,
    };
  }
  return { compatible: true, reason: 'compatible' };
}

export interface ExtensionHost {
  getState: () => ExtensionLifecycleState;
  getManifest: () => ExtensionManifestV1 | null;
  load: (manifest: ExtensionManifestV1, hooks: ExtensionHooks) => Promise<ExtensionLoadResult>;
  invokeCapability: (capability: ExtensionCapability, payload: unknown) => Promise<unknown>;
  deactivate: () => Promise<void>;
  unload: () => Promise<void>;
}

export function createExtensionHost(options: ExtensionHostOptions): ExtensionHost {
  const timeoutMs = options.activationTimeoutMs ?? 10_000;
  const capabilityTimeoutMs = options.capabilityInvocationTimeoutMs ?? 0;
  let state: ExtensionLifecycleState = 'idle';
  let manifest: ExtensionManifestV1 | null = null;
  let hooks: ExtensionHooks | null = null;
  const recentInvocations: ExtensionInvocationRecord[] = [];

  const getActivationContext = (): ExtensionActivationContext => {
    if (!manifest) {
      throw new Error('No extension manifest loaded.');
    }
    return {
      hostVersion: options.hostVersion,
      manifest,
    };
  };

  const deactivate = async (): Promise<void> => {
    if (!manifest || !hooks || state !== 'active') {
      return;
    }
    if (hooks.deactivate) {
      await withTimeout(Promise.resolve(hooks.deactivate(getActivationContext())), timeoutMs);
    }
    state = 'loaded';
  };

  const unload = async (): Promise<void> => {
    try {
      await deactivate();
    } finally {
      state = 'unloaded';
      manifest = null;
      hooks = null;
    }
  };

  const load = async (
    nextManifest: ExtensionManifestV1,
    nextHooks: ExtensionHooks,
  ): Promise<ExtensionLoadResult> => {
    if (manifest) {
      await unload();
    }

    let compatibility: CompatibilityResult;
    try {
      compatibility = negotiateManifestCompatibility(nextManifest, options.hostVersion);
    } catch (error) {
      state = 'disabled';
      return {
        ok: false,
        degraded: true,
        reason: `compatibility_error: ${String(error instanceof Error ? error.message : error)}`,
      };
    }
    if (!compatibility.compatible) {
      state = 'disabled';
      return {
        ok: false,
        degraded: true,
        reason: `compatibility_denied: ${compatibility.reason}`,
      };
    }

    manifest = nextManifest;
    hooks = nextHooks;
    state = 'loaded';

    try {
      await withTimeout(Promise.resolve(nextHooks.activate(getActivationContext())), timeoutMs);
      state = 'active';
      return {
        ok: true,
        degraded: false,
        reason: 'loaded',
      };
    } catch (error) {
      manifest = null;
      hooks = null;
      state = 'error';
      return {
        ok: false,
        degraded: true,
        reason: `activate_failed: ${String(error instanceof Error ? error.message : error)}`,
      };
    }
  };

  const invokeCapability = async (capability: ExtensionCapability, payload: unknown): Promise<unknown> => {
    if (!manifest || !hooks || state !== 'active') {
      throw new ExtensionCapabilityDeniedError('Extension is not active.');
    }
    if (!manifest.capabilities.includes(capability)) {
      throw new ExtensionCapabilityDeniedError(`Capability not declared in manifest: ${capability}`);
    }
    const handler = options.capabilityHandlers[capability];
    if (!handler) {
      throw new ExtensionCapabilityDeniedError(`Capability not allowed by host: ${capability}`);
    }
    const activeManifest = manifest;
    const extensionId = activeManifest.id;
    const started = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const emitAudit = (ok: boolean, errorMessage?: string, denyReason?: string): void => {
      const end = typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
      const durationMs = Math.round(end - started);
      options.onCapabilityAudit?.({
        extensionId,
        capability,
        ok,
        durationMs,
        ...(activeManifest.trustLevel ? { trustLevel: activeManifest.trustLevel } : {}),
        ...(denyReason ? { denyReason } : {}),
        ...(typeof errorMessage === 'string' && errorMessage.length > 0 ? { errorMessage } : {}),
      });
      recentInvocations.push({ extensionId, capability, timestampMs: Date.now(), ok });
      if (recentInvocations.length > 500) recentInvocations.splice(0, recentInvocations.length - 500);
    };
    const trustDecision = resolveExtensionTrustDecision({ enabled: featureFlags.aiExtensionTrustGovernanceEnabled, manifest: activeManifest, capability, recentInvocations });
    if (trustDecision.action === 'deny') {
      const message = `Extension capability denied by trust governance: ${trustDecision.reason}`;
      emitAudit(false, message, trustDecision.reason);
      throw new ExtensionCapabilityDeniedError(message);
    }
    const context: ExtensionInvocationContext = {
      hostVersion: options.hostVersion,
      manifest: activeManifest,
    };
    try {
      const result = await withTimeout(
        Promise.resolve(handler(payload, context)),
        capabilityTimeoutMs,
      );
      emitAudit(true);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitAudit(false, message);
      throw error;
    }
  };

  return {
    getState: () => state,
    getManifest: () => manifest,
    load,
    invokeCapability,
    deactivate,
    unload,
  };
}
