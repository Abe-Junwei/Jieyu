// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createExtensionRegistry } from './extensionRegistry';
import { EXTENSION_MANIFEST_SCHEMA_VERSION, type ExtensionHooks, type ExtensionManifestV1 } from './extensionRuntime';

function sampleManifest(overrides?: Partial<ExtensionManifestV1>): ExtensionManifestV1 {
  return {
    schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
    id: 'ext.registry.test',
    name: 'Registry Test',
    version: '1.0.0',
    engine: { minHostVersion: '1.0.0', maxHostVersion: '99.0.0' },
    capabilities: ['read.transcription'],
    entry: { activate: 'test#activate' },
    ...overrides,
  };
}

describe('extensionRegistry', () => {
  it('registers official extension and lists metadata', async () => {
    const reg = createExtensionRegistry({
      hostVersion: '1.0.0',
      capabilityHandlers: {
        'read.transcription': async () => ({ ok: true }),
      },
    });
    const hooks: ExtensionHooks = { activate: async () => {} };
    const result = await reg.registerOfficial(sampleManifest(), hooks);
    expect(result.ok).toBe(true);
    const rows = reg.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('ext.registry.test');
    expect(rows[0]?.compatible).toBe(true);
    expect(rows[0]?.state).toBe('active');
    expect(rows[0]?.entryActivate).toBe('test#activate');
  });

  it('records capability audit via nested host', async () => {
    const reg = createExtensionRegistry({
      hostVersion: '1.0.0',
      capabilityHandlers: {
        'read.transcription': async () => ({ audited: true }),
      },
    });
    await reg.registerOfficial(sampleManifest(), { activate: async () => {} });
    await expect(reg.invokeCapability('ext.registry.test', 'read.transcription', {})).resolves.toEqual({ audited: true });
    const tail = reg.getCapabilityAuditTail(5);
    expect(tail.length).toBeGreaterThanOrEqual(1);
    expect(tail[tail.length - 1]?.ok).toBe(true);
    expect(tail[tail.length - 1]?.extensionId).toBe('ext.registry.test');
  });

  it('rejects invalid manifest and keeps failure snapshot visible', async () => {
    const reg = createExtensionRegistry({
      hostVersion: '1.0.0',
      capabilityHandlers: { 'read.transcription': async () => ({}) },
    });
    const bad = { ...sampleManifest(), capabilities: [] } as unknown as ExtensionManifestV1;
    const result = await reg.registerOfficial(bad, { activate: async () => {} });
    expect(result.ok).toBe(false);
    const rows = reg.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('ext.registry.test');
    expect(rows[0]?.state).toBe('disabled');
    expect(rows[0]?.lastLoadReason).toContain('capabilities must be a non-empty array');
  });

  it('keeps compatibility denied extension visible in list', async () => {
    const reg = createExtensionRegistry({
      hostVersion: '0.0.0',
      capabilityHandlers: { 'read.transcription': async () => ({}) },
    });
    const result = await reg.registerOfficial(sampleManifest(), { activate: async () => {} });
    expect(result.ok).toBe(false);

    const rows = reg.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('ext.registry.test');
    expect(rows[0]?.compatible).toBe(false);
    expect(rows[0]?.state).toBe('disabled');
    expect(rows[0]?.compatibilityReason).toContain('hostVersion 0.0.0 is lower than minHostVersion 1.0.0');
    expect(rows[0]?.lastLoadReason).toContain('compatibility_denied:');
  });
});
