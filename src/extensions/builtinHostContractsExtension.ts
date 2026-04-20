import {
  EXTENSION_MANIFEST_SCHEMA_VERSION,
  type ExtensionHooks,
  type ExtensionManifestV1,
} from './extensionRuntime';

/** 内置官方契约探针扩展 id | Built-in official contract probe extension id */
export const BUILTIN_HOST_CONTRACTS_EXTENSION_ID = 'jieyu.official.host-contracts';

export const builtinHostContractsManifest: ExtensionManifestV1 = {
  schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
  id: BUILTIN_HOST_CONTRACTS_EXTENSION_ID,
  name: 'Host extension contracts (built-in)',
  version: '1.0.0',
  engine: { minHostVersion: '1.0.0' },
  capabilities: ['read.transcription'],
  entry: { activate: 'builtin#activate' },
};

export const builtinHostContractsHooks: ExtensionHooks = {
  activate: async () => {},
};
