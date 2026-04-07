/**
 * GroqSttProvider — Groq Cloud STT (free tier available).
 *
 * Uses Groq's OpenAI-compatible API for Whisper transcription.
 * Groq free tier includes 14,400 seconds/month of audio.
 * Endpoint: POST https://api.groq.com/openai/v1/audio/transcriptions
 *
 * Note: Groq API key starts with 'gsk_'.
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService';
import { computeWhisperConfidence, tryParseVerboseResponse } from './sttConfidence';

export interface GroqSttProviderConfig {
  apiKey: string;
  model?: string;   // defaults to 'whisper-large-v3'
}

/** Map BCP-47 to ISO 639-1 for Groq language parameter */
function toIso639_1(bcp47: string): string {
  return (bcp47.split('-')[0] ?? bcp47).toLowerCase();
}

export class GroqSttProvider implements CommercialSttProvider {
  readonly label = 'Groq Whisper (免费)';
  private readonly config: Required<Omit<GroqSttProviderConfig, 'model'>> & { model: string };

  constructor(config: GroqSttProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? 'whisper-large-v3',
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return resp.ok;
    } catch (err) {
      console.debug('[GroqSttProvider] availability probe failed:', err);
      return false;
    }
  }

  async transcribe(audioBlob: Blob, lang: string, options?: { signal?: AbortSignal }): Promise<SttResult> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');
    formData.append('model', this.config.model);
    formData.append('response_format', 'verbose_json');

    const langCode = toIso639_1(lang);
    if (langCode) formData.append('language', langCode);

    const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: formData,
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!resp.ok) {
      const text = await resp.text().catch((e) => { console.warn('Groq STT: failed to read error response body', e); return ''; });
      throw new Error(`Groq STT failed: ${resp.status} ${text}`);
    }

    const json = await resp.json() as Record<string, unknown>;
    const verbose = tryParseVerboseResponse(json);
    const confidence = verbose ? computeWhisperConfidence(verbose) : 1.0;

    return {
      text: (verbose?.text ?? (json.text as string | undefined)) ?? '',
      lang,
      isFinal: true,
      confidence,
      engine: 'commercial',
      audioBlob,
    };
  }
}
