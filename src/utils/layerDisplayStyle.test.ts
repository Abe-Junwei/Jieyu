// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType } from '../db';
import {
  buildOrthographyPreviewTextProps,
  clearFontCoverageVerificationCache,
  getCachedFontCoverageVerification,
  isIpaModeForLanguage,
  layerDisplaySettingsToStyle,
  resolveDirectionForLanguage,
  resolveOrthographyRenderPolicy,
  resolveScriptForLanguage,
  verifyFontCoverage,
} from './layerDisplayStyle';

const NOW = '2026-03-31T00:00:00.000Z';

beforeEach(() => {
  clearFontCoverageVerificationCache();
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      check: vi.fn((font: string) => !font.includes('Missing')),
      load: vi.fn(async () => []),
    },
  });
  window.localStorage.clear();
});

describe('layerDisplayStyle orthography resolution', () => {
  it('prefers the selected orthography over the first language match', () => {
    const orthographies: OrthographyDocType[] = [
      {
        id: 'ortho-kas-arab',
        languageId: 'kas',
        name: { zho: '克什米尔文（阿拉伯）' },
        scriptTag: 'Arab',
        createdAt: NOW,
      },
      {
        id: 'ortho-kas-deva',
        languageId: 'kas',
        name: { zho: '克什米尔文（天城）' },
        scriptTag: 'Deva',
        createdAt: NOW,
      },
    ];

    expect(resolveScriptForLanguage('kas', orthographies, 'ortho-kas-deva')).toBe('Deva');
  });

  it('derives ipa mode from the selected orthography only', () => {
    const orthographies: OrthographyDocType[] = [
      {
        id: 'ortho-eng-practical',
        languageId: 'eng',
        name: { zho: '英语实用拼写' },
        scriptTag: 'Latn',
        type: 'practical',
        createdAt: NOW,
      },
      {
        id: 'ortho-eng-ipa',
        languageId: 'eng',
        name: { zho: '英语 IPA' },
        scriptTag: 'Latn',
        type: 'phonetic',
        createdAt: NOW,
      },
    ];

    expect(isIpaModeForLanguage('eng', orthographies, 'ortho-eng-practical')).toBe(false);
    expect(isIpaModeForLanguage('eng', orthographies, 'ortho-eng-ipa')).toBe(true);
  });

  it('derives rtl direction from orthography metadata and script fallback', () => {
    const orthographies: OrthographyDocType[] = [
      {
        id: 'ortho-urd-arab',
        languageId: 'urd',
        name: { zho: '乌尔都语阿拉伯字母' },
        scriptTag: 'Arab',
        createdAt: NOW,
      },
    ];

    expect(resolveDirectionForLanguage('urd', orthographies, 'ortho-urd-arab')).toBe('rtl');
  });

  it('builds render policy from orthography defaults', () => {
    const orthographies: OrthographyDocType[] = [
      {
        id: 'ortho-arabic-study',
        languageId: 'ara',
        name: { zho: '阿拉伯语研究正字法' },
        scriptTag: 'Arab',
        direction: 'rtl',
        exemplarCharacters: {
          main: ['ا', 'ب', 'ت'],
        },
        fontPreferences: {
          primary: ['Scheherazade New'],
          fallback: ['Noto Sans Arabic'],
          lineHeightScale: 1.3,
        },
        bidiPolicy: {
          isolateInlineRuns: true,
          preferDirAttribute: true,
        },
        createdAt: NOW,
      },
    ];

    const renderPolicy = resolveOrthographyRenderPolicy('ara', orthographies, 'ortho-arabic-study');
    const style = layerDisplaySettingsToStyle(undefined, renderPolicy);

    expect(renderPolicy.defaultFontKey).toBe('Scheherazade New');
    expect(renderPolicy.textDirection).toBe('rtl');
    expect(renderPolicy.lineHeightScale).toBe(1.3);
    expect(renderPolicy.isolateInlineRuns).toBe(true);
    expect(renderPolicy.coverageSummary.confidence).toBe('sample-backed');
    expect(renderPolicy.coverageSummary.exemplarCharacterCount).toBe(3);
    expect(renderPolicy.preferredFontKeys).toEqual(['Scheherazade New']);
    expect(renderPolicy.fallbackFontKeys).toEqual(['Noto Sans Arabic']);
    expect(String(style.fontFamily)).toContain('Scheherazade New');
    expect(renderPolicy.defaultFontCss).not.toContain('JetBrains Mono');
    expect(style.direction).toBe('rtl');
    expect(style.unicodeBidi).toBe('isolate');
  });

  it('builds preview text props with dir attribute and orthography-aware style', () => {
    const renderPolicy = resolveOrthographyRenderPolicy('ara', [{
      id: 'ortho-ara-preview',
      languageId: 'ara',
      name: { zho: '阿拉伯语预览' },
      scriptTag: 'Arab',
      direction: 'rtl',
      bidiPolicy: {
        isolateInlineRuns: true,
        preferDirAttribute: true,
      },
      fontPreferences: {
        primary: ['Scheherazade New'],
      },
      createdAt: NOW,
    }], 'ortho-ara-preview');

    const previewProps = buildOrthographyPreviewTextProps(renderPolicy);

    expect(previewProps.dir).toBe('rtl');
    expect(previewProps.style.direction).toBe('rtl');
    expect(previewProps.style.unicodeBidi).toBe('isolate');
    expect(String(previewProps.style.fontFamily)).toContain('Scheherazade New');
  });

  it('keeps strict-script custom fonts on top while preserving script-safe fallback stack', () => {
    const renderPolicy = resolveOrthographyRenderPolicy('ara', [{
      id: 'ortho-ara',
      languageId: 'ara',
      name: { zho: '阿拉伯语' },
      scriptTag: 'Arab',
      direction: 'rtl',
      fontPreferences: {
        fallback: ['Noto Sans Arabic'],
      },
      createdAt: NOW,
    }], 'ortho-ara');

    const style = layerDisplaySettingsToStyle({ fontFamily: 'Local Missing Arabic' }, renderPolicy);

    expect(String(style.fontFamily)).toContain('Local Missing Arabic');
    expect(String(style.fontFamily)).toContain('Noto Sans Arabic');
    expect(String(style.fontFamily)).not.toContain('JetBrains Mono');
  });

  it('falls back to script-only coverage summary when no exemplars are configured', () => {
    const orthographies: OrthographyDocType[] = [
      {
        id: 'ortho-kas-deva',
        languageId: 'kas',
        name: { zho: '克什米尔文（天城）' },
        scriptTag: 'Deva',
        createdAt: NOW,
      },
    ];

    const renderPolicy = resolveOrthographyRenderPolicy('kas', orthographies, 'ortho-kas-deva');

    expect(renderPolicy.coverageSummary.confidence).toBe('script-only');
    expect(renderPolicy.coverageSummary.exemplarCharacterCount).toBe(0);
    expect(renderPolicy.coverageSummary.warning).toContain('未配置示例字符');
  });

  it('verifies and caches Arabic preset coverage', async () => {
    const renderPolicy = resolveOrthographyRenderPolicy('ara', [{
      id: 'ortho-ara',
      languageId: 'ara',
      name: { zho: '阿拉伯语' },
      scriptTag: 'Arab',
      exemplarCharacters: { main: ['ا', 'ب', 'ت'] },
      createdAt: NOW,
    }], 'ortho-ara');

    const result = await verifyFontCoverage('Scheherazade New', renderPolicy);
    const cached = getCachedFontCoverageVerification('Scheherazade New', renderPolicy);

    expect(result.status).toBe('verified');
    expect(cached?.status).toBe('verified');
  });

  it('verifies and caches Devanagari missing-glyph state', async () => {
    const renderPolicy = resolveOrthographyRenderPolicy('hin', [{
      id: 'ortho-hin',
      languageId: 'hin',
      name: { zho: '印地语' },
      scriptTag: 'Deva',
      exemplarCharacters: { main: ['क', 'ख', 'ग'] },
      createdAt: NOW,
    }], 'ortho-hin');

    const result = await verifyFontCoverage('Missing Devanagari', renderPolicy);

    expect(result.status).toBe('missing-glyphs');
  });

  it('uses Tibetan fallback probe text when no exemplars are configured', async () => {
    const renderPolicy = resolveOrthographyRenderPolicy('bod', [{
      id: 'ortho-bod',
      languageId: 'bod',
      name: { zho: '藏文' },
      scriptTag: 'Tibt',
      createdAt: NOW,
    }], 'ortho-bod');

    const result = await verifyFontCoverage('Noto Sans Tibetan', renderPolicy);

    expect(result.sampleText).toContain('ཀ');
  });

  it('uses IPA-oriented Latin probe text for phonetic orthographies', async () => {
    const renderPolicy = resolveOrthographyRenderPolicy('eng', [{
      id: 'ortho-eng-ipa',
      languageId: 'eng',
      name: { zho: '英语 IPA' },
      scriptTag: 'Latn',
      type: 'phonetic',
      createdAt: NOW,
    }], 'ortho-eng-ipa');

    const result = await verifyFontCoverage('Charis SIL', renderPolicy);

    expect(result.sampleText).toContain('ɕ');
  });
});