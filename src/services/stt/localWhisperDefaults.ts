/**
 * 本地 whisper.cpp 默认配置的唯一来源（TS 侧入口）。
 * Single source of truth for the local whisper.cpp defaults (TS entry point).
 *
 * 真实数据在 src/tools/whisper-server/whisperModelDefaults.json，server.js 与下载脚本读同一份文件。
 * The data lives in src/tools/whisper-server/whisperModelDefaults.json; server.js and the download
 * script read the same file, so the app, the server and the downloader can never disagree.
 *
 * 选型 | Choice: ggml-large-v3-turbo-q5_0（多语，含中文；~574 MB 一次性离线下载）。
 * distil-large-v3 只支持英语；small 系列中文明显更差。
 * distil-large-v3 is English-only; the small family is noticeably weaker on Mandarin.
 */
import whisperModelDefaults from '../../tools/whisper-server/whisperModelDefaults.json';
import { createLogger } from '../../observability/logger';

const log = createLogger('localWhisperDefaults');

export const LOCAL_WHISPER_DEFAULT_MODEL: string = whisperModelDefaults.modelFile;
export const LOCAL_WHISPER_DEFAULT_BASE_URL: string = whisperModelDefaults.baseUrl;

/**
 * 本地 Whisper 设置的唯一存储键。v2：丢弃旧键里被挂载自动写入的旧默认模型（BF2-1）。
 * Single storage key for local Whisper settings. v2 drops the old key, whose value was the
 * auto-saved old default model (ggml-small-q5_k.bin) rather than a user choice (BF2-1).
 */
export const LOCAL_WHISPER_STORAGE_KEY = 'jieyu.voiceAgent.localWhisper.v2';
const LEGACY_LOCAL_WHISPER_STORAGE_KEY = 'jieyu.voiceAgent.localWhisper';

export type LocalWhisperConfig = {
  baseUrl?: string;
  model?: string;
};

function pickNonDefault(value: unknown, fallback: string): string | undefined {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed && trimmed !== fallback ? trimmed : undefined;
}

/** 读取本地 Whisper 设置，空白或缺失字段回落到默认值 | Load settings; blank/missing fields fall back to defaults */
export function loadLocalWhisperConfig(): { baseUrl: string; model: string } {
  let stored: LocalWhisperConfig = {};
  try {
    const legacy = window.localStorage.getItem(LEGACY_LOCAL_WHISPER_STORAGE_KEY);
    if (legacy !== null) {
      // 一次性迁移：保留用户设的 baseUrl；旧 model 分不清是自动写入还是用户选的，丢弃（BF3-2）
      // One-time migration: keep a user-set baseUrl; drop the old model, which can't be told apart
      // from the auto-saved default (BF3-2)
      window.localStorage.removeItem(LEGACY_LOCAL_WHISPER_STORAGE_KEY);
      const { baseUrl } = (JSON.parse(legacy) ?? {}) as LocalWhisperConfig;
      if (baseUrl && window.localStorage.getItem(LOCAL_WHISPER_STORAGE_KEY) === null) {
        saveLocalWhisperConfig({ baseUrl });
      }
    }
    const raw = window.localStorage.getItem(LOCAL_WHISPER_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') stored = parsed as LocalWhisperConfig;
  } catch (error) {
    log.warn('Failed to load local Whisper config from localStorage', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return {
    baseUrl: pickNonDefault(stored.baseUrl, '') ?? LOCAL_WHISPER_DEFAULT_BASE_URL,
    model: pickNonDefault(stored.model, '') ?? LOCAL_WHISPER_DEFAULT_MODEL,
  };
}

/**
 * 只保存用户改过的值；等于默认值的字段不写，默认值以后改了能自动生效（BF2-1）。
 * Persist only user-changed values; fields equal to the default are omitted so a future default
 * change reaches every user (BF2-1).
 */
export function saveLocalWhisperConfig(config: LocalWhisperConfig): void {
  const baseUrl = pickNonDefault(config.baseUrl, LOCAL_WHISPER_DEFAULT_BASE_URL);
  const model = pickNonDefault(config.model, LOCAL_WHISPER_DEFAULT_MODEL);
  try {
    if (!baseUrl && !model) {
      window.localStorage.removeItem(LOCAL_WHISPER_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      LOCAL_WHISPER_STORAGE_KEY,
      JSON.stringify({ ...(baseUrl ? { baseUrl } : {}), ...(model ? { model } : {}) }),
    );
  } catch (error) {
    log.warn('Failed to save local Whisper config to localStorage', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
