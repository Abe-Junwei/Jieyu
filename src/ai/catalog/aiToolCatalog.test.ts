import { describe, expect, it } from 'vitest';
import {
  assertAiToolCatalogParity,
  assertBackgroundCatalogTool,
  BackgroundCatalogTrustError,
  getAiToolCatalogEntry,
  getAiToolCatalogParityReport,
  listAiToolCatalogEntries,
  resolveToolCatalogTrust,
} from './aiToolCatalog';
import {
  AI_TOOL_REGISTRY_SHADOW,
  getAiToolRegistryShadowEntry,
} from '../vertical/aiToolRegistryShadow';

describe('aiToolCatalog', () => {
  it('parity report has no orphan tools (policy vs schema)', () => {
    const report = getAiToolCatalogParityReport();
    expect(report.ok).toBe(true);
    expect(report.policyOnlyTools).toEqual([]);
    expect(report.schemaOnlyTools).toEqual([]);
  });

  it('assertParity does not throw', () => {
    expect(() => assertAiToolCatalogParity()).not.toThrow();
  });

  it('shadow re-exports the same catalog entries', () => {
    expect(getAiToolRegistryShadowEntry('set_transcription_text')).toBe(
      getAiToolCatalogEntry('set_transcription_text'),
    );
    expect(Object.keys(AI_TOOL_REGISTRY_SHADOW)).toEqual(
      listAiToolCatalogEntries().map((entry) => entry.toolName),
    );
  });

  it('marks write-like tools interactive and readonly local-context tools background', () => {
    expect(getAiToolCatalogEntry('set_transcription_text').trust).toBe('interactive');
    expect(getAiToolCatalogEntry('propose_changes').trust).toBe('interactive');
    expect(resolveToolCatalogTrust('search_units')).toBe('background');
    expect(resolveToolCatalogTrust('list_layers')).toBe('background');
    expect(resolveToolCatalogTrust('batch_apply')).toBe('interactive');
    expect(() => assertBackgroundCatalogTool('batch_apply')).toThrow(BackgroundCatalogTrustError);
    expect(() => assertBackgroundCatalogTool('search_units')).not.toThrow();
  });
});
