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
  maxUtteranceDurationSec?: number;
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
}

export interface DictationPipelineCallbacks {
  /** 获取目标句段列表（未标注优先） */
  getSegments: () => DictationSegment[];
  /** 获取当前选中的句段 ID */
  getCurrentSegmentId: () => string | null;
  /** 填充文本到句段 */
  fillSegment: (segmentId: string, layer: AnnotationLayer, text: string) => Promise<void>;
  /** 导航到指定句段 */
  navigateTo: (segmentId: string) => void;
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

  constructor(callbacks: DictationPipelineCallbacks, config: QuickDictationConfig = {}) {
    this._callbacks = callbacks;
    this._config = {
      autoAdvance: config.autoAdvance ?? true,
      silenceConfirmDelayMs: config.silenceConfirmDelayMs ?? 600,
      maxUtteranceDurationSec: config.maxUtteranceDurationSec ?? 60,
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
  start(): void {
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
      progress: { done: 0, total: this._segments.length },
      lastUpdateAt: Date.now(),
    };

    if (segment) this._callbacks.navigateTo(segment.segmentId);
    this._resetMaxDurationTimer();
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
    this._silenceTimer = setTimeout(async () => {
      await this._confirmAndFill(finalText);
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
    this._advanceToNext();
  }

  /**
   * Undo the last fill (restore previous text)
   */
  async undoLast(): Promise<void> {
    if (this._state.filledCount <= 0) return;
    // The actual undo is handled by the page — we just signal the count decremented
    this._state = { ...this._state, filledCount: this._state.filledCount - 1 };
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _confirmAndFill(text: string): Promise<void> {
    const segment = this._state.currentSegment;
    if (!segment) return;

    try {
      await this._callbacks.fillSegment(segment.segmentId, this._config.targetLayer, text);
      this._callbacks.playEarcon?.('success');
      this._state = {
        ...this._state,
        confirmedText: text,
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
    } catch {
      this._callbacks.playEarcon?.('error');
    }
  }

  private _advanceToNext(): void {
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
    if (segment) this._callbacks.navigateTo(segment.segmentId);
    this._resetMaxDurationTimer();
  }

  private _findFirstUnannotated(fromIndex: number): number {
    const layer = this._config.targetLayer;
    for (let i = fromIndex; i < this._segments.length; i++) {
      const seg = this._segments[i];
      if (!seg) continue;
      if (layer === 'transcription' && !seg.existingText) return i;
      if (layer === 'translation' && !seg.existingTranslation) return i;
      if (layer === 'gloss' && !seg.existingGloss) return i;
    }
    return -1;
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
    }, this._config.maxUtteranceDurationSec * 1000);
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
