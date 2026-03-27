import { describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import {
  getLayerCreateGuard,
  repairExistingLayerConstraints,
  validateExistingLayerConstraints,
} from './LayerConstraintService';

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation' }): LayerDocType {
  const now = '2026-03-25T00:00:00.000Z';
  return {
    ...overrides,
    id: overrides.id,
    textId: 'text_1',
    key: `${overrides.layerType}_${overrides.id}`,
    name: { zho: overrides.id },
    layerType: overrides.layerType,
    languageId: 'zho',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

describe('LayerConstraintService constraint mode guards', () => {
  it('allows time_subdivision when supported parent exists', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', languageId: 'zho' }),
    ];

    const guard = getLayerCreateGuard(layers, 'translation', {
      languageId: 'eng',
      constraint: 'time_subdivision',
      hasSupportedParent: true,
    });

    expect(guard.allowed).toBe(true);
  });

  it('blocks time_subdivision when runtime capability is explicitly disabled', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', languageId: 'zho' }),
    ];

    const guard = getLayerCreateGuard(layers, 'translation', {
      languageId: 'eng',
      constraint: 'time_subdivision',
      hasSupportedParent: true,
      runtimeCapabilities: { time_subdivision: false },
    });

    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe('constraint-runtime-not-supported');
  });

  it('requires root transcription to use independent boundary', () => {
    const guard = getLayerCreateGuard([], 'transcription', {
      languageId: 'zho',
      constraint: 'symbolic_association',
      hasSupportedParent: false,
    });

    expect(guard.allowed).toBe(false);
    expect(guard.reasonCode).toBe('invalid-constraint-for-root-transcription');
  });

  it('allows symbolic_association for translation when parent exists', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', languageId: 'zho' }),
    ];

    const guard = getLayerCreateGuard(layers, 'translation', {
      languageId: 'eng',
      constraint: 'symbolic_association',
      hasSupportedParent: true,
    });

    expect(guard.allowed).toBe(true);
  });

  it('reports legacy layers with missing parent for symbolic/time subdivision', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'trl_bad_1', layerType: 'translation', constraint: 'symbolic_association' }),
      makeLayer({ id: 'trl_bad_2', layerType: 'translation', constraint: 'time_subdivision' }),
    ];

    const issues = validateExistingLayerConstraints(layers);
    const missingParentIssues = issues.filter((issue) => issue.code === 'missing-parent-layer');
    expect(missingParentIssues).toHaveLength(2);
  });

  it('does not report time_subdivision as runtime-disabled by default', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({
        id: 'trl_sub',
        layerType: 'translation',
        constraint: 'time_subdivision',
        parentLayerId: 'trc_1',
      }),
    ];

    const issues = validateExistingLayerConstraints(layers);
    expect(issues.some((issue) => issue.code === 'constraint-runtime-not-supported')).toBe(false);
  });

  it('reports time_subdivision as runtime-disabled when explicitly off', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({
        id: 'trl_sub',
        layerType: 'translation',
        constraint: 'time_subdivision',
        parentLayerId: 'trc_1',
      }),
    ];

    const issues = validateExistingLayerConstraints(layers, { time_subdivision: false });
    expect(issues.some((issue) => issue.code === 'constraint-runtime-not-supported')).toBe(true);
  });

  it('repairs missing parent by binding translation to transcription root', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({ id: 'trl_1', layerType: 'translation', constraint: 'symbolic_association' }),
    ];

    const repaired = repairExistingLayerConstraints(layers);
    const trl = repaired.layers.find((layer) => layer.id === 'trl_1');

    expect(trl?.parentLayerId).toBe('trc_1');
    expect(repaired.repairs.some((item) => item.code === 'missing-parent-layer')).toBe(true);
  });

  it('keeps time_subdivision intact when runtime is enabled by default', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({
        id: 'trl_1',
        layerType: 'translation',
        constraint: 'time_subdivision',
        parentLayerId: 'trc_1',
      }),
    ];

    const repaired = repairExistingLayerConstraints(layers);
    const trl = repaired.layers.find((layer) => layer.id === 'trl_1');

    expect(trl?.constraint).toBe('time_subdivision');
    expect(trl?.parentLayerId).toBe('trc_1');
    expect(repaired.repairs.some((item) => item.code === 'constraint-runtime-not-supported')).toBe(false);
  });

  it('repairs time_subdivision to symbolic association when explicitly disabled', () => {
    const layers: LayerDocType[] = [
      makeLayer({ id: 'trc_1', layerType: 'transcription', constraint: 'independent_boundary' }),
      makeLayer({
        id: 'trl_1',
        layerType: 'translation',
        constraint: 'time_subdivision',
        parentLayerId: 'trc_1',
      }),
    ];

    const repaired = repairExistingLayerConstraints(layers, { time_subdivision: false });
    const trl = repaired.layers.find((layer) => layer.id === 'trl_1');

    expect(trl?.constraint).toBe('symbolic_association');
    expect(trl?.parentLayerId).toBe('trc_1');
    expect(repaired.repairs.some((item) => item.code === 'constraint-runtime-not-supported')).toBe(true);
  });
});
