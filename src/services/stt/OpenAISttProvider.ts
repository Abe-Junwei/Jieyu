/**
 * OpenAISttProvider — OpenAI GPT-4o Audio transcription.
 *
 * Uses the OpenAI Audio API (compatible with any OpenAI-compatible endpoint).
 * Endpoint: POST {baseUrl}/v1/audio/transcriptions
 *
 * Supports OpenAI, OpenRouter, Groq, and any OpenAI-compatible proxy.
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService';

export interface OpenAISttProviderConfig {
  apiKey: string;
  baseUrl?: string;   // defaults to 'https://api.openai.com/v1'
  model?: string;      // defaults to 'gpt-4o-audio-preview' or 'whisper-1'
  language?: string;    // BCP-47 language code
}

/** Map BCP-47 to ISO 639-1 for OpenAI language parameter */
function toIso639_1(bcp47: string): string {
  return (bcp47.split('-')[0] ?? bcp47).toLowerCase();
}

export class OpenAISttProvider implements CommercialSttProvider {
  readonly label = 'OpenAI Audio';
  private readonly config: Required<Omit<OpenAISttProviderConfig, 'language'>> & { language: string | undefined };

  constructor(config: OpenAISttProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
      model: config.model ?? 'whisper-1',
      language: config.language,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const resp = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async transcribe(audioBlob: Blob, lang: string): Promise<SttResult> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', this.config.model);

    const langCode = toIso639_1(lang);
    if (langCode) formData.append('language', langCode);

    const resp = await fetch(`${this.config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: formData,
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`OpenAI Audio STT failed: ${resp.status} ${text}`);
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
