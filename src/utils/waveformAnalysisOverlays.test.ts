import { describe, expect, it } from 'vitest';
import { buildWaveformAnalysisOverlaySummary, buildWaveformAnalysisPromptSummary, buildRiskHotZones } from './waveformAnalysisOverlays';

describe('waveformAnalysisOverlays', () => {
  it('derives low-confidence, overlap, and gap bands from utterances', () => {
    const summary = buildWaveformAnalysisOverlaySummary([
      { id: 'u2', startTime: 1.2, endTime: 2.4, ai_metadata: { confidence: 0.61 } },
      { id: 'u1', startTime: 0, endTime: 1.5, ai_metadata: { confidence: 0.93 } },
      { id: 'u3', startTime: 3.5, endTime: 4.0 },
    ]);

    expect(summary.lowConfidenceBands).toEqual([
      { id: 'u2', startTime: 1.2, endTime: 2.4, confidence: 0.61 },
    ]);
    expect(summary.overlapBands).toEqual([
      { id: 'overlap:1', startTime: 1.2, endTime: 1.5, concurrentCount: 2 },
    ]);
    expect(summary.gapBands).toEqual([
      { id: 'gap:u2:u3', startTime: 2.4, endTime: 3.5, gapSeconds: 1.1 },
    ]);
  });

  it('merges adjacent overlap slices with the same concurrent count', () => {
    const summary = buildWaveformAnalysisOverlaySummary([
      { id: 'u1', startTime: 0, endTime: 4 },
      { id: 'u2', startTime: 1, endTime: 2 },
      { id: 'u3', startTime: 2, endTime: 3 },
    ]);

    expect(summary.overlapBands).toEqual([
      { id: 'overlap:1', startTime: 1, endTime: 3, concurrentCount: 2 },
    ]);
  });

  it('builds compact prompt summary for AI context', () => {
    const summary = buildWaveformAnalysisPromptSummary([
      { id: 'u1', startTime: 0, endTime: 1.5, ai_metadata: { confidence: 0.91 } },
      { id: 'u2', startTime: 1.2, endTime: 2.4, ai_metadata: { confidence: 0.61 } },
      { id: 'u3', startTime: 3.5, endTime: 4.9 },
    ], {
      selectionStartTime: 1,
      selectionEndTime: 2.5,
      audioTimeSec: 1.3,
    });

    expect(summary.lowConfidenceCount).toBe(1);
    expect(summary.overlapCount).toBe(1);
    expect(summary.gapCount).toBe(1);
    expect(summary.maxGapSeconds).toBeCloseTo(1.1, 5);
    expect(summary.selectionLowConfidenceCount).toBe(1);
    expect(summary.selectionOverlapCount).toBe(1);
    expect(summary.selectionGapCount).toBe(1);
    expect(summary.activeSignals).toEqual([
      'low_confidence:61%@1.2-2.4',
      'overlap:x2@1.2-1.5',
    ]);
  });

  describe('buildRiskHotZones', () => {
    it('clusters nearby signals into risk hot-zones', () => {
      const overlay = buildWaveformAnalysisOverlaySummary([
        { id: 'u1', startTime: 0, endTime: 2, ai_metadata: { confidence: 0.5 } },
        { id: 'u2', startTime: 1, endTime: 3, ai_metadata: { confidence: 0.6 } },
        { id: 'u3', startTime: 10, endTime: 11 },
      ]);
      const zones = buildRiskHotZones(overlay);
      // u1 + u2 低置信度 + overlap 在 1-2 → 应聚为一个热区
      expect(zones.length).toBeGreaterThanOrEqual(1);
      expect(zones[0]!.startTime).toBeLessThanOrEqual(1);
      expect(zones[0]!.endTime).toBeGreaterThanOrEqual(2);
      expect(zones[0]!.signalCount).toBeGreaterThanOrEqual(2);
      expect(zones[0]!.severity).toBeGreaterThan(0);
    });

    it('returns empty when only one signal exists', () => {
      const overlay = buildWaveformAnalysisOverlaySummary([
        { id: 'u1', startTime: 0, endTime: 1, ai_metadata: { confidence: 0.5 } },
      ]);
      // 仅一个信号，无法形成簇
      const zones = buildRiskHotZones(overlay);
      expect(zones).toEqual([]);
    });

    it('limits to maxZones', () => {
      const utterances = Array.from({ length: 20 }, (_, i) => ({
        id: `u${i}`,
        startTime: i * 10,
        endTime: i * 10 + 2,
        ai_metadata: { confidence: 0.3 },
      }));
      // 插入每个簇的第二信号使其可聚类
      for (let i = 0; i < 20; i++) {
        utterances.push({
          id: `v${i}`,
          startTime: i * 10 + 0.5,
          endTime: i * 10 + 1.5,
          ai_metadata: { confidence: 0.4 },
        });
      }
      const overlay = buildWaveformAnalysisOverlaySummary(utterances);
      const zones = buildRiskHotZones(overlay, { maxZones: 3 });
      expect(zones.length).toBeLessThanOrEqual(3);
    });
  });

  describe('temporal distribution in prompt summary', () => {
    it('includes quartile distribution when signals exist', () => {
      const summary = buildWaveformAnalysisPromptSummary([
        { id: 'u1', startTime: 1, endTime: 2, ai_metadata: { confidence: 0.3 } },
        { id: 'u2', startTime: 3, endTime: 4, ai_metadata: { confidence: 0.4 } },
        { id: 'u3', startTime: 7, endTime: 8, ai_metadata: { confidence: 0.5 } },
        { id: 'u4', startTime: 9, endTime: 10, ai_metadata: { confidence: 0.9 } },
      ], { audioDurationSec: 12 });

      expect(summary.temporalDistribution).toBeDefined();
      expect(summary.temporalDistribution!.durationSec).toBe(12);
      expect(summary.temporalDistribution!.quartileRatios).toHaveLength(4);
      // Q1=[0,3) 包含 u1(mid=1.5) → 1  Q2=[3,6) 包含 u2(mid=3.5) → 1
      // Q3=[6,9) 包含 u3(mid=7.5) → 1  Q4=[9,12) 无低置信度信号 → 0
      const ratios = summary.temporalDistribution!.quartileRatios;
      expect(ratios.reduce((sum, r) => sum + r, 0)).toBeCloseTo(1, 1);
    });

    it('omits temporal distribution when no signals', () => {
      const summary = buildWaveformAnalysisPromptSummary([
        { id: 'u1', startTime: 0, endTime: 5, ai_metadata: { confidence: 0.95 } },
      ], { audioDurationSec: 10 });

      expect(summary.temporalDistribution).toBeUndefined();
    });
  });

  describe('VAD-aware gap detection', () => {
    it('marks gap containsSpeech when VAD segments overlap', () => {
      const summary = buildWaveformAnalysisOverlaySummary([
        { id: 'u1', startTime: 0, endTime: 2 },
        { id: 'u2', startTime: 5, endTime: 7 },
      ], {
        gapThresholdSeconds: 0.5,
        vadSegments: [{ start: 3, end: 4 }],
      });
      expect(summary.gapBands).toHaveLength(1);
      expect(summary.gapBands[0]!.containsSpeech).toBe(true);
    });

    it('marks gap containsSpeech false when no VAD in gap', () => {
      const summary = buildWaveformAnalysisOverlaySummary([
        { id: 'u1', startTime: 0, endTime: 2 },
        { id: 'u2', startTime: 5, endTime: 7 },
      ], {
        gapThresholdSeconds: 0.5,
        vadSegments: [{ start: 8, end: 9 }],
      });
      expect(summary.gapBands).toHaveLength(1);
      expect(summary.gapBands[0]!.containsSpeech).toBe(false);
    });

    it('omits containsSpeech when no vadSegments provided', () => {
      const summary = buildWaveformAnalysisOverlaySummary([
        { id: 'u1', startTime: 0, endTime: 2 },
        { id: 'u2', startTime: 5, endTime: 7 },
      ], { gapThresholdSeconds: 0.5 });
      expect(summary.gapBands).toHaveLength(1);
      expect(summary.gapBands[0]!.containsSpeech).toBeUndefined();
    });

    it('reports untranscribedSpeechGapCount in prompt summary', () => {
      const summary = buildWaveformAnalysisPromptSummary([
        { id: 'u1', startTime: 0, endTime: 2, ai_metadata: { confidence: 0.9 } },
        { id: 'u2', startTime: 5, endTime: 7, ai_metadata: { confidence: 0.9 } },
        { id: 'u3', startTime: 10, endTime: 12, ai_metadata: { confidence: 0.9 } },
      ], {
        gapThresholdSeconds: 0.5,
        vadSegments: [{ start: 3, end: 4 }], // 只有 u1-u2 间隙含语音
      });
      expect(summary.untranscribedSpeechGapCount).toBe(1);
    });
  });
});