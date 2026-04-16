import { describe, expect, it } from 'vitest';
import { buildWorldModelSnapshot, resolveWorldModelDetailLevel } from './worldModelSnapshot';
import type { TimelineUnitView } from '../../hooks/timelineUnitView';

const layers = [
  {
    id: 'layer-transcription',
    textId: 'text-1',
    key: 'transcription',
    name: { zh: '转写层' },
    layerType: 'transcription',
    languageId: 'cmn',
    modality: 'text',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'layer-translation',
    textId: 'text-1',
    key: 'translation',
    name: { zh: '翻译层' },
    layerType: 'translation',
    languageId: 'eng',
    modality: 'text',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mediaItems = [
  {
    id: 'media-a',
    textId: 'text-1',
    filename: 'interview.wav',
    duration: 120,
    isOfflineCached: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'media-b',
    textId: 'text-1',
    filename: 'field.wav',
    duration: 60,
    isOfflineCached: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

function unit(overrides: Partial<TimelineUnitView> & Pick<TimelineUnitView, 'id' | 'mediaId' | 'layerId' | 'startTime' | 'endTime' | 'text' | 'kind'>): TimelineUnitView {
  return {
    speakerId: 'spk-1',
    ...overrides,
  };
}

describe('worldModelSnapshot', () => {
  it('renders a hierarchical snapshot for the current media and layers', () => {
    const allUnits = [
      unit({ id: 'u-1', kind: 'unit', mediaId: 'media-a', layerId: 'layer-transcription', startTime: 0, endTime: 3, text: '你好' }),
      unit({ id: 'u-2', kind: 'segment', mediaId: 'media-a', layerId: 'layer-translation', startTime: 3, endTime: 6, text: 'hello' }),
      unit({ id: 'u-3', kind: 'segment', mediaId: 'media-b', layerId: 'layer-translation', startTime: 1, endTime: 2, text: 'thanks' }),
    ];

    const snapshot = buildWorldModelSnapshot({
      allUnits,
      currentMediaUnits: allUnits.filter((item) => item.mediaId === 'media-a'),
      layers,
      mediaItems,
      currentMediaId: 'media-a',
      selectedUnitIds: ['u-2'],
      selectedLayerId: 'layer-translation',
      activeLayerIdForEdits: 'layer-transcription',
    });

    expect(snapshot).toContain('project');
    expect(snapshot).toContain('media interview.wav units=2 ← currentMedia');
    expect(snapshot).toContain('segment 00:03.0-00:06.0 "hello"');
    expect(snapshot).toContain('← selected');
    expect(snapshot).toContain('转写层 ← activeEditLayer');
    expect(snapshot).toContain('翻译层 ← selectedLayer');
  });

  it('uses digest mode for medium projects', () => {
    expect(resolveWorldModelDetailLevel(80)).toBe('digest');
  });

  it('uses summary mode for large projects', () => {
    expect(resolveWorldModelDetailLevel(600)).toBe('summary');
  });
});
