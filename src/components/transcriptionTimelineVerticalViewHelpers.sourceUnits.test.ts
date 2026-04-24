import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import { resolveVerticalReadingGroupSourceUnits } from './transcriptionTimelineVerticalViewHelpers';

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

function unit(id: string, layerId: string, start = 0, end = 1): LayerUnitDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't',
    mediaId: 'm',
    layerId,
    startTime: start,
    endTime: end,
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

describe('resolveVerticalReadingGroupSourceUnits', () => {
  it('still expands dependent lanes when no transcription layer uses segment-first timelines', () => {
    const parent = tr('tr-parent', 'symbolic_association');
    const dependent = tr('tr-dep', 'symbolic_association', 'tr-parent');
    const u = unit('u1', 'tr-parent', 0, 1);
    const unitById = new Map<string, LayerUnitDocType>([['u1', u]]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [parent, dependent],
      translationLayers: [],
      layerLinks: [],
      unitsOnCurrentMedia: [u],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map(),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'tr-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    expect(out.filter((r) => r.layerId === 'tr-parent')).toHaveLength(1);
    expect(out.filter((r) => r.layerId === 'tr-dep')).toHaveLength(1);
  });

  it('mirrors unscoped canonical units onto dependent lane when default host is tree ancestor', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dependent = tr('tr-dep', 'symbolic_association', 'tr-parent');
    const u = unit('u1', '', 0, 1);
    const unitById = new Map<string, LayerUnitDocType>([['u1', u]]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [parent, dependent],
      translationLayers: [],
      layerLinks: [],
      unitsOnCurrentMedia: [u],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map([['tr-parent', []]]),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'tr-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    expect(out.some((r) => r.id === 'u1' && r.layerId === 'tr-dep')).toBe(true);
  });

  it('mirrors canonical rows onto dependent independent_boundary lane using layer_links when parentLayerId is absent', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dependent = tr('tr-dep', 'independent_boundary');
    const u = unit('u1', '', 0, 1);
    const unitById = new Map<string, LayerUnitDocType>([['u1', u]]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [parent, dependent],
      translationLayers: [],
      layerLinks: [{
        layerId: 'tr-dep',
        transcriptionLayerKey: 'tr-parent',
        hostTranscriptionLayerId: 'tr-parent',
        isPreferred: true,
      }],
      unitsOnCurrentMedia: [u],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map([
        ['tr-parent', []],
        ['tr-dep', []],
      ]),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'tr-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    expect(out.some((r) => r.id === 'u1' && r.layerId === 'tr-parent')).toBe(true);
    expect(out.some((r) => r.id === 'u1' && r.layerId === 'tr-dep')).toBe(true);
  });

  it('falls back to canonical rows when dependent segment-first layer has no segment rows yet', () => {
    const parent = tr('tr-parent', 'symbolic_association');
    const dependent = tr('tr-dep', 'independent_boundary', 'tr-parent');
    const u = unit('u1', 'tr-parent', 0, 1);
    const unitById = new Map<string, LayerUnitDocType>([['u1', u]]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [parent, dependent],
      translationLayers: [],
      layerLinks: [],
      unitsOnCurrentMedia: [u],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map([['tr-dep', []]]),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'tr-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    expect(out.filter((r) => r.layerId === 'tr-parent')).toHaveLength(1);
    expect(out.filter((r) => r.layerId === 'tr-dep')).toHaveLength(1);
    expect(out.some((r) => r.id === 'u1' && r.layerId === 'tr-dep')).toBe(true);
  });

  it('projects parent canonical units onto dependent transcription layer rows', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dependent = tr('tr-dep', 'symbolic_association', 'tr-parent');
    const u = unit('u1', 'tr-parent', 0, 1);
    const unitById = new Map<string, LayerUnitDocType>([['u1', u]]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [parent, dependent],
      translationLayers: [],
      layerLinks: [],
      unitsOnCurrentMedia: [u],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map([['tr-parent', []]]),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'tr-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    const depRows = out.filter((r) => r.layerId === 'tr-dep');
    expect(depRows).toHaveLength(1);
    expect(depRows[0]?.id).toBe('u1');
    expect(depRows[0]?.layerId).toBe('tr-dep');
  });

  it('fills dependent segment-first lane with canonical mirrors when own segments omit a host window', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dependent = tr('tr-dep', 'independent_boundary', 'tr-parent');
    const uHost = unit('u1', 'tr-parent', 10, 20);
    const segEarly = { ...unit('segEarly', 'tr-dep', 0, 5), unitType: 'segment' as const } as LayerUnitDocType;
    const segParent = { ...unit('segP', 'tr-parent', 10, 20), unitType: 'segment' as const } as LayerUnitDocType;
    const unitById = new Map<string, LayerUnitDocType>([
      ['u1', uHost],
      ['segEarly', segEarly],
      ['segP', segParent],
    ]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [parent, dependent],
      translationLayers: [],
      layerLinks: [],
      unitsOnCurrentMedia: [uHost],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map([
        ['tr-parent', [segParent]],
        ['tr-dep', [segEarly]],
      ]),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'tr-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    expect(out.some((r) => r.layerId === 'tr-dep' && r.id === 'segEarly')).toBe(true);
    expect(out.some((r) => r.layerId === 'tr-dep' && r.id === 'u1')).toBe(true);
    expect(out.some((r) => r.layerId === 'tr-dep' && r.id === 'segP')).toBe(true);
    expect(out.some((r) => r.layerId === 'tr-parent' && r.id === 'segP')).toBe(true);
  });

  it('stamps host-only segments onto dependent independent_boundary when units list does not cover that window', () => {
    const parent = tr('tr-parent', 'independent_boundary');
    const dependent = tr('tr-dep', 'independent_boundary', 'tr-parent');
    const uHost = unit('u1', 'tr-parent', 0, 4);
    const segLate = { ...unit('late', 'tr-parent', 50, 60), unitType: 'segment' as const } as LayerUnitDocType;
    const unitById = new Map<string, LayerUnitDocType>([
      ['u1', uHost],
      ['late', segLate],
    ]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [parent, dependent],
      translationLayers: [],
      layerLinks: [],
      unitsOnCurrentMedia: [uHost],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map([
        ['tr-parent', [segLate]],
        ['tr-dep', []],
      ]),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'tr-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    expect(out.some((r) => r.layerId === 'tr-dep' && r.id === 'late')).toBe(true);
  });

  it('orders parent lane rows before dependent rows at the same time (even when layer sortOrder lists child first)', () => {
    const parent = { ...tr('z-parent', 'independent_boundary'), sortOrder: 10 } as LayerDocType;
    const dependent = { ...tr('a-child', 'symbolic_association', 'z-parent'), sortOrder: 1 } as LayerDocType;
    const seg = {
      ...unit('seg1', 'z-parent', 0, 1),
      unitType: 'segment' as const,
    } as LayerUnitDocType;
    const u = unit('u1', 'z-parent', 0, 1);
    const unitById = new Map<string, LayerUnitDocType>([
      ['seg1', seg],
      ['u1', u],
    ]);
    const out = resolveVerticalReadingGroupSourceUnits({
      transcriptionLayers: [dependent, parent],
      translationLayers: [],
      layerLinks: [],
      unitsOnCurrentMedia: [u],
      segmentParentUnitLookup: undefined,
      segmentsByLayer: new Map([['z-parent', [seg]]]),
      allLayersOrdered: [parent, dependent],
      defaultTranscriptionLayerId: 'z-parent',
      activeSpeakerFilterKey: 'all',
      unitByIdForSpeaker: unitById,
    });
    expect(out.map((r) => r.id)).toEqual(['seg1', 'u1']);
    expect(out[0]?.layerId).toBe('z-parent');
    expect(out[1]?.layerId).toBe('a-child');
  });
});
