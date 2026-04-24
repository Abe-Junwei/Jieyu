import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerLinkDocType } from '../db';
import {
  assertTranscriptionDependencyLayerInvariant,
  findTranscriptionDependencyInvariantViolations,
  scopeLayerLinksToLayerIdSet,
} from './transcriptionLayerDependencyInvariant';

function tr(
  id: string,
  constraint: LayerDocType['constraint'],
  extras?: Partial<LayerDocType>,
): LayerDocType {
  const now = '2026-04-23T00:00:00.000Z';
  return {
    id,
    textId: 't1',
    key: id,
    name: { 'zh-CN': id },
    languageId: 'zho',
    modality: 'text',
    createdAt: now,
    updatedAt: now,
    layerType: 'transcription',
    constraint,
    ...extras,
  } as LayerDocType;
}

describe('transcriptionLayerDependencyInvariant', () => {
  it('scopeLayerLinksToLayerIdSet keeps links touching any id in the set', () => {
    const links: LayerLinkDocType[] = [
      {
        id: 'l1',
        layerId: 'trl',
        hostTranscriptionLayerId: 'trc',
        transcriptionLayerKey: 'k',
        linkType: 'free',
        isPreferred: true,
        createdAt: 'x',
      },
      {
        id: 'l2',
        layerId: 'other',
        hostTranscriptionLayerId: 'ghost',
        transcriptionLayerKey: 'k2',
        linkType: 'free',
        isPreferred: false,
        createdAt: 'x',
      },
    ];
    const scoped = scopeLayerLinksToLayerIdSet(links, new Set(['trl', 'trc']));
    expect(scoped.map((l) => l.id)).toEqual(['l1']);
  });

  it('allows symbolic dependent with valid parentLayerId', () => {
    const root = tr('tr-root', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association', { parentLayerId: 'tr-root' });
    expect(findTranscriptionDependencyInvariantViolations({ layers: [root, dep], layerLinks: [] })).toEqual([]);
    expect(() => assertTranscriptionDependencyLayerInvariant({ layers: [root, dep], layerLinks: [] })).not.toThrow();
  });

  it('allows symbolic dependent without parent when inbound host link exists', () => {
    const root = tr('tr-root', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association');
    const links: LayerLinkDocType[] = [{
      id: 'link1',
      layerId: 'tr-dep',
      hostTranscriptionLayerId: 'tr-root',
      transcriptionLayerKey: 'tr-root',
      linkType: 'free',
      isPreferred: true,
      createdAt: 'x',
    }];
    expect(findTranscriptionDependencyInvariantViolations({ layers: [root, dep], layerLinks: links })).toEqual([]);
  });

  it('flags symbolic dependent with neither parent nor host link', () => {
    const root = tr('tr-root', 'independent_boundary');
    const dep = tr('tr-dep', 'symbolic_association');
    const v = findTranscriptionDependencyInvariantViolations({ layers: [root, dep], layerLinks: [] });
    expect(v).toHaveLength(1);
    expect(v[0]?.layerId).toBe('tr-dep');
    expect(() => assertTranscriptionDependencyLayerInvariant({ layers: [root, dep], layerLinks: [] })).toThrow(
      /transcription-dependency-invariant/,
    );
  });

  it('flags dangling parentLayerId with no matching layer', () => {
    const dep = tr('tr-dep', 'symbolic_association', { parentLayerId: 'missing-root' });
    expect(findTranscriptionDependencyInvariantViolations({ layers: [dep], layerLinks: [] })).toHaveLength(1);
  });

  it('does not require parent for independent_boundary transcription', () => {
    const a = tr('tr-a', 'independent_boundary');
    expect(findTranscriptionDependencyInvariantViolations({ layers: [a], layerLinks: [] })).toEqual([]);
  });
});
