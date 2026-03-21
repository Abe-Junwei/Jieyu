/**
 * SttStrategyRouter — STT 策略路由测试
 * Tests for engine selection based on network, battery, noise, and region.
 */

import { describe, it, expect } from 'vitest';
import { chooseSttEngine, type SttStrategyInput } from './SttStrategyRouter';

// ── helper ──────────────────────────────────────────────────────────────────

function input(overrides: Partial<SttStrategyInput> = {}): SttStrategyInput {
  return { preferred: 'web-speech', online: true, ...overrides };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('chooseSttEngine', () => {
  // ── 正常场景：返回用户偏好 ───────────────────────────────────────────────

  it('正常条件下返回 preferred engine', () => {
    expect(chooseSttEngine(input({ preferred: 'commercial' }))).toBe('commercial');
    expect(chooseSttEngine(input({ preferred: 'web-speech' }))).toBe('web-speech');
    expect(chooseSttEngine(input({ preferred: 'whisper-local' }))).toBe('whisper-local');
  });

  // ── 离线场景 ────────────────────────────────────────────────────────────

  it('离线 + preferred=commercial → whisper-local', () => {
    expect(chooseSttEngine(input({ online: false, preferred: 'commercial' }))).toBe('whisper-local');
  });

  it('离线 + preferred=web-speech → web-speech（浏览器缓存可能可用）', () => {
    expect(chooseSttEngine(input({ online: false, preferred: 'web-speech' }))).toBe('web-speech');
  });

  it('离线 + preferred=whisper-local → whisper-local', () => {
    expect(chooseSttEngine(input({ online: false, preferred: 'whisper-local' }))).toBe('whisper-local');
  });

  // ── 低电量 + 区域感知 ──────────────────────────────────────────────────

  it('低电量 + 非 CN → web-speech', () => {
    expect(chooseSttEngine(input({ batteryLevel: 0.10, regionHint: 'global' }))).toBe('web-speech');
  });

  it('低电量 + CN → commercial（web-speech 在 CN 不可用）', () => {
    expect(chooseSttEngine(input({ batteryLevel: 0.10, regionHint: 'cn' }))).toBe('commercial');
  });

  it('低电量 + regionHint 缺失 → web-speech（默认非 CN 行为）', () => {
    expect(chooseSttEngine(input({ batteryLevel: 0.10 }))).toBe('web-speech');
  });

  it('电量刚过阈值 (0.16) → 不触发低电量逻辑', () => {
    expect(chooseSttEngine(input({ batteryLevel: 0.16, preferred: 'commercial' }))).toBe('commercial');
  });

  // ── 高噪声 ─────────────────────────────────────────────────────────────

  it('高噪声 (≥0.08) → commercial', () => {
    expect(chooseSttEngine(input({ noiseLevel: 0.08 }))).toBe('commercial');
    expect(chooseSttEngine(input({ noiseLevel: 0.15 }))).toBe('commercial');
  });

  it('噪声未达阈值 (0.07) → 返回 preferred', () => {
    expect(chooseSttEngine(input({ noiseLevel: 0.07, preferred: 'web-speech' }))).toBe('web-speech');
  });

  // ── 优先级：离线 > 低电量 > 高噪声 ────────────────────────────────────

  it('离线优先级最高（即使低电量 + 高噪声）', () => {
    expect(chooseSttEngine(input({
      online: false,
      preferred: 'commercial',
      batteryLevel: 0.05,
      noiseLevel: 0.20,
    }))).toBe('whisper-local');
  });

  it('低电量优先级高于高噪声', () => {
    // 高噪声 → commercial，但低电量 + global → web-speech
    expect(chooseSttEngine(input({
      batteryLevel: 0.10,
      noiseLevel: 0.20,
      regionHint: 'global',
    }))).toBe('web-speech');
  });

  // ── 默认值处理 ──────────────────────────────────────────────────────────

  it('noiseLevel/batteryLevel 缺失时取默认值（0 / 1），不触发特殊路由', () => {
    expect(chooseSttEngine({ preferred: 'web-speech', online: true })).toBe('web-speech');
  });
});
