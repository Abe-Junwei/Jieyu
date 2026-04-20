/**
 * SpeechAnnotationPipeline — 快速听写标注流水线
 *
 * 端到端处理用户口述输入 → 自动填入句段 → 自动跳转下一句。
 * 设计目标：用户只需说话，无需手动操作，大幅提升长篇转写效率。
 *
 * 核心流程：
 * 1. 用户在 dictation 模式下按下麦克风
 * 2. 实时接收 STT 中间结果（interim）
 * 3. 识别静默（VAD）后等待 600ms，确认最终结果
 * 4. 自动将文本填入选中的句段层
 * 5. 自动导航到下一个未标注句段
 * 6. 继续监听（continuous mode）
 *
 * 支持：
 * - 中间结果预览（interimText）
 * - 静默超时自动停止
 * - Push-to-talk 快速模式
 * - 自动跳过已标注句段
 *
 * @see 解语-语音智能体架构设计方案 v2.5 §阶段4
 */

import type { SttResult } from './VoiceInputService';

export type AnnotationLayer = 'transcription' | 'translation' | 'gloss';

export interface QuickDictationConfig {
  /** 自动导航到下一句段（默认 true） */
  autoAdvance?: boolean;
  /** 静默后等待确认时间（ms，默认 600） */
  silenceConfirmDelayMs?: number;
  /** 最大无输入时长（秒），超时自动停止（默认 60） */
  maxUnitDurationSec?: number;
  /** 是否在完成后自动停止监听（默认 false） */
  autoStopOnComplete?: boolean;
  /** 目标标注层（默认 transcription） */
  targetLayer?: AnnotationLayer;
  /** 自动跳过的已标注内容 */
  skipAlreadyAnnotated?: boolean;
}

export interface DictationSegment {
  segmentId: string;
  index: number;
  startTime: number;
  endTime: number;
  existingText: string | null;
  existingTranslation: string | null;
  existingGloss: Record<string, string> | null;
  /** 标记为跳过处理的语段 | Segment explicitly marked to skip processing */
  skipProcessing?: boolean;
}

export interface DictationPipelineState {
  /** 是否正在运行 */
  active: boolean;
  /** 当前目标句段 */
  currentSegment: DictationSegment | null;
  /** 最新中间结果 */
  interimText: string;
  /** 最新确认文本 */
  confirmedText: string;
  /** 已完成填充的句段数 */
  filledCount: number;
  /** 总进度（已完成 / 总数） */
  progress: { done: number; total: number };
  /** 最后更新时间戳 */
  lastUpdateAt: number;
  /** 最后一次填充错误 | Last fill error message */
  lastError?: string;
}

export interface DictationPipelineCallbacks {
  /** 获取目标句段列表（未标注优先） */
  getSegments: () => DictationSegment[];
  /** 获取当前选中的句段 ID */
  getCurrentSegmentId: () => string | null;
  /** 写回前按目标层做文本变换 | Transform text for target layer before fill */
  transformTextForFill?: (input: { layer: AnnotationLayer; text: string; segmentId: string }) => Promise<string>;
  /** 填充文本到句段 */
  fillSegment: (segmentId: string, layer: AnnotationLayer, text: string) => Promise<void>;
  /** 恢复句段文本（用于撤销） */
  restoreSegment: (segmentId: string, layer: AnnotationLayer, previousText: string | null) => Promise<void>;
  /** 导航到指定句段（支持同步或异步实现）| Navigate to segment (sync or async impl) */
  navigateTo: (segmentId: string) => Promise<void> | void;
  /** 导航到下一个未标注句段 */
  navigateToNextUnannotated: (layer: AnnotationLayer) => string | null;
  /** 播放提示音 */
  playEarcon?: (type: 'success' | 'tick' | 'error') => void;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

export class SpeechAnnotationPipeline {
  private _callbacks: DictationPipelineCallbacks;
  private _config: Required<QuickDictationConfig>;
  private _state: DictationPipelineState;
  private _segments: DictationSegment[] = [];
  private _currentSegmentIndex = 0;
  private _silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private _maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastFinalText = '';
  private _filledHistory: Array<{ segmentId: string; layer: AnnotationLayer; previousText: string | null }> = [];

