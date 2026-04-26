/**
 * UserBehaviorStore 单元测试
 * UserBehaviorStore unit tests.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_VOICE_MODE } from './voiceMode';

// ── mock 依赖 | Mock dependencies ─────────────────────────────────────────

const { mockLoadProfile, mockSaveProfile, mockRecordAction, mockPrune } = vi.hoisted(() => ({
  mockLoadProfile: vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
  mockSaveProfile: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockRecordAction: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  mockPrune: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock('./userBehaviorDB', () => ({
  loadBehaviorProfile: mockLoadProfile,
  saveBehaviorProfile: mockSaveProfile,
  recordActionToDB: mockRecordAction,
  pruneOldRecords: mockPrune,
}));

const { mockSetProfile, mockRecordActionCtx, mockOnProfileChange } = vi.hoisted(() => ({
  mockSetProfile: vi.fn(),
  mockRecordActionCtx: vi.fn(),
  mockOnProfileChange: vi.fn<(cb: () => void) => () => void>().mockReturnValue(() => {}),
}));

vi.mock('./GlobalContextService', () => ({
  globalContext: {
    setBehaviorProfile: mockSetProfile,
    getBehaviorProfile: () => ({
      actionFrequencies: {},
      actionDurations: {},
      fatigue: { score: 0, speakingRateTrend: 'stable' as const, pauseFrequencyTrend: 'stable' as const, lastBreakAt: 0 },
      preferences: { preferredMode: DEFAULT_VOICE_MODE, safeModeDefault: false, wakeWordEnabled: false, preferredEngine: 'web-speech' as const, preferredLang: null, confirmationThreshold: 'destructive' as const },
      taskDurations: {},
      usageTimeDistribution: Array.from<number>({ length: 24 }).fill(0),
      totalSessions: 0,
      lastSessionAt: 0,
    }),
    onProfileChange: mockOnProfileChange,
    recordAction: mockRecordActionCtx,
  },
}));

// 动态导入，确保 mock 生效 | Dynamic import to ensure mocks are active
const { userBehaviorStore } = await import('./UserBehaviorStore');

// ── 测试 | Tests ──────────────────────────────────────────────────────────

describe('UserBehaviorStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    userBehaviorStore.dispose();
    vi.useRealTimers();
  });

  it('init 加载画像并订阅变更 | init loads profile and subscribes', async () => {
    await userBehaviorStore.init();
    expect(mockLoadProfile).toHaveBeenCalledOnce();
    expect(mockOnProfileChange).toHaveBeenCalledOnce();
    expect(mockPrune).toHaveBeenCalledOnce();
  });

  it('init 恢复已有画像 | init restores saved profile', async () => {
    const savedProfile = {
      id: 'current',
      actionFrequencies: { playPause: 10 },
      actionDurationsMs: {},
      fatigueScore: 0.5,
      speakingRateTrend: 'stable' as const,
      pauseFrequencyTrend: 'stable' as const,
      lastBreakAt: 0,
      preferences: { preferredMode: 'dictation' as const, safeModeDefault: false, wakeWordEnabled: false, preferredEngine: 'web-speech' as const, preferredLang: null, confirmationThreshold: 'destructive' as const },
      taskDurationsMs: {},
      usageTimeDistribution: [],
      totalSessions: 5,
      lastSessionAt: 1000,
      updatedAt: 1000,
    };
    mockLoadProfile.mockResolvedValueOnce(savedProfile);
    await userBehaviorStore.init();
    expect(mockSetProfile).toHaveBeenCalled();
  });

  it('二次 init 幂等 | double init is idempotent', async () => {
    await userBehaviorStore.init();
    await userBehaviorStore.init();
    expect(mockLoadProfile).toHaveBeenCalledOnce();
  });

  it('recordAction 更新内存并缓冲写入 | recordAction updates memory and buffers', async () => {
    await userBehaviorStore.init();
    userBehaviorStore.recordAction({
      actionId: 'playPause',
      durationMs: 100,
      sessionId: 'sess-1',
      inputModality: 'text',
    });
    expect(mockRecordActionCtx).toHaveBeenCalledWith('playPause', 100, 'sess-1');
  });

  it('flush 将缓冲批量写入 DB | flush writes buffer to DB', async () => {
    await userBehaviorStore.init();
    userBehaviorStore.recordAction({ actionId: 'undo', durationMs: 50, sessionId: 's1', inputModality: 'text' });
    userBehaviorStore.recordAction({ actionId: 'redo', durationMs: 30, sessionId: 's1', inputModality: 'text' });
    await userBehaviorStore.flush();
    expect(mockRecordAction).toHaveBeenCalledTimes(2);
  });

  it('flush 空缓冲不写 DB | flush with empty buffer is no-op', async () => {
    await userBehaviorStore.init();
    await userBehaviorStore.flush();
    expect(mockRecordAction).not.toHaveBeenCalled();
  });

  it('缓冲 ≥50 条时自动刷新 | auto-flush when buffer reaches 50', async () => {
    await userBehaviorStore.init();
    for (let i = 0; i < 50; i++) {
      userBehaviorStore.recordAction({ actionId: 'navNext', durationMs: 10, sessionId: 's1', inputModality: 'text' });
    }
    // flush 是异步的，等微任务完成 | flush is async, wait for microtasks
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRecordAction).toHaveBeenCalled();
  });

  it('定时器触发周期性刷新 | timer triggers periodic flush', async () => {
    await userBehaviorStore.init();
    userBehaviorStore.recordAction({ actionId: 'search', durationMs: 20, sessionId: 's1', inputModality: 'text' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockRecordAction).toHaveBeenCalledTimes(1);
  });

  it('dispose 清理定时器与订阅 | dispose cleans timer and subscriptions', async () => {
    await userBehaviorStore.init();
    userBehaviorStore.recordAction({ actionId: 'cancel', durationMs: 10, sessionId: 's1', inputModality: 'text' });
    userBehaviorStore.dispose();
    // 再次 advance 不应触发写入（定时器已清） | Advance should not trigger write (timer cleared)
    mockRecordAction.mockClear();
    await vi.advanceTimersByTimeAsync(10000);
    expect(mockRecordAction).not.toHaveBeenCalled();
  });

  it('recordAction 使用默认参数 | recordAction uses default params', async () => {
    await userBehaviorStore.init();
    userBehaviorStore.recordAction({ actionId: 'undo', durationMs: 10, sessionId: 's1', inputModality: 'text' });
    await userBehaviorStore.flush();
    const call = (mockRecordAction.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(call.page).toBe('transcription');
    expect(call.aiAssisted).toBe(false);
    expect(call.voiceConfidence).toBeNull();
    expect(call.requiredConfirmation).toBe(false);
    expect(call.inputModality).toBe('text');
  });

  it('recordAction 传入可选参数 | recordAction with optional params', async () => {
    await userBehaviorStore.init();
    userBehaviorStore.recordAction({
      actionId: 'markSegment',
      durationMs: 200,
      sessionId: 's2',
      page: 'glossing',
      aiAssisted: true,
      voiceConfidence: 0.85,
      requiredConfirmation: true,
      inputModality: 'voice',
    });
    await userBehaviorStore.flush();
    const call = (mockRecordAction.mock.calls as unknown[][])[0]![0] as Record<string, unknown>;
    expect(call.page).toBe('glossing');
    expect(call.aiAssisted).toBe(true);
    expect(call.voiceConfidence).toBe(0.85);
    expect(call.requiredConfirmation).toBe(true);
    expect(call.inputModality).toBe('voice');
  });
});
