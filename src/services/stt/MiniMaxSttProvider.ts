/**
 * MiniMaxSttProvider — MiniMax AI ASR (speech-to-text).
 *
 * MiniMax provides an OpenAI-compatible ASR API with generous free tier.
 * Endpoint: POST https://api.minimax.chat/v1/audio/transcriptions
 * Free tier: 1000 minutes/month
 *
 * API key format: JWT token (Bearer token starting with "eyJ...")
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService';

export interface MiniMaxSttProviderConfig {
  apiKey: string;
  baseUrl?: string;   // defaults to 'https://api.minimax.chat/v1'
  model?: string;      // defaults to 'speech-01'
}

/** Map BCP-47 to ISO 639-1 for MiniMax language parameter */
function toIso639_1(bcp47: string): string {
  return (bcp47.split('-')[0] ?? bcp47).toLowerCase();
}

export class MiniMaxSttProvider implements CommercialSttProvider {
  readonly label = 'MiniMax ASR (免费)';
  private readonly config: Required<Omit<MiniMaxSttProviderConfig, 'model'>> & { model: string };

  constructor(config: MiniMaxSttProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: (config.baseUrl ?? 'https://api.minimax.chat/v1').replace(/\/+$/, ''),
      model: config.model ?? 'speech-01',
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      // MiniMax uses OpenAI-compatible models endpoint
      const resp = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return resp.ok;
    } catch (err) {
      console.debug('[MiniMaxSttProvider] availability probe failed:', err);
      return false;
    }
  }

  async transcribe(audioBlob: Blob, lang: string, options?: { signal?: AbortSignal }): Promise<SttResult> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', this.config.model);

    const langCode = toIso639_1(lang);
    if (langCode) formData.append('language', langCode);

    const resp = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: formData,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`MiniMax STT failed: ${resp.status} ${text}`);
    }

    const json = await resp.json() as { text?: string };

    return {
      text: json.text ?? '',
      lang,
      isFinal: true,
      confidence: 1.0,
      engine: 'commercial',
      audioBlob,
    };
  }
}
