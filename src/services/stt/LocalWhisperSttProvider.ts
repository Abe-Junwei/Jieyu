/**
 * LocalWhisperSttProvider — Local whisper.cpp HTTP server.
 *
 * Calls the whisper-server HTTP wrapper (OpenAI-compatible endpoint)
 * running at localhost:3040 by default.
 *
 * 默认模型来自 localWhisperDefaults（多语 large-v3-turbo q5_0）。
 * Default model comes from localWhisperDefaults (multilingual large-v3-turbo q5_0).
 * 运行前需先下载模型： npm run data:download-whisper-model
 * Download the model first: npm run data:download-whisper-model
 *
 * @see src/tools/whisper-server/
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService.types';
import { whisperJsonToSttResult } from './sttConfidence';
import { createLogger } from '../../observability/logger';
import {
  LOCAL_WHISPER_DEFAULT_BASE_URL,
  LOCAL_WHISPER_DEFAULT_MODEL,
} from './localWhisperDefaults';

const log = createLogger('LocalWhisperSttProvider');

export interface LocalWhisperConfig {
  baseUrl: string; // defaults to LOCAL_WHISPER_DEFAULT_BASE_URL
  model: string; // model file name; defaults to LOCAL_WHISPER_DEFAULT_MODEL
}

export class LocalWhisperSttProvider implements CommercialSttProvider {
  readonly label = 'Whisper.cpp (本地)';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: Partial<LocalWhisperConfig> = {}) {
    this.baseUrl = (config.baseUrl ?? LOCAL_WHISPER_DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.model = config.model ?? LOCAL_WHISPER_DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(3000),
      });
      return resp.ok;
    } catch (err) {
      log.debug('availability probe failed', { err });
      return false;
    }
  }

  async transcribe(
    audioBlob: Blob,
    lang: string,
    options?: { signal?: AbortSignal },
  ): Promise<SttResult> {
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
      const text = await resp.text().catch((e) => {
        log.warn('failed to read error response body', { err: e });
        return '';
      });
      throw new Error(`Local Whisper failed: ${resp.status} ${text}`);
    }

    return whisperJsonToSttResult((await resp.json()) as Record<string, unknown>, lang, audioBlob);
  }
}
