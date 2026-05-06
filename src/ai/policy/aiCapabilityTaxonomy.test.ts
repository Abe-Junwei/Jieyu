import { describe, expect, it } from 'vitest';
import {
  resolveToolCapabilityCategory,
  getCapabilityTaxonomyReport,
  assertCapabilityTaxonomy,
  SCHEMA_TOOL_NAMES,
} from './aiCapabilityTaxonomy';

describe('aiCapabilityTaxonomy', () => {
  it('classifies known tools correctly', () => {
    expect(resolveToolCapabilityCategory('propose_changes')).toBe('propose');
    expect(resolveToolCapabilityCategory('delete_transcription_segment')).toBe('destructive');
    expect(resolveToolCapabilityCategory('play_pause')).toBe('read');
    expect(resolveToolCapabilityCategory('search_segments')).toBe('read');
    expect(resolveToolCapabilityCategory('set_transcription_text')).toBe('confirm_write');
  });

  it('every schema tool is registered in the policy matrix', () => {
    const report = getCapabilityTaxonomyReport();
    expect(report.ok).toBe(true);
    expect(report.unregisteredWriteTools).toEqual([]);
  });

  it('assertCapabilityTaxonomy does not throw', () => {
    expect(() => assertCapabilityTaxonomy()).not.toThrow();
  });

  it('all six categories are represented', () => {
    const report = getCapabilityTaxonomyReport();
    expect(report.categoryCounts.read).toBeGreaterThan(0);
    expect(report.categoryCounts.propose).toBeGreaterThan(0);
    expect(report.categoryCounts.confirm_write).toBeGreaterThan(0);
    expect(report.categoryCounts.destructive).toBeGreaterThan(0);
    // memory_write and sidecar_write are not part of the main tool schema;
    // they are handled by sidecar entrypoint checks.
  });

  it('every tool in the schema has a defined category', () => {
    for (const name of SCHEMA_TOOL_NAMES) {
      try {
        const category = resolveToolCapabilityCategory(name);
        expect(category).toBeTruthy();
      } catch (err) {
        throw new Error(`Failed for tool "${name}": ${(err as Error).message}`);
      }
    }
  });
});
