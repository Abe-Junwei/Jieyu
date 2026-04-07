/**
 * LocalWhisperSttProvider — Local whisper.cpp HTTP server.
 *
 * Calls the whisper-server HTTP wrapper (OpenAI-compatible endpoint)
 * running at localhost:3040 by default.
 *
 * 默认模型已更新为 Distil-Whisper（知识蒸馏版，5.8× 推理加速）。
 * Default model updated to Distil-Whisper (knowledge-distilled, 5.8× faster inference).
 * 运行前需先下载模型： npm run data:download-distil-whisper
 * Download the model first: npm run data:download-distil-whisper
 *
 * @see src/tools/whisper-server/
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService';
import { computeWhisperConfidence, tryParseVerboseResponse } from './sttConfidence';

export interface LocalWhisperConfig {
  baseUrl: string;   // defaults to 'http://localhost:3040'
  model: string;     // model file name, e.g. 'ggml-base.bin'
}

export class LocalWhisperSttProvider implements CommercialSttProvider {
  readonly label = 'Distil-Whisper (本地)';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: Partial<LocalWhisperConfig> = {}) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:3040').replace(/\/+$/, '');
    this.model = config.model ?? 'ggml-distil-whisper-large-v3.bin';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch (err) {
      console.debug('[LocalWhisperSttProvider] availability probe failed:', err);
      return false;
    }
  }

  async transcribe(audioBlob: Blob, lang: string, options?: { signal?: AbortSignal }): Promise<SttResult> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', this.model);
    formData.append('response_format', 'verbose_json');
    // whisper-server uses BCP-47 or ISO codes; pass as-is
    const langCode = lang.split('-')[0] ?? '';
    if (langCode && langCode !== 'auto') formData.append('language', langCode);

    const resp = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!resp.ok) {
      const text = await resp.text().catch((e) => { console.warn('LocalWhisper STT: failed to read error response body', e); return ''; });
      throw new Error(`Local Whisper failed: ${resp.status} ${text}`);
    }

    const json = await resp.json() as Record<string, unknown>;
    const verbose = tryParseVerboseResponse(json);
    const confidence = verbose ? computeWhisperConfidence(verbose) : 1.0;

    return {
      text: (verbose?.text ?? (json.text as string | undefined)) ?? '',
      lang: (verbose?.language ?? (json.language as string | null | undefined)) ?? lang,
      isFinal: true,
      confidence,
      engine: 'whisper-local',
      audioBlob,
    };
  }
}
