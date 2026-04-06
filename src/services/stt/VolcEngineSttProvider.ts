/**
 * VolcEngineSttProvider — 火山引擎 (Volcano Engine) ASR.
 *
 * ByteDance's Volcano Engine provides ASR via its openspeech API.
 * Free tier available with registration.
 *
 * Authentication uses custom headers:
 *   - X-App-Id: application ID
 *   - Authorization: Bearer <access_token>
 *
 * Endpoint: POST https://openspeech.bytedance.com/api/v1/asr
 *
 * Note: Volcano Engine requires a token obtained through their console.
 * Register at https://console.volcengine.com/
 */

import type { CommercialSttProvider, SttResult } from '../VoiceInputService';

export interface VolcEngineSttProviderConfig {
  appId: string;
  accessToken: string;
  baseUrl?: string;    // defaults to 'https://openspeech.bytedance.com/api/v1'
  model?: string;      // defaults to 'volcengine_asr'
}

function toIso639_1(bcp47: string): string {
  return (bcp47.split('-')[0] ?? bcp47).toLowerCase();
}

export class VolcEngineSttProvider implements CommercialSttProvider {
  readonly label = '火山引擎 ASR';
  private readonly config: Required<Omit<VolcEngineSttProviderConfig, 'model'>> & { model: string };

  constructor(config: VolcEngineSttProviderConfig) {
    this.config = {
      appId: config.appId,
      accessToken: config.accessToken,
      baseUrl: config.baseUrl ?? 'https://openspeech.bytedance.com/api/v1',
      model: config.model ?? 'volcengine_asr',
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.accessToken || !this.config.appId) return false;
    try {
      const resp = await fetch(`${this.config.baseUrl}/asr`, {
        method: 'POST',
        headers: {
          'X-App-Id': this.config.appId,
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      // 仅 200 或 400（缺参数）说明端点可达且凭证有效 | Only 200 or 400 (missing params) confirms reachable + valid creds
      // 401/403 = 凭证无效，不应视为可用 | 401/403 = invalid credentials, should not be treated as available
      return resp.ok || resp.status === 400;
    } catch (err) {
      console.debug('[VolcEngineSttProvider] availability probe failed:', err);
      return false;
    }
  }

  async transcribe(audioBlob: Blob, lang: string, options?: { signal?: AbortSignal }): Promise<SttResult> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        '',
      ),
    );

    const langCode = toIso639_1(lang);

    const body = {
      app_id: this.config.appId,
      token: this.config.accessToken,
      audio: base64,
      audio_format: 'webm',
      rate: 16000,
      ...(langCode ? { language: langCode } : {}),
    };

    const resp = await fetch(`${this.config.baseUrl}/asr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Id': this.config.appId,
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
      ...(options?.signal ? { signal: options.signal } : {}),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch((e) => { console.warn('VolcEngine STT: failed to read error response body', e); return ''; });
      throw new Error(`VolcEngine STT failed: ${resp.status} ${text}`);
    }

    const json = await resp.json() as {
      text?: string;
      result?: string;
    };

    const text = json.text ?? json.result ?? '';

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
