// @vitest-environment jsdom
/**
 * 本地 Whisper 默认配置：唯一来源、多语、各处一致（S-1）
 * Local Whisper defaults: single source, multilingual, consistent everywhere (S-1).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import whisperModelDefaults from '../../tools/whisper-server/whisperModelDefaults.json';
import { zhCNDictionary as zhCN } from '../../i18n/dictionaries/zh-CN';
import { enUSDictionary as enUS } from '../../i18n/dictionaries/en-US';
import { VOICE_PRESETS } from '../../utils/voicePresets';
import { loadLocalWhisperConfig } from '../../hooks/voice/useVoiceDock';
import { resolveVoiceAgentRuntimeConfig } from '../config/voiceAgentRuntimeConfig';
import { LocalWhisperSttProvider } from './LocalWhisperSttProvider';
import {
  LOCAL_WHISPER_DEFAULT_BASE_URL,
  LOCAL_WHISPER_DEFAULT_MODEL,
  LOCAL_WHISPER_DEFAULT_MODEL_MULTILINGUAL,
} from './localWhisperDefaults';

const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('local whisper defaults (S-1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('默认模型是多语 whisper.cpp 模型 | default model is a multilingual whisper.cpp model', () => {
    expect(LOCAL_WHISPER_DEFAULT_MODEL).toBe(whisperModelDefaults.modelFile);
    expect(LOCAL_WHISPER_DEFAULT_MODEL_MULTILINGUAL).toBe(true);
    expect(LOCAL_WHISPER_DEFAULT_MODEL).toMatch(/^ggml-.+\.bin$/);
    // whisper.cpp 的英语专用模型以 .en 结尾；distil-whisper 系列只支持英语
    // whisper.cpp English-only models carry a ".en" suffix; the distil-whisper family is English-only
    expect(LOCAL_WHISPER_DEFAULT_MODEL).not.toMatch(/\.en[.-]/);
    expect(LOCAL_WHISPER_DEFAULT_MODEL).not.toMatch(/distil/i);
    expect(whisperModelDefaults.sourceUrl.endsWith(`/${LOCAL_WHISPER_DEFAULT_MODEL}`)).toBe(true);
    expect(whisperModelDefaults.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('浏览器端各入口默认值一致 | every app-side default resolves to the same model and URL', async () => {
    const preset = VOICE_PRESETS.find((p) => p.engine === 'whisper-local');
    expect(preset?.config).toMatchObject({
      baseUrl: LOCAL_WHISPER_DEFAULT_BASE_URL,
      model: LOCAL_WHISPER_DEFAULT_MODEL,
    });

    expect(loadLocalWhisperConfig()).toEqual({
      baseUrl: LOCAL_WHISPER_DEFAULT_BASE_URL,
      model: LOCAL_WHISPER_DEFAULT_MODEL,
    });

    const runtime = resolveVoiceAgentRuntimeConfig({});
    expect(runtime.whisperServerUrl).toBe(LOCAL_WHISPER_DEFAULT_BASE_URL);
    expect(runtime.whisperServerModel).toBe(LOCAL_WHISPER_DEFAULT_MODEL);

    expect(zhCN['transcription.voiceWidget.placeholder.whisperModel']).toBe(
      LOCAL_WHISPER_DEFAULT_MODEL,
    );
    expect(enUS['transcription.voiceWidget.placeholder.whisperModel']).toBe(
      LOCAL_WHISPER_DEFAULT_MODEL,
    );

    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ text: 'ok', language: 'zh' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await new LocalWhisperSttProvider().transcribe(new Blob(['a']), 'zh-CN');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${LOCAL_WHISPER_DEFAULT_BASE_URL}/v1/audio/transcriptions`);
    expect((init?.body as FormData).get('model')).toBe(LOCAL_WHISPER_DEFAULT_MODEL);
  });

  it('whisper-server 读取同一份默认文件 | whisper-server reads the same defaults file', () => {
    const server = readFileSync(path.join(REPO_ROOT, 'src/tools/whisper-server/server.js'), 'utf8');
    expect(server).toContain("new URL('./whisperModelDefaults.json', import.meta.url)");
    expect(server).toContain('MODEL_DEFAULTS.modelFile');
    expect(server).not.toMatch(/['"]ggml-[\w.-]+\.bin['"]/);
  });

  it('源码中没有其他硬编码的模型默认值 | no other hard-coded ggml model defaults in src', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx|js|mjs)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
        const rel = path.relative(REPO_ROOT, full);
        if (rel.startsWith('src/i18n/dictionaries/')) continue; // 占位符已由上面的断言约束 | placeholders asserted above
        const text = readFileSync(full, 'utf8');
        for (const m of text.matchAll(/['"`]ggml-[\w.-]+\.bin['"`]/g)) {
          // 仅允许出现在 JSDoc 示例行里 | only allowed inside a doc-comment example line
          const line = text.slice(text.lastIndexOf('\n', m.index) + 1, text.indexOf('\n', m.index));
          if (!/^\s*\*/.test(line)) offenders.push(`${rel}: ${m[0]}`);
        }
      }
    };
    walk(path.join(REPO_ROOT, 'src'));
    expect(offenders).toEqual([]);
  });
});
