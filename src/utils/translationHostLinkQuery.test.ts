import { describe, expect, it } from 'vitest';
import type { LayerLinkDocType } from '../db';
import {
  getPreferredHostTranscriptionLayerIdForTranslation,
  resolveLayerLinkHostTranscriptionLayerId,
  translationHostsIntersectTranscriptionIds,
} from './translationHostLinkQuery';

function link(
  layerId: string,
  hostId: string,
  isPreferred: boolean,
): Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'> {
  return {
    layerId,
    transcriptionLayerKey: '',
    hostTranscriptionLayerId: hostId,
    isPreferred,
  };
}

describe('translationHostLinkQuery', () => {
  it('resolves host id from hostTranscriptionLayerId', () => {
    const map = new Map<string, string>([['k', 'x']]);
    expect(resolveLayerLinkHostTranscriptionLayerId(
      { transcriptionLayerKey: 'k', hostTranscriptionLayerId: '  h1  ' },
      map,
    )).toBe('h1');
  });

  it('falls back transcriptionLayerKey via map', () => {
    const map = new Map<string, string>([['trc_a', 'layer-a']]);
    expect(resolveLayerLinkHostTranscriptionLayerId(
      { transcriptionLayerKey: 'trc_a', hostTranscriptionLayerId: '' },
      map,
    )).toBe('layer-a');
  });

  it('returns preferred host when a non-preferred link is listed first', () => {
    const map = new Map<string, string>();
    const links = [
      link('trl', 'host-a', false),
      link('trl', 'host-b', true),
    ];
    expect(getPreferredHostTranscriptionLayerIdForTranslation('trl', links, map)).toBe('host-b');
  });

  it('detects intersection with transcription id set', () => {
    const map = new Map<string, string>();
    const links = [link('trl', 'host-a', true), link('trl', 'host-b', false)];
    expect(translationHostsIntersectTranscriptionIds('trl', new Set(['host-b']), links, map)).toBe(true);
    expect(translationHostsIntersectTranscriptionIds('trl', new Set(['host-c']), links, map)).toBe(false);
  });
});
