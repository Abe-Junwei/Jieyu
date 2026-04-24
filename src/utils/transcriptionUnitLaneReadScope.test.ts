import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import {
  resolveCanonicalUnitForTranscriptionLaneRow,
  resolvePrimaryUnscopedTranscriptionHostId,
  transcriptionLaneAcceptsUnscopedCanonicalUnits,
} from './transcriptionUnitLaneReadScope';

function tr(id: string, constraint: LayerDocType['constraint'], parentLayerId?: string): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    key: id,
    name: { 'zh-CN': id, en: id },
    languageId: 'zh-CN',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'transcription',
    constraint,
    ...(parentLayerId ? { parentLayerId } : {}),
  } as LayerDocType;
}

function unit(id: string, layerId: string): LayerUnitDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    mediaId: 'm',
    layerId,
    startTime: 0,
    endTime: 1,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

describe('resolvePrimaryUnscopedTranscriptionHostId', () => {
  it('prefers default when it names a real transcription lane', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association', 'tr-parent');
    expect(resolvePrimaryUnscopedTranscriptionHostId([parent, dep], 'tr-parent')).toBe('tr-parent');
  });

  it('falls back to first transcription lane', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    expect(resolvePrimaryUnscopedTranscriptionHostId([parent], 'missing')).toBe('tr-parent');
  });
});

describe('transcriptionLaneAcceptsUnscopedCanonicalUnits', () => {
  it('accepts default host and dependent lanes under parent chain', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association', 'tr-parent');
    const layerById = new Map<string, LayerDocType>([
      ['tr-parent', parent],
      ['tr-dep', dep],
    ]);
    const transcriptionLaneIds = new Set(['tr-parent', 'tr-dep']);
    expect(
      transcriptionLaneAcceptsUnscopedCanonicalUnits({
        laneLayer: parent,
        layerById,
        transcriptionLaneIds,
        primaryUnscopedHostId: 'tr-parent',
      }),
    ).toBe(true);
    expect(
      transcriptionLaneAcceptsUnscopedCanonicalUnits({
        laneLayer: dep,
        layerById,
        transcriptionLaneIds,
        primaryUnscopedHostId: 'tr-parent',
      }),
    ).toBe(true);
  });

  it('accepts dependent lane under primary via inbound layer_links when parentLayerId is absent', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'independent_boundary');
    const layerById = new Map<string, LayerDocType>([
      ['tr-parent', parent],
      ['tr-dep', dep],
    ]);
    const transcriptionLaneIds = new Set(['tr-parent', 'tr-dep']);
    const layerLinks = [{
      layerId: 'tr-dep',
      transcriptionLayerKey: 'tr-parent',
      hostTranscriptionLayerId: 'tr-parent',
      isPreferred: true,
    }];
    expect(
      transcriptionLaneAcceptsUnscopedCanonicalUnits({
        laneLayer: dep,
        layerById,
        transcriptionLaneIds,
        primaryUnscopedHostId: 'tr-parent',
        layerLinks,
      }),
    ).toBe(true);
  });

  it('rejects sibling lane not under primary host', () => {
    const a = tr('tr-a', 'independent_boundary');
    const b = tr('tr-b', 'independent_boundary');
    const layerById = new Map<string, LayerDocType>([
      ['tr-a', a],
      ['tr-b', b],
    ]);
    const transcriptionLaneIds = new Set(['tr-a', 'tr-b']);
    expect(
      transcriptionLaneAcceptsUnscopedCanonicalUnits({
        laneLayer: b,
        layerById,
        transcriptionLaneIds,
        primaryUnscopedHostId: 'tr-a',
      }),
    ).toBe(false);
  });
});

describe('resolveCanonicalUnitForTranscriptionLaneRow', () => {
  it('includes unscoped unit on dependent lane with resolution unscoped_descendant', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association', 'tr-parent');
    const layerById = new Map<string, LayerDocType>([
      ['tr-parent', parent],
      ['tr-dep', dep],
    ]);
    const u = unit('u1', '');
    const r = resolveCanonicalUnitForTranscriptionLaneRow({
      unit: u,
      laneLayer: dep,
      layerById,
      transcriptionLaneIds: new Set(['tr-parent', 'tr-dep']),
      primaryUnscopedHostId: 'tr-parent',
    });
    expect(r.include).toBe(true);
    if (r.include) {
      expect(r.resolution).toBe('unscoped_descendant_of_default_host');
      expect(r.row.layerId).toBe('tr-dep');
      expect(r.row.id).toBe('u1');
    }
  });

  it('includes explicit unit.layerId match without re-stamping when already on lane', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const layerById = new Map<string, LayerDocType>([['tr-parent', parent]]);
    const u = unit('u1', 'tr-parent');
    const r = resolveCanonicalUnitForTranscriptionLaneRow({
      unit: u,
      laneLayer: parent,
      layerById,
      transcriptionLaneIds: new Set(['tr-parent']),
      primaryUnscopedHostId: 'tr-parent',
    });
    expect(r.include).toBe(true);
    if (r.include) {
      expect(r.resolution).toBe('explicit_unit_layer');
      expect(r.row).toBe(u);
    }
  });

  it('includes unit scoped to tree parent on child lane with stamp', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association', 'tr-parent');
    const layerById = new Map<string, LayerDocType>([
      ['tr-parent', parent],
      ['tr-dep', dep],
    ]);
    const u = unit('u1', 'tr-parent');
    const r = resolveCanonicalUnitForTranscriptionLaneRow({
      unit: u,
      laneLayer: dep,
      layerById,
      transcriptionLaneIds: new Set(['tr-parent', 'tr-dep']),
      primaryUnscopedHostId: 'tr-parent',
    });
    expect(r.include).toBe(true);
    if (r.include) {
      expect(r.resolution).toBe('explicit_tree_parent_layer');
      expect(r.row.layerId).toBe('tr-dep');
    }
  });

  it('includes unscoped unit on dependent lane when host is only declared via layer_links', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dep = tr('tr-dep', 'independent_boundary');
    const layerById = new Map<string, LayerDocType>([
      ['tr-parent', parent],
      ['tr-dep', dep],
    ]);
    const u = unit('u1', '');
    const layerLinks = [{
      layerId: 'tr-dep',
      transcriptionLayerKey: 'tr-parent',
      hostTranscriptionLayerId: 'tr-parent',
      isPreferred: true,
    }];
    const r = resolveCanonicalUnitForTranscriptionLaneRow({
      unit: u,
      laneLayer: dep,
      layerById,
      transcriptionLaneIds: new Set(['tr-parent', 'tr-dep']),
      primaryUnscopedHostId: 'tr-parent',
      layerLinks,
    });
    expect(r.include).toBe(true);
    if (r.include) {
      expect(r.resolution).toBe('unscoped_descendant_of_default_host');
      expect(r.row.layerId).toBe('tr-dep');
    }
  });

  it('excludes unscoped when lane is not under primary host', () => {
    const a = tr('tr-a', 'independent_boundary');
    const b = tr('tr-b', 'independent_boundary');
    const layerById = new Map<string, LayerDocType>([
      ['tr-a', a],
      ['tr-b', b],
    ]);
    const r = resolveCanonicalUnitForTranscriptionLaneRow({
      unit: unit('u1', ''),
      laneLayer: b,
      layerById,
      transcriptionLaneIds: new Set(['tr-a', 'tr-b']),
      primaryUnscopedHostId: 'tr-a',
    });
    expect(r.include).toBe(false);
  });
});
