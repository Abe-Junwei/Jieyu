/**
 * VoiceAgentDictationController — Dictation pipeline 状态与生命周期管理
 * Extracted from VoiceAgentService to keep the orchestrator under its architecture ceiling.
 *
 * Owns the SpeechAnnotationPipeline instance and exposes a thin control surface.
 */

import {
  SpeechAnnotationPipeline,
  type AnnotationLayer,
  type QuickDictationConfig,
  type DictationPipelineCallbacks,
} from './SpeechAnnotationPipeline';
import type { SttResult } from './VoiceInputService.types';

export class VoiceAgentDictationController {
  private _pipeline: SpeechAnnotationPipeline | null = null;
  private readonly _onTransformDictationPipelineFill:
    | ((input: { layer: AnnotationLayer; text: string; segmentId: string }) => Promise<string>)
    | undefined;

  constructor(options: {
    onTransformDictationPipelineFill?: (input: {
      layer: AnnotationLayer;
      text: string;
      segmentId: string;
    }) => Promise<string>;
  }) {
    this._onTransformDictationPipelineFill = options.onTransformDictationPipelineFill;
  }

  start(callbacks: DictationPipelineCallbacks, config?: QuickDictationConfig): void {
    if (this._pipeline) {
      this._pipeline.stop();
    }

    const effectiveCallbacks: DictationPipelineCallbacks = { ...callbacks };
    if (!callbacks.transformTextForFill && this._onTransformDictationPipelineFill) {
      effectiveCallbacks.transformTextForFill = this._onTransformDictationPipelineFill;
    }

    this._pipeline = new SpeechAnnotationPipeline(effectiveCallbacks, {
      ...config,
      autoAdvance: config?.autoAdvance ?? true,
      silenceConfirmDelayMs: config?.silenceConfirmDelayMs ?? 600,
      maxUnitDurationSec: config?.maxUnitDurationSec ?? 60,
      skipAlreadyAnnotated: config?.skipAlreadyAnnotated ?? true,
    });

    void this._pipeline.start();
  }

  feedSttResult(result: SttResult): void {
    this._pipeline?.onSttResult(result);
  }

  getState() {
    return this._pipeline?.state ?? null;
  }

  skip(): void {
    this._pipeline?.skipCurrent();
  }

  async undo(): Promise<void> {
    await this._pipeline?.undoLast();
  }

  stop(): void {
    this._pipeline?.stop();
    this._pipeline = null;
  }

  getPipeline(): SpeechAnnotationPipeline | null {
    return this._pipeline;
  }
}