  constructor(callbacks: DictationPipelineCallbacks, config: QuickDictationConfig = {}) {
    this._callbacks = callbacks;
    this._config = {
      autoAdvance: config.autoAdvance ?? true,
      silenceConfirmDelayMs: config.silenceConfirmDelayMs ?? 600,
      maxUnitDurationSec: config.maxUnitDurationSec ?? 60,
      autoStopOnComplete: config.autoStopOnComplete ?? false,
      targetLayer: config.targetLayer ?? 'transcription',
      skipAlreadyAnnotated: config.skipAlreadyAnnotated ?? true,
    };
    this._state = this._createIdleState();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get state(): DictationPipelineState {
    return { ...this._state };
  }

  /** Start the pipeline — find first unannotated segment and begin listening */
  async start(): Promise<void> {
    if (this._state.active) return;

    this._segments = this._callbacks.getSegments();
    const currentId = this._callbacks.getCurrentSegmentId();

    // Find starting segment
    let startIdx = this._segments.findIndex((s) => s.segmentId === currentId);
    if (startIdx < 0) startIdx = 0;

    // Skip already annotated if configured
    if (this._config.skipAlreadyAnnotated) {
      startIdx = this._findFirstUnannotated(startIdx);
    }

    if (startIdx < 0) {
      // No more segments to annotate
      this._state = { ...this._createIdleState() };
      return;
    }

    this._currentSegmentIndex = startIdx;
    const segment = this._segments[startIdx] ?? null;

    this._state = {
      active: true,
      currentSegment: segment,
      interimText: '',
      confirmedText: '',
      filledCount: 0,
      progress: { done: 0, total: this._countProcessableSegments() },
      lastUpdateAt: Date.now(),
    };

    if (segment) await this._callbacks.navigateTo(segment.segmentId);
    // B-07 fix: defer timer reset to next tick so React UI can flush re-render first
    setTimeout(() => this._resetMaxDurationTimer(), 0);
  }

  /** Stop the pipeline */
  stop(): void {
    this._clearTimers();
    this._state = { ...this._createIdleState() };
  }

  /**
   * Process an STT result from VoiceInputService.
   * Call this from your onResult callback while pipeline is active.
   */
  onSttResult(result: SttResult): void {
    if (!this._state.active) return;

    this._state.lastUpdateAt = Date.now();
    this._resetMaxDurationTimer();

    if (!result.isFinal) {
      // Interim result — just update preview
      this._state = {
        ...this._state,
        interimText: result.text,
      };
      // Reset silence timer on new speech
      this._resetSilenceTimer();
      return;
    }

    // Final result
    const finalText = result.text.trim();
    if (!finalText) return;

    this._lastFinalText = finalText;
    this._clearSilenceTimer();

    // Confirm after silence delay
    this._silenceTimer = setTimeout(() => {
      void this._confirmAndFill(finalText).catch((err) => {
        this._callbacks.playEarcon?.('error');
        this._state = {
          ...this._state,
          lastError: err instanceof Error ? err.message : '确认失败 | Confirm failed',
        };
      });
    }, this._config.silenceConfirmDelayMs);
  }

  /**
   * Force confirm current text immediately (e.g., user tapped confirm).
   */
  async confirmNow(): Promise<void> {
    this._clearSilenceTimer();
    if (this._lastFinalText) {
      await this._confirmAndFill(this._lastFinalText);
    }
  }

  /**
   * Skip current segment and move to next
   */
  skipCurrent(): void {
    this._clearSilenceTimer();
    this._lastFinalText = '';
    this._state = { ...this._state, interimText: '', confirmedText: '' };
    void this._advanceToNext();
  }

  /** Number of undo-able operations. | 可撤销操作次数 */
  get undoCount(): number {
    return this._filledHistory.length;
  }

  /**
   * Undo the last fill (restore previous text) and navigate back.
   * 撤销最后一次填充，恢复文本并跳回该句段。
   */
  async undoLast(): Promise<void> {
    const last = this._filledHistory.pop();
    if (!last) return;

    await this._callbacks.restoreSegment(last.segmentId, last.layer, last.previousText);

    const nextDone = Math.max(0, this._state.progress.done - 1);
    this._state = {
      ...this._state,
      filledCount: Math.max(0, this._state.filledCount - 1),
      progress: { ...this._state.progress, done: nextDone },
      confirmedText: '',
      lastUpdateAt: Date.now(),
    };

    // Navigate back to the restored segment so user can re-dictate
    // 跳回被撤销的句段，便于重新听写
    const restoredIdx = this._segments.findIndex((s) => s.segmentId === last.segmentId);
    if (restoredIdx >= 0) {
      this._currentSegmentIndex = restoredIdx;
      const segment = this._segments[restoredIdx] ?? null;
      this._state = { ...this._state, currentSegment: segment };
      if (segment) this._callbacks.navigateTo(segment.segmentId);
    }
  }

  /**
   * Undo all fills (batch rollback) — restores every segment in reverse order.
   * 批量撤销所有填充，按逆序恢复每个句段。
   */
  async undoAll(): Promise<number> {
    let count = 0;
    while (this._filledHistory.length > 0) {
      const entry = this._filledHistory.pop()!;
      await this._callbacks.restoreSegment(entry.segmentId, entry.layer, entry.previousText);
      count++;
    }
    if (count > 0) {
      this._state = {
        ...this._state,
        filledCount: 0,
        progress: { ...this._state.progress, done: 0 },
        confirmedText: '',
        lastUpdateAt: Date.now(),
      };
      // Navigate back to first segment | 跳回第一个句段
      this._currentSegmentIndex = 0;
      const segment = this._segments[0] ?? null;
      this._state = { ...this._state, currentSegment: segment };
      if (segment) this._callbacks.navigateTo(segment.segmentId);
    }
    return count;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _confirmAndFill(text: string): Promise<void> {
    const segment = this._state.currentSegment;
    if (!segment) return;

    const previousText = this._config.targetLayer === 'transcription'
      ? segment.existingText
      : (this._config.targetLayer === 'translation' ? segment.existingTranslation : null);

    try {
      const transformedText = this._callbacks.transformTextForFill
        ? await this._callbacks.transformTextForFill({
          layer: this._config.targetLayer,
          text,
          segmentId: segment.segmentId,
        })
        : text;
      await this._callbacks.fillSegment(segment.segmentId, this._config.targetLayer, transformedText);
      this._filledHistory.push({
        segmentId: segment.segmentId,
        layer: this._config.targetLayer,
        previousText,
      });

      if (this._config.targetLayer === 'transcription') {
        segment.existingText = transformedText;
      } else if (this._config.targetLayer === 'translation') {
        segment.existingTranslation = transformedText;
      }

      this._callbacks.playEarcon?.('success');
      this._state = {
        ...this._state,
        confirmedText: transformedText,
        interimText: '',
        filledCount: this._state.filledCount + 1,
        progress: { ...this._state.progress, done: this._state.filledCount + 1 },
      };
      this._lastFinalText = '';

      if (this._config.autoAdvance) {
        // Small delay so user sees the result before advancing
        await new Promise<void>((resolve) => setTimeout(resolve, 400));
        this._advanceToNext();
      } else if (this._config.autoStopOnComplete) {
        this.stop();
      }
    } catch (err) {
      this._callbacks.playEarcon?.('error');
      this._state = {
        ...this._state,
        lastError: err instanceof Error ? err.message : '填充失败 | Fill failed',
      };
    }
  }

  private async _advanceToNext(): Promise<void> {
    const nextIdx = this._findFirstUnannotated(this._currentSegmentIndex + 1);

    if (nextIdx < 0) {
      // All done
      this._callbacks.playEarcon?.('success');
      this.stop();
      return;
    }

    this._currentSegmentIndex = nextIdx;
    const segment = this._segments[nextIdx] ?? null;
    this._state = {
      ...this._state,
      currentSegment: segment,
      interimText: '',
      confirmedText: '',
    };
    if (segment) await this._callbacks.navigateTo(segment.segmentId);
    // B-07 fix: defer timer reset to next tick so React UI can flush re-render first
    setTimeout(() => this._resetMaxDurationTimer(), 0);
  }

  private _findFirstUnannotated(fromIndex: number): number {
    const layer = this._config.targetLayer;
    for (let i = fromIndex; i < this._segments.length; i++) {
      const seg = this._segments[i];
      if (!seg) continue;
      if (seg.skipProcessing) continue;
      if (layer === 'transcription' && !seg.existingText) return i;
      if (layer === 'translation' && !seg.existingTranslation) return i;
      if (layer === 'gloss' && !seg.existingGloss) return i;
    }
    return -1;
  }

  private _countProcessableSegments(): number {
    return this._segments.filter((segment) => segment && !segment.skipProcessing).length;
  }

  private _resetSilenceTimer(): void {
    this._clearSilenceTimer();
    // Silence timer is set in onSttResult when we get a final
  }

  private _clearSilenceTimer(): void {
    if (this._silenceTimer !== null) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  private _resetMaxDurationTimer(): void {
    if (this._maxDurationTimer !== null) {
      clearTimeout(this._maxDurationTimer);
    }
    this._maxDurationTimer = setTimeout(() => {
      if (this._state.active) {
        // Auto-confirm on max duration
        void this.confirmNow();
      }
    }, this._config.maxUnitDurationSec * 1000);
  }

  private _clearTimers(): void {
    this._clearSilenceTimer();
    if (this._maxDurationTimer !== null) {
      clearTimeout(this._maxDurationTimer);
      this._maxDurationTimer = null;
    }
  }

  private _createIdleState(): DictationPipelineState {
    return {
      active: false,
      currentSegment: null,
      interimText: '',
      confirmedText: '',
      filledCount: 0,
      progress: { done: 0, total: 0 },
      lastUpdateAt: Date.now(),
    };
  }
}
