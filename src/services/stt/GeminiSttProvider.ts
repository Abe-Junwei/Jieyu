/**
 * GeminiSttProvider — Google Gemini 2.0 Flash audio transcription.
 *
 * Uses the Gemini 2.0 Flash `generateContent` endpoint with inline audio.
 * Requires a Google API key with billing enabled.
 *
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService';

export interface GeminiSttProviderConfig {
  apiKey: string;
  baseUrl?: string;   // defaults to 'https://generativelanguage.googleapis.com/v1beta'
  model?: string;      // defaults to 'gemini-2.0-flash'
}

function toGeminiLang(bcp47: string): string {
  // Map common BCP-47 codes to Gemini-supported language tags
  const map: Record<string, string> = {
    'zh-CN': 'zh',
    'zh-TW': 'zh',
    'yue': 'zh',
    'ja-JP': 'ja',
    'en-US': 'en',
    'en-GB': 'en',
    'fr-FR': 'fr',
    'de-DE': 'de',
    'es-ES': 'es',
    'ko-KR': 'ko',
    'pt-BR': 'pt',
  };
  return map[bcp47] ?? bcp47.split('-')[0] ?? 'zh';
}

export class GeminiSttProvider implements CommercialSttProvider {
  readonly label = 'Gemini 2.0 Flash';
  private readonly config: Required<GeminiSttProviderConfig>;

  constructor(config: GeminiSttProviderConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta',
      model: config.model ?? 'gemini-2.0-flash',
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const resp = await fetch(
        `${this.config.baseUrl}/models?key=${this.config.apiKey}`,
        { method: 'GET' },
      );
      return resp.ok;
    } catch (err) {
      console.debug('[GeminiSttProvider] availability probe failed:', err);
      return false;
    }
  }

  async transcribe(audioBlob: Blob, lang: string): Promise<SttResult> {
    const langCode = toGeminiLang(lang);
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        '',
      ),
    );

    const resp = await fetch(
      `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/webm',
                    data: base64,
                  },
                },
                {
                  text: `Please transcribe this audio in ${langCode}. Reply with only the transcription text.`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 1024,
          },
        }),
      },
    );

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Gemini STT failed: ${resp.status} ${text}`);
    }

    const json = await resp.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return {
      text,
      lang,
      isFinal: true,
      confidence: 1.0,
      engine: 'commercial',
      audioBlob,
    };
  }
}
