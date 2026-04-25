import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import { addMetricObserver } from '../observability/metrics';
import { createTranscriptionAiToolRiskCheck } from './transcriptionAiToolRiskCheck';

function makeLayer(overrides: Partial<LayerDocType> & Pick<LayerDocType, 'id' | 'key' | 'layerType' | 'languageId'>): LayerDocType {
  const { id, key, layerType, languageId, ...restOverrides } = overrides;
  return {
    id,
    textId: 'text-1',
    key,
    name: overrides.name ?? { zho: key, eng: key },
    layerType,
    languageId,
    modality: 'text',
    acceptsAudio: false,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
    ...restOverrides,
  } as LayerDocType;
}

function makeUnit(overrides: Partial<LayerUnitDocType> = {}): LayerUnitDocType {
  return {
    id: 'utt-1',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-31T00:00:00.000Z',
    updatedAt: '2026-03-31T00:00:00.000Z',
    ...overrides,
  } as LayerUnitDocType;
}

describe('createTranscriptionAiToolRiskCheck', () => {
  it('returns no-match summary when delete_layer language query cannot resolve to a unique layer', () => {
    const transcriptionLayer = makeLayer({
      id: 'tr-zho',
      key: 'tr-zho',
      layerType: 'transcription',
      languageId: 'zho',
      name: { zho: '中文转写', eng: 'Chinese transcription' },
    });
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [transcriptionLayer],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_layer',
      arguments: {
        layerType: 'translation',
        languageQuery: '德语',
      },
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('德语');
  });

  it('returns invalid-layer-type summary when delete_layer receives unsupported layerType', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_layer',
      arguments: {
        layerType: 'gloss',
        languageQuery: '中文',
      },
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('无效的层类型');
    expect(result?.riskSummary).toContain('gloss');
  });

  it('requires confirmation when deleting a segment that still has transcription and translation content', () => {
    const unit = makeUnit({
      id: 'utt-2',
      startTime: 12.3,
      endTime: 15.8,
    });
    const translationByLayer = new Map<string, Map<string, { text?: string }>>([
      ['layer-1', new Map([['utt-2', { text: 'translated' }]])],
    ]);
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [unit],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => seconds.toFixed(1),
      getUnitTextForLayer: () => 'transcription body',
      translationTextByLayer: translationByLayer,
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        segmentId: 'utt-2',
      },
    });

    expect(result).toEqual({
      requiresConfirmation: true,
      riskSummary: expect.any(String),
      impactPreview: [
        expect.stringContaining('transcription body'),
        expect.any(String),
        expect.any(String),
      ],
    });
  });

  it('returns low risk when deleting an empty segment', () => {
    const unit = makeUnit();
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [unit],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '   ',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        segmentId: unit.id,
      },
    });

    expect(result).toEqual({ requiresConfirmation: false });
  });

  it('requires confirmation with batch preview when deleting all segments with existing content', () => {
    const units = [
      makeUnit({ id: 'utt-1', startTime: 0, endTime: 1 }),
      makeUnit({ id: 'utt-2', startTime: 1.5, endTime: 3 }),
    ];
    const translationByLayer = new Map<string, Map<string, { text?: string }>>([
      ['layer-1', new Map([['utt-1', { text: 'hello' }], ['utt-2', { text: 'world' }]])],
    ]);
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units,
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => seconds.toFixed(1),
      getUnitTextForLayer: (unit) => unit.id === 'utt-1' ? '第一句' : '第二句',
      translationTextByLayer: translationByLayer,
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        allSegments: true,
      },
    });

    expect(result?.requiresConfirmation).toBe(true);
    expect(result?.riskSummary).toContain('将删除 2 条句段');
    expect(result?.impactPreview?.[0]).toContain('影响范围');
    expect(result?.impactPreview?.[1]).toContain('2 条翻译内容');
  });

  it('returns a blocking summary when delete-all has no current-page targets', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        allSegments: true,
      },
    });

    expect(result).toEqual({
      requiresConfirmation: false,
      riskSummary: '当前页面没有可删除的句段。',
      impactPreview: [],
    });
  });

  it('resolves ordinal selector preview to a concrete current-page segment', () => {
    const units = [
      makeUnit({ id: 'utt-1', startTime: 0, endTime: 1 }),
      makeUnit({ id: 'utt-2', startTime: 1.5, endTime: 3 }),
    ];
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units,
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => seconds.toFixed(1),
      getUnitTextForLayer: (unit) => unit.id === 'utt-1' ? '第一句' : '第二句',
      translationTextByLayer: new Map([
        ['layer-1', new Map([['utt-1', { text: 'hello' }]])],
      ]),
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        segmentIndex: 1,
      },
    });

    expect(result?.requiresConfirmation).toBe(true);
    expect(result?.riskSummary).toContain('第 1 条句段');
    expect(result?.impactPreview?.[1]).toContain('1 个翻译层组含内容');
  });

  it('returns a blocking summary when ordinal selector cannot be resolved on the current page', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        segmentIndex: 1,
      },
    });

    expect(result).toEqual({
      requiresConfirmation: false,
      riskSummary: '当前页面无法定位到目标句段。',
      impactPreview: [],
    });
  });

  it('returns a blocking summary when relative selector has no explicit writable anchor', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      segmentTargets: [
        { id: 'seg-1', kind: 'segment', startTime: 0, endTime: 1, text: '第一段' },
        { id: 'seg-2', kind: 'segment', startTime: 1.5, endTime: 3, text: '第二段' },
      ],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        segmentPosition: 'previous',
      },
    });

    expect(result).toEqual({
      requiresConfirmation: false,
      riskSummary: '当前页面无法定位到目标句段。',
      impactPreview: [],
    });
  });

  it('resolves ordinal selector preview to a concrete independent segment on the current layer timeline', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      selectedSegmentTargetId: 'seg-2',
      segmentTargets: [
        { id: 'seg-1', kind: 'segment', startTime: 0, endTime: 1, text: '第一段' },
        { id: 'seg-2', kind: 'segment', startTime: 1.5, endTime: 3, text: '第二段' },
      ],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => seconds.toFixed(1),
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {
        segmentIndex: 1,
      },
    });

    expect(result?.requiresConfirmation).toBe(true);
    expect(result?.riskSummary).toContain('第 1 条句段');
    expect(result?.impactPreview?.[0]).toContain('第一段');
  });

  it('resolves previous and delete-all previews on an independent segment timeline', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      selectedSegmentTargetId: 'seg-2',
      segmentTargets: [
        { id: 'seg-1', kind: 'segment', startTime: 0, endTime: 1, text: '第一段' },
        { id: 'seg-2', kind: 'segment', startTime: 1.5, endTime: 3, text: '第二段' },
        { id: 'seg-3', kind: 'segment', startTime: 3.5, endTime: 5, text: '第三段' },
      ],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => seconds.toFixed(1),
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const previousResult = check({
      name: 'delete_transcription_segment',
      arguments: {
        segmentPosition: 'previous',
      },
    });
    const deleteAllResult = check({
      name: 'delete_transcription_segment',
      arguments: {
        allSegments: true,
      },
    });

    expect(previousResult?.requiresConfirmation).toBe(true);
    expect(previousResult?.impactPreview?.[0]).toContain('第一段');
    expect(deleteAllResult?.requiresConfirmation).toBe(true);
    expect(deleteAllResult?.riskSummary).toContain('将删除 3 条句段');
    expect(deleteAllResult?.impactPreview?.[0]).toContain('第一段 / 第二段');
  });

  it('blocks create_transcription_segment when no explicit writable target exists', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'create_transcription_segment',
      arguments: {},
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('缺少目标句段编号');
  });

  it('blocks set_transcription_text when no explicit writable target exists', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'set_transcription_text',
      arguments: { text: 'hello' },
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('缺少 segmentId');
  });

  it('does not treat unknown segmentPosition as an explicit writable target', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'set_transcription_text',
      arguments: {
        text: 'hello',
        segmentPosition: 'random-position',
      },
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('缺少 segmentId');
  });

  it('blocks delete_transcription_segment when no explicit writable target exists', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'delete_transcription_segment',
      arguments: {},
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('缺少目标句段编号');
  });

  it('records blocked-write metric when write tool has no explicit target', () => {
    const metrics: string[] = [];
    const dispose = addMetricObserver((event) => {
      metrics.push(event.id);
    });

    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    check({ name: 'set_transcription_text', arguments: { text: 'hello' } });
    dispose();

    expect(metrics).toContain('blocked_write_without_explicit_target_total');
  });

  it('allows set_transcription_text to pass risk check when selected writable anchor exists', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      selectedSegmentTargetId: 'seg-2',
      segmentTargets: [
        { id: 'seg-1', kind: 'segment', startTime: 0, endTime: 1, text: '第一段' },
        { id: 'seg-2', kind: 'segment', startTime: 1.5, endTime: 3, text: '第二段' },
      ],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'set_transcription_text',
      arguments: { text: 'hello' },
    });

    expect(result).toBeNull();
  });

  it('gates explicit-target segment tools like auto_gloss_unit when target is missing', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'auto_gloss_unit',
      arguments: {},
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('无法定位到目标句段');
  });

  it('blocks merge_transcription_segments when explicit segment ids are insufficient', () => {
    const check = createTranscriptionAiToolRiskCheck({
      locale: 'zh-CN',
      units: [],
      transcriptionLayers: [],
      translationLayers: [],
      formatTime: (seconds) => `${seconds}`,
      getUnitTextForLayer: () => '',
      translationTextByLayer: new Map(),
    });

    const result = check({
      name: 'merge_transcription_segments',
      arguments: { segmentIds: ['seg-1'] },
    });

    expect(result?.requiresConfirmation).toBe(false);
    expect(result?.impactPreview).toEqual([]);
    expect(result?.riskSummary).toContain('2 个句段');
  });
});
