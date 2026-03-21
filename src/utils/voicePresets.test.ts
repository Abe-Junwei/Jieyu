/**
 * voicePresets — 语音预设配置测试
 * Tests for voice preset structure integrity and index constants.
 */

import { describe, it, expect } from 'vitest';
import { VOICE_PRESETS, DEFAULT_CN_PRESET, DEFAULT_GLOBAL_PRESET, type VoicePreset } from './voicePresets';

describe('voicePresets', () => {
  it('应有 5 个预设', () => {
    expect(VOICE_PRESETS).toHaveLength(5);
  });

  it('每个预设应有完整结构 | Each preset has required fields', () => {
    for (const preset of VOICE_PRESETS) {
      expect(preset.label).toBeTruthy();
      expect(preset.hint).toBeTruthy();
      expect(typeof preset.engine).toBe('string');
      expect(preset.config).toBeDefined();
    }
  });

  it('commercial 预设必须指定 commercialKind | commercial presets require commercialKind', () => {
    const commercial = VOICE_PRESETS.filter((p) => p.engine === 'commercial');
    expect(commercial.length).toBeGreaterThanOrEqual(3);
    for (const preset of commercial) {
      expect(preset.commercialKind).toBeTruthy();
    }
  });

  it('whisper-local 预设不需要 commercialKind', () => {
    const local = VOICE_PRESETS.find((p) => p.engine === 'whisper-local');
    expect(local).toBeDefined();
    expect(local!.commercialKind).toBeUndefined();
    expect(local!.config.baseUrl).toContain('localhost');
  });

  it('DEFAULT_CN_PRESET 指向中国预设', () => {
    const preset = VOICE_PRESETS[DEFAULT_CN_PRESET] as VoicePreset;
    expect(preset.label).toContain('中国');
    expect(preset.engine).toBe('commercial');
  });

  it('DEFAULT_GLOBAL_PRESET 指向海外预设', () => {
    const preset = VOICE_PRESETS[DEFAULT_GLOBAL_PRESET] as VoicePreset;
    expect(preset.label).toContain('海外');
    expect(preset.engine).toBe('commercial');
  });

  it('所有 commercialKind 应互不重复', () => {
    const kinds = VOICE_PRESETS
      .filter((p): p is VoicePreset & { commercialKind: string } => !!p.commercialKind)
      .map((p) => p.commercialKind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
