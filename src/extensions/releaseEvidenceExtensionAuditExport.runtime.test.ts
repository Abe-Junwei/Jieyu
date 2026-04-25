// @vitest-environment jsdom
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExtensionRegistry } from './extensionRegistry';
import { EXTENSION_MANIFEST_SCHEMA_VERSION, type ExtensionHooks, type ExtensionManifestV1 } from './extensionRuntime';

const DEFAULT_OUTPUT_RELATIVE_PATH = 'docs/execution/audits/extension-capability-audit-export-v1.ndjson';

function resolveExportOutputPath(): string {
  const configured = String(process.env.RELEASE_EVIDENCE_EXTENSION_CAPABILITY_AUDIT_EXPORT ?? '').trim();
  if (!configured) {
    return path.join(process.cwd(), DEFAULT_OUTPUT_RELATIVE_PATH);
  }
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function buildManifest(id: string): ExtensionManifestV1 {
  return {
    schemaVersion: EXTENSION_MANIFEST_SCHEMA_VERSION,
    id,
    name: `Release Evidence ${id}`,
    version: '1.0.0',
    engine: { minHostVersion: '1.0.0', maxHostVersion: '99.0.0' },
    capabilities: ['read.transcription'],
    entry: { activate: `${id}#activate` },
  };
}

describe('release evidence extension audit export runtime', () => {
  it('writes extension capability audit ndjson from runtime invocation path', async () => {
    const outputPath = resolveExportOutputPath();
    const registry = createExtensionRegistry({
      hostVersion: '1.0.0',
      capabilityHandlers: {
        'read.transcription': async (payload) => {
          const record = payload as { fail?: boolean } | null;
          if (record?.fail) {
            throw new Error('runtime export seed failure');
          }
          return { ok: true };
        },
      },
    });

    const hooks: ExtensionHooks = { activate: async () => {} };
    const extensionId = 'ext.release-evidence.runtime-export';
    const registerResult = await registry.registerOfficial(buildManifest(extensionId), hooks);
    expect(registerResult.ok).toBe(true);

    await expect(registry.invokeCapability(extensionId, 'read.transcription', { fail: false })).resolves.toEqual({ ok: true });
    await expect(registry.invokeCapability(extensionId, 'read.transcription', { fail: true })).rejects.toThrow(
      'runtime export seed failure',
    );

    const rows = registry.getCapabilityAuditTail(50)
      .filter((item) => item.extensionId === extensionId)
      .sort((left, right) => Number(left.at) - Number(right.at));
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const normalizedLines = rows.map((row) => JSON.stringify({
      extensionId: row.extensionId,
      capability: row.capability,
      ok: row.ok,
      durationMs: row.durationMs,
      errorMessage: row.errorMessage,
      at: row.at,
    }));

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${normalizedLines.join('\n')}\n`, 'utf8');

    const exportedText = await readFile(outputPath, 'utf8');
    const lines = exportedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const firstRow = JSON.parse(lines[0] ?? '{}') as {
      extensionId?: string;
      capability?: string;
      ok?: boolean;
    };
    expect(firstRow.extensionId).toBe(extensionId);
    expect(firstRow.capability).toBe('read.transcription');
    expect(typeof firstRow.ok).toBe('boolean');
  });
});
