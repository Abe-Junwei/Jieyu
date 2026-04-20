import { describe, expect, it } from 'vitest';

import { createExtensionHost, EXTENSION_MANIFEST_SCHEMA_VERSION, ExtensionCapabilityDeniedError, negotiateManifestCompatibility, validateExtensionManifest, type ExtensionManifestV1 } from './extensionRuntime';

function buildManifest(overrides?: Partial<ExtensionManifestV1>): ExtensionManifestV1 {
  return {
    schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
    id: 'extension.demo',
    name: 'Demo Extension',
    version: '1.0.0',
    engine: {
      minHostVersion: '1.0.0',
      maxHostVersion: '2.0.0',
    },
    capabilities: ['read.transcription'],
    entry: {
      activate: 'index.js#activate',
      deactivate: 'index.js#deactivate',
    },
    ...overrides,
  };
}

describe('extension runtime contracts', () => {
  it('[capability] blocks undeclared capability invocation', async () => {
    const host = createExtensionHost({
      hostVersion: '1.5.0',
      capabilityHandlers: {
        'read.transcription': async () => ({ ok: true }),
        'write.transcription': async () => ({ ok: true }),
      },
    });

    const loadResult = await host.load(buildManifest(), {
      activate: async () => {},
      deactivate: async () => {},
    });

    expect(loadResult.ok).toBe(true);
    await expect(host.invokeCapability('read.transcription', { id: 'seg-1' })).resolves.toEqual({ ok: true });
    await expect(host.invokeCapability('write.transcription', { id: 'seg-1' })).rejects.toThrow(
      ExtensionCapabilityDeniedError,
    );
  });

  it('[lifecycle] degrades to disabled state when load activation fails', async () => {
    const host = createExtensionHost({
      hostVersion: '1.5.0',
      capabilityHandlers: {
        'read.transcription': async () => ({ ok: true }),
      },
    });

    const result = await host.load(buildManifest(), {
      activate: async () => {
        throw new Error('bootstrap failed');
      },
      deactivate: async () => {},
    });

    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.reason.includes('activate_failed')).toBe(true);
    expect(host.getState()).toBe('error');
    expect(host.getManifest()).toBeNull();
  });

  it('[compat] accepts host version within range', () => {
    const result = negotiateManifestCompatibility(buildManifest(), '1.5.0');
    expect(result.compatible).toBe(true);
  });

  it('[compat] rejects host version lower than minHostVersion', () => {
    const result = negotiateManifestCompatibility(buildManifest(), '0.9.0');
    expect(result.compatible).toBe(false);
    expect(result.reason.includes('lower than minHostVersion')).toBe(true);
  });

  it('[compat] rejects host version higher than maxHostVersion', () => {
    const result = negotiateManifestCompatibility(buildManifest(), '3.1.0');
    expect(result.compatible).toBe(false);
    expect(result.reason.includes('higher than maxHostVersion')).toBe(true);
  });

  it('[compat] validates manifest schema and known capability list', () => {
    const okResult = validateExtensionManifest(buildManifest());
    expect(okResult.ok).toBe(true);

    const badResult = validateExtensionManifest({
      schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
      id: 'extension.bad',
      name: 'Bad Extension',
      version: '1.0.0',
      engine: { minHostVersion: '1.0.0' },
      capabilities: ['unknown.capability'],
      entry: { activate: 'index.js#activate' },
    });

    expect(badResult.ok).toBe(false);
    expect(badResult.errors.some((item) => item.includes('Unknown capability'))).toBe(true);
  });

  it('[compat] degrades gracefully when manifest semver is malformed at load time', async () => {
    const host = createExtensionHost({
      hostVersion: '1.5.0',
      capabilityHandlers: {
        'read.transcription': async () => ({ ok: true }),
      },
    });

    const result = await host.load(
      buildManifest({
        engine: {
          minHostVersion: 'invalid-semver',
          maxHostVersion: '2.0.0',
        },
      }),
      {
        activate: async () => {},
      },
    );

    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.reason.includes('compatibility_error')).toBe(true);
    expect(host.getState()).toBe('disabled');
  });

  it('[invoke] emits audit on success and failure', async () => {
    const audits: Array<{ ok: boolean; capability: string }> = [];
    const host = createExtensionHost({
      hostVersion: '1.5.0',
      capabilityHandlers: {
        'read.transcription': async () => ({ ok: 1 }),
        'invoke.ai': async () => {
          throw new Error('handler boom');
        },
      },
      onCapabilityAudit: (evt) => {
        audits.push({ ok: evt.ok, capability: evt.capability });
      },
    });

    await host.load(
      buildManifest({ capabilities: ['read.transcription', 'invoke.ai'] }),
      { activate: async () => {} },
    );

    await expect(host.invokeCapability('read.transcription', {})).resolves.toEqual({ ok: 1 });
    await expect(host.invokeCapability('invoke.ai', {})).rejects.toThrow('handler boom');

    expect(audits.filter((a) => a.capability === 'read.transcription' && a.ok).length).toBe(1);
    expect(audits.some((a) => a.capability === 'invoke.ai' && !a.ok)).toBe(true);
  });

  it('[invoke] applies capability timeout when configured', async () => {
    const host = createExtensionHost({
      hostVersion: '1.5.0',
      capabilityHandlers: {
        'read.transcription': async () => new Promise((resolve) => {
          setTimeout(() => resolve({ slow: true }), 50);
        }),
      },
      capabilityInvocationTimeoutMs: 5,
    });

    await host.load(buildManifest(), { activate: async () => {} });
    await expect(host.invokeCapability('read.transcription', {})).rejects.toThrow(/Extension lifecycle timeout/i);
  });
});
