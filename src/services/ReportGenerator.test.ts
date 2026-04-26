import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionRecordDoc, DifficultSegmentDoc, TaskPhaseRecordDoc, UserBehaviorProfileDoc } from './userBehaviorDB';
import { ReportGenerator, type DailySummary } from './ReportGenerator';
import { getActionRecordsInRange, getDifficultSegmentsInRange, getTaskPhaseRecordsInRange, loadBehaviorProfile } from './userBehaviorDB';
import { DEFAULT_VOICE_MODE } from './voiceMode';

vi.mock('./userBehaviorDB', () => ({
  getActionRecordsInRange: vi.fn(),
  getTaskPhaseRecordsInRange: vi.fn(),
  getDifficultSegmentsInRange: vi.fn(),
  loadBehaviorProfile: vi.fn(),
}));

function createProfile(): UserBehaviorProfileDoc {
  return {
    id: 'profile',
    actionFrequencies: {},
    actionDurationsMs: { undo: 1200 },
    fatigueScore: 0.24,
    speakingRateTrend: 'stable',
    pauseFrequencyTrend: 'stable',
    lastBreakAt: 0,
    preferences: {
      preferredMode: DEFAULT_VOICE_MODE,
      safeModeDefault: false,
      wakeWordEnabled: false,
      preferredEngine: 'web-speech',
      preferredLang: null,
      confirmationThreshold: 'destructive',
    },
    taskDurationsMs: {},
    usageTimeDistribution: new Array(24).fill(0),
    totalSessions: 1,
    lastSessionAt: 0,
    updatedAt: 0,
  };
}

function primeDailyMocks() {
  const currentActions: ActionRecordDoc[] = [
    {
      actionId: 'undo',
      durationMs: 1200,
      timestamp: Date.UTC(2026, 3, 1, 9, 0, 0),
      aiAssisted: false,
      voiceConfidence: 0.82,
      sessionId: 'session-a',
      page: 'transcription',
      requiredConfirmation: false,
      inputModality: 'voice',
    },
    {
      actionId: 'undo',
      durationMs: 800,
      timestamp: Date.UTC(2026, 3, 1, 9, 5, 0),
      aiAssisted: true,
      voiceConfidence: 0.78,
      sessionId: 'session-a',
      page: 'transcription',
      requiredConfirmation: false,
      inputModality: 'voice',
    },
  ];

  const yesterdayActions: ActionRecordDoc[] = [
    {
      actionId: 'undo',
      durationMs: 1000,
      timestamp: Date.UTC(2026, 2, 31, 18, 0, 0),
      aiAssisted: false,
      voiceConfidence: 0.8,
      sessionId: 'session-prev',
      page: 'transcription',
      requiredConfirmation: false,
      inputModality: 'voice',
    },
  ];

  const phaseRecords: TaskPhaseRecordDoc[] = [
    {
      phase: 'transcribing',
      startedAt: Date.UTC(2026, 3, 1, 8, 0, 0),
      endedAt: Date.UTC(2026, 3, 1, 8, 30, 0),
      segmentsProcessed: 3,
      sessionId: 'session-a',
    },
  ];

  const difficultSegments: DifficultSegmentDoc[] = [
    {
      segmentId: 'seg-1',
      difficultyScore: 0.91,
      editCount: 6,
      revertCount: 0,
      aiAssistanceRequested: false,
      dwellTimeMs: 1000,
      sessionId: 'session-a',
      recordedAt: Date.UTC(2026, 3, 1, 9, 10, 0),
    },
  ];

  vi.mocked(getActionRecordsInRange)
    .mockResolvedValueOnce(currentActions)
    .mockResolvedValueOnce(yesterdayActions);
  vi.mocked(loadBehaviorProfile).mockResolvedValue(createProfile());
  vi.mocked(getTaskPhaseRecordsInRange).mockResolvedValue(phaseRecords);
  vi.mocked(getDifficultSegmentsInRange).mockResolvedValue(difficultSegments);
}

describe('ReportGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults daily report user-facing text to zh-CN', async () => {
    primeDailyMocks();
    const generator = new ReportGenerator();

    const report = await generator.generate({
      type: 'daily',
      startTime: Date.UTC(2026, 3, 1, 0, 0, 0),
      endTime: Date.UTC(2026, 3, 1, 12, 0, 0),
    }) as DailySummary;

    expect(report.locale).toBe('zh-CN');
    expect(report.difficultSegments[0]?.reason).toBe('编辑次数过多');
    expect(report.ttsSummary).toContain('今日共执行2次操作。');
    expect(report.ttsSummary).toContain('效率比昨天提升100%');
  });

  it('renders english daily markdown when locale is en-US', async () => {
    primeDailyMocks();
    const generator = new ReportGenerator();

    const report = await generator.generate({
      type: 'daily',
      locale: 'en-US',
      startTime: Date.UTC(2026, 3, 1, 0, 0, 0),
      endTime: Date.UTC(2026, 3, 1, 12, 0, 0),
    }) as DailySummary;

    const markdown = generator.toMarkdown(report);

    expect(report.locale).toBe('en-US');
    expect(report.difficultSegments[0]?.reason).toBe('Too many edits');
    expect(report.ttsSummary).toContain('Completed 2 actions today.');
    expect(markdown).toContain('# Daily Report - 2026-04-01');
    expect(markdown).toContain('## Overview');
    expect(markdown).toContain('- Total actions: 2');
    expect(markdown).toContain('## Difficult Segments');
  });
});