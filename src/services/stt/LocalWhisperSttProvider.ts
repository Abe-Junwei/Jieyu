/**
 * LocalWhisperSttProvider — Local whisper.cpp HTTP server.
 *
 * Calls the whisper-server HTTP wrapper (OpenAI-compatible endpoint)
 * running at localhost:3040 by default.
 *
 * @see src/tools/whisper-server/
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService';

export interface LocalWhisperConfig {
  baseUrl: string;   // defaults to 'http://localhost:3040'
  model: string;     // model file name, e.g. 'ggml-base.bin'
}

export class LocalWhisperSttProvider implements CommercialSttProvider {
  readonly label = 'Whisper.cpp (本地)';
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: Partial<LocalWhisperConfig> = {}) {
    this.baseUrl = (config.baseUrl ?? 'http://localhost:3040').replace(/\/+$/, '');
    this.model = config.model ?? 'ggml-base.bin';
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

    const json = await resp.json() as { text?: string; language?: string | null };

    return {
      text: json.text ?? '',
      lang: json.language ?? lang,
      isFinal: true,
      confidence: 1.0,
      engine: 'whisper-local',
      audioBlob,
    };
  }
}
