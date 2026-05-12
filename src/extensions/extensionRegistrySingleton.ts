import { resolveHostVersion } from '../config/hostVersion';
import { createExtensionRegistry, type ExtensionRegistry } from './extensionRegistry';
import type { ExtensionCapability, CapabilityHandler } from './extensionRuntime';
import {
  builtinHostContractsHooks,
  builtinHostContractsManifest,
  BUILTIN_HOST_CONTRACTS_EXTENSION_ID,
} from './builtinHostContractsExtension';

const REGISTRY_STORAGE_KEY = 'jieyu.extensionRegistry.snapshots';

function createStubCapabilityHandlers(): Partial<Record<ExtensionCapability, CapabilityHandler>> {
  return {
    'read.transcription': async () => ({ stub: true }),
    'read.language-assets': async () => ({ stub: true }),
    'write.transcription': async () => ({ stub: true, noOp: true }),
    'write.language-assets': async () => ({ stub: true, noOp: true }),
    'invoke.ai': async () => ({ stub: true, noOp: true }),
  };
}

let registrySingleton: ExtensionRegistry | null = null;

export function getExtensionRegistry(): ExtensionRegistry {
  if (!registrySingleton) {
    registrySingleton = createExtensionRegistry({
      hostVersion: resolveHostVersion(),
      capabilityHandlers: createStubCapabilityHandlers(),
      activationTimeoutMs: 10_000,
      capabilityInvocationTimeoutMs: 30_000,
    });
    try {
      const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
      if (raw !== null && raw.length > 0) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          registrySingleton.importSnapshots(parsed);
        }
      }
    } catch {
      // 持久化恢复失败不阻断注册表创建
    }
  }
  return registrySingleton;
}

function persistRegistrySnapshots(): void {
  if (!registrySingleton) return;
  try {
    const snapshots = registrySingleton.exportSnapshots();
    localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // 持久化写入失败静默处理
  }
}

/** 首次打开设置「扩展」页时调用：注册内置探针（幂等） | Idempotent built-in probe registration */
export async function ensureBuiltinExtensionsLoaded(): Promise<void> {
  const reg = getExtensionRegistry();
  const existing = reg.list().find((row) => row.id === BUILTIN_HOST_CONTRACTS_EXTENSION_ID);
  if (existing?.state === 'active') {
    return;
  }
  const result = await reg.registerOfficial(
    builtinHostContractsManifest,
    builtinHostContractsHooks,
  );
  if (result.ok) {
    persistRegistrySnapshots();
  }
  if (!result.ok) {
    throw new Error(result.reason);
  }
}
