/**
 * regionDetection — 区域检测工具测试
 * Tests for region detection: cached preference, Google probe, locale fallback.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectRegion, saveRegionPreference, clearRegionPreference } from './regionDetection';

// ── helpers ─────────────────────────────────────────────────────────────────

function stubNavigatorLanguage(lang: string) {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(lang);
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('regionDetection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── saveRegionPreference / clearRegionPreference ────────────────────────

  it('saveRegionPreference 写入 localStorage，clearRegionPreference 清除', () => {
    saveRegionPreference('cn');
    expect(localStorage.getItem('jieyu.voice.region')).toBe('cn');
    clearRegionPreference();
    expect(localStorage.getItem('jieyu.voice.region')).toBeNull();
  });

  // ── detectRegion: cached preference ─────────────────────────────────────

  it('缓存命中 cn → 直接返回 cn，不探测', async () => {
    localStorage.setItem('jieyu.voice.region', 'cn');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await detectRegion();
    expect(result).toBe('cn');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('缓存命中 global → 直接返回 global', async () => {
    localStorage.setItem('jieyu.voice.region', 'global');
    const result = await detectRegion();
    expect(result).toBe('global');
  });

  it('缓存值无效 → 忽略，走探测流程', async () => {
    localStorage.setItem('jieyu.voice.region', 'invalid');
    // 探测成功 → global
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const result = await detectRegion();
    expect(result).toBe('global');
  });

  // ── detectRegion: Google probe success → global ─────────────────────────

  it('Google 探测成功（status 204）→ global', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const result = await detectRegion();
    expect(result).toBe('global');
  });

  it('Google 探测成功（no-cors opaque response）→ global', async () => {
    // no-cors 响应在真实浏览器中 status=0, ok=false — jsdom 不允许构造 status 0
    // 模拟为 ok=false + status=0 的对象
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 0 } as Response);
    const result = await detectRegion();
    expect(result).toBe('global');
  });

  // ── detectRegion: Google probe failure + locale fallback ────────────────

  it('Google 探测超时 + zh-CN locale → cn', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    stubNavigatorLanguage('zh-CN');
    const result = await detectRegion();
    expect(result).toBe('cn');
  });

  it('Google 探测超时 + zh locale → cn', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    stubNavigatorLanguage('zh');
    const result = await detectRegion();
    expect(result).toBe('cn');
  });

  it('Google 探测超时 + zh-HK locale → global（非大陆）', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    stubNavigatorLanguage('zh-HK');
    const result = await detectRegion();
    expect(result).toBe('global');
  });

  it('Google 探测超时 + zh-TW locale → global（非大陆）', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    stubNavigatorLanguage('zh-TW');
    const result = await detectRegion();
    expect(result).toBe('global');
  });

  it('Google 探测超时 + en-US locale → global', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    stubNavigatorLanguage('en-US');
    const result = await detectRegion();
    expect(result).toBe('global');
  });

  // ── detectRegion: Google probe → zh-CN user abroad can reach Google ─────

  it('zh-CN locale 但 Google 可达 → global（海外中文用户）', async () => {
    stubNavigatorLanguage('zh-CN');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    const result = await detectRegion();
    expect(result).toBe('global');
  });
});
