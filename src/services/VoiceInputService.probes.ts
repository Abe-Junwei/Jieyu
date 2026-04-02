import { createLogger } from '../observability/logger';
import { decodeEscapedUnicode } from '../utils/decodeEscapedUnicode';

const log = createLogger('VoiceInputService');
const STT_TRANSCRIPTION_TIMEOUT_MS = 20_000;
const FILL_LOCAL_WHISPER_MODEL_ERROR = decodeEscapedUnicode('\\u8bf7\\u5148\\u586b\\u5199\\u672c\\u5730 Whisper \\u6a21\\u578b\\u540d');
const OLLAMA_CONNECT_ERROR_PREFIX = decodeEscapedUnicode('\\u65e0\\u6cd5\\u8fde\\u63a5 Ollama \\u670d\\u52a1\\uff1a');
const MODEL_NOT_FOUND_PREFIX = decodeEscapedUnicode('\\u672a\\u627e\\u5230\\u6a21\\u578b ');
const AVAILABLE_MODELS_PREFIX = decodeEscapedUnicode('\\u3002\\u5f53\\u524d\\u53ef\\u7528\\u6a21\\u578b\\uff1a');
const NONE_LABEL = decodeEscapedUnicode('\\u65e0');
const OLLAMA_AUDIO_INTERFACE_MISSING_ERROR = decodeEscapedUnicode('\\u5f53\\u524d Ollama \\u5b9e\\u4f8b\\u672a\\u66b4\\u9732\\u97f3\\u9891\\u8f6c\\u5199\\u63a5\\u53e3\\uff0c\\u8bf7\\u6539\\u7528\\u652f\\u6301\\u97f3\\u9891\\u8f6c\\u5199\\u7684\\u672c\\u5730\\u670d\\u52a1\\u6216\\u5176\\u4ed6 STT \\u5f15\\u64ce');
const FILL_WHISPER_MODEL_ERROR = decodeEscapedUnicode('\\u8bf7\\u5148\\u586b\\u5199 Whisper \\u6a21\\u578b\\u540d');
const WHISPER_SERVER_UNAVAILABLE_PREFIX = decodeEscapedUnicode('whisper-server \\u4e0d\\u53ef\\u7528\\uff1a');
const WHISPER_SERVER_CONNECT_PREFIX = decodeEscapedUnicode('\\u65e0\\u6cd5\\u8fde\\u63a5 whisper-server\\uff08');
const WHISPER_SERVER_CONNECT_SUFFIX = decodeEscapedUnicode('\\uff09\\uff1a');
const WHISPER_SERVER_AUDIO_INTERFACE_MISSING_ERROR = decodeEscapedUnicode('whisper-server \\u672a\\u66b4\\u9732\\u97f3\\u9891\\u8f6c\\u5199\\u63a5\\u53e3');
const WHISPER_SERVER_PROBE_FAILED_PREFIX = decodeEscapedUnicode('whisper-server \\u8f6c\\u5199\\u63a2\\u6d4b\\u5931\\u8d25\\uff1a');

export interface OllamaWhisperAvailabilityResult {
  available: boolean;
  error?: string;
}

export function buildWhisperTranscriptionEndpoints(baseUrl: string): string[] {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const withoutV1 = normalizedBaseUrl.replace(/\/v1$/, '');

  return Array.from(new Set([
    `${normalizedBaseUrl}/v1/audio/transcriptions`,
    `${withoutV1}/v1/audio/transcriptions`,
    `${normalizedBaseUrl}/api/audio/transcriptions`,
    `${withoutV1}/api/audio/transcriptions`,
  ]));
}

export function createTranscriptionTimeoutController(timeoutMs = STT_TRANSCRIPTION_TIMEOUT_MS): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    clear: () => clearTimeout(timeoutId),
  };
}

export async function testOllamaWhisperAvailability(
  baseUrl: string,
  model: string,
): Promise<OllamaWhisperAvailabilityResult> {
  const normalizedBaseUrl = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const normalizedModel = model.trim();
  if (!normalizedModel) {
    return { available: false, error: FILL_LOCAL_WHISPER_MODEL_ERROR };
  }

  const tagsUrl = `${normalizedBaseUrl.replace(/\/v1$/, '')}/api/tags`;
  let availableModels: string[] = [];
  try {
    const resp = await fetch(tagsUrl);
    if (!resp.ok) {
      return { available: false, error: `${OLLAMA_CONNECT_ERROR_PREFIX}${resp.status}` };
    }
    const json = await resp.json() as { models?: Array<{ name?: string; model?: string }> };
    availableModels = (json.models ?? [])
      .map((item) => item.name ?? item.model ?? '')
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, error: `${OLLAMA_CONNECT_ERROR_PREFIX}${message}` };
  }

  if (availableModels.length > 0 && !availableModels.includes(normalizedModel)) {
    const preview = availableModels.slice(0, 3).join('\u3001');
    return {
      available: false,
      error: `${MODEL_NOT_FOUND_PREFIX}${normalizedModel}${AVAILABLE_MODELS_PREFIX}${preview || NONE_LABEL}`,
    };
  }

  const endpoints = buildWhisperTranscriptionEndpoints(normalizedBaseUrl);
  for (const endpoint of endpoints) {
    const body = new FormData();
    body.append('file', new Blob(['probe'], { type: 'audio/webm' }), 'probe.webm');
    body.append('model', normalizedModel);
    body.append('language', 'en');

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        body,
      });
      if (resp.status !== 404) {
        return { available: true };
      }
    } catch (err) {
      log.debug('Ollama probe failed, trying next endpoint', { endpoint, err });
    }
  }

  return {
    available: false,
    error: OLLAMA_AUDIO_INTERFACE_MISSING_ERROR,
  };
}

export async function testWhisperServerAvailability(
  baseUrl: string,
  model: string,
): Promise<{ available: boolean; error?: string }> {
  const normalizedBaseUrl = (baseUrl || 'http://localhost:3040').replace(/\/+$/, '');
  const normalizedModel = model.trim();
  if (!normalizedModel) {
    return { available: false, error: FILL_WHISPER_MODEL_ERROR };
  }

  try {
    const healthResp = await fetch(`${normalizedBaseUrl}/v1/models`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!healthResp.ok) {
      return { available: false, error: `${WHISPER_SERVER_UNAVAILABLE_PREFIX}${healthResp.status}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: `${WHISPER_SERVER_CONNECT_PREFIX}${normalizedBaseUrl}${WHISPER_SERVER_CONNECT_SUFFIX}${msg}` };
  }

  try {
    const minWav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x2E, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x40, 0x1F, 0x00, 0x00, 0x80, 0x3E, 0x00, 0x00,
      0x02, 0x00, 0x10, 0x00,
      0x64, 0x61, 0x74, 0x61, 0x22, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    const formData = new FormData();
    formData.append('file', new Blob([minWav], { type: 'audio/wav' }), 'probe.wav');
    formData.append('model', normalizedModel);
    formData.append('language', 'en');
    const resp = await fetch(`${normalizedBaseUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000),
    });
    if (resp.status !== 404) {
      return { available: true };
    }
    return { available: false, error: WHISPER_SERVER_AUDIO_INTERFACE_MISSING_ERROR };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: `${WHISPER_SERVER_PROBE_FAILED_PREFIX}${msg}` };
  }
}
