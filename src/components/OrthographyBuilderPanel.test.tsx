// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseOrthographyPickerResult } from '../hooks/useOrthographyPicker';
import { LocaleProvider } from '../i18n';
import type { OrthographyRenderPolicy } from '../utils/layerDisplayStyle';
import { clearFontCoverageVerificationCache } from '../utils/layerDisplayStyle';
import { OrthographyBuilderPanel } from './OrthographyBuilderPanel';

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

afterEach(() => {
  cleanup();
});

function createRenderPolicy(overrides?: Partial<OrthographyRenderPolicy>): OrthographyRenderPolicy {
  const { orthography, ...restOverrides } = overrides ?? {};
  return {
    scriptTag: 'Arab',
    direction: 'rtl',
    textDirection: 'rtl',
    ipaMode: false,
    defaultFontKey: 'Scheherazade New',
    defaultFontCss: '"Scheherazade New", "Noto Sans Arabic", serif',
    preferredFontKeys: ['Scheherazade New'],
    fallbackFontKeys: ['Noto Sans Arabic'],
    resolvedFontKeys: ['Scheherazade New', 'Noto Sans Arabic', '系统默认'],
    fontPresets: [],
    coverageSummary: {
      confidence: 'sample-backed',
      exemplarCharacterCount: 3,
      exemplarSample: 'ا ب ت',
    },
    lineHeightScale: 1.3,
    isolateInlineRuns: true,
    preferDirAttribute: true,
    ...(orthography !== undefined ? { orthography } : {}),
    ...restOverrides,
  };
}

function createPicker(overrides?: Partial<UseOrthographyPickerResult>): UseOrthographyPickerResult {
  return {
    orthographies: [],
    isCreating: true,
    createMode: 'ipa',
    setCreateMode: vi.fn(),
    sourceLanguageId: '',
    setSourceLanguageId: vi.fn(),
    sourceCustomLanguageId: '',
    setSourceCustomLanguageId: vi.fn(),
    sourceOrthographies: [],
    sourceOrthographyId: '',
    setSourceOrthographyId: vi.fn(),
    draftNameZh: '阿拉伯语研究正字法',
    setDraftNameZh: vi.fn(),
    draftNameEn: 'Arabic Study Orthography',
    setDraftNameEn: vi.fn(),
    draftAbbreviation: 'ARA-STUDY',
    setDraftAbbreviation: vi.fn(),
    draftScriptTag: 'Arab',
    setDraftScriptTag: vi.fn(),
    draftType: 'practical',
    setDraftType: vi.fn(),
    showAdvancedFields: true,
    setShowAdvancedFields: vi.fn(),
    draftLocaleTag: 'ar',
    setDraftLocaleTag: vi.fn(),
    draftRegionTag: '',
    setDraftRegionTag: vi.fn(),
    draftVariantTag: '',
    setDraftVariantTag: vi.fn(),
    draftDirection: 'rtl',
    setDraftDirection: vi.fn(),
    draftExemplarMain: 'ا, ب, ت',
    setDraftExemplarMain: vi.fn(),
    draftPrimaryFonts: 'Scheherazade New',
    setDraftPrimaryFonts: vi.fn(),
    draftFallbackFonts: 'Noto Sans Arabic',
    setDraftFallbackFonts: vi.fn(),
    draftBidiIsolate: true,
    setDraftBidiIsolate: vi.fn(),
    draftPreferDirAttribute: true,
    setDraftPreferDirAttribute: vi.fn(),
    canConfigureBridge: false,
    bridgeEnabled: false,
    setBridgeEnabled: vi.fn(),
    draftBridgeEngine: 'table-map',
    setDraftBridgeEngine: vi.fn(),
    draftBridgeRuleText: '',
    setDraftBridgeRuleText: vi.fn(),
    draftBridgeSampleInput: '',
    setDraftBridgeSampleInput: vi.fn(),
    draftBridgeSampleCasesText: '',
    setDraftBridgeSampleCasesText: vi.fn(),
    draftBridgeIsReversible: false,
    setDraftBridgeIsReversible: vi.fn(),
    draftRenderPolicy: createRenderPolicy(),
    draftRenderPreviewText: 'ا ب ت',
    draftRenderWarnings: [],
    renderWarningsAcknowledged: false,
    requiresRenderWarningConfirmation: false,
    bridgePreviewOutput: '',
    bridgeValidationIssues: [],
    bridgeSampleCaseResults: [],
    error: '',
    submitting: false,
    handleSelectionChange: vi.fn(),
    cancelCreate: vi.fn(),
    acknowledgeRenderWarnings: vi.fn(),
    createOrthography: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderZh(ui: Parameters<typeof render>[0]) {
  return render(<LocaleProvider locale="zh-CN">{ui}</LocaleProvider>);
}

describe('OrthographyBuilderPanel', () => {
  it('renders draft render preview with coverage summary and bidi direction', async () => {
    const view = renderZh(
      <OrthographyBuilderPanel
        picker={createPicker()}
        languageOptions={[]}
      />,
    );

    const root = view.container.querySelector('.orthography-builder-panel-shell') as HTMLDivElement;

    expect(root).toBeTruthy();
    expect(root.querySelector('.dialog-header')).toBeTruthy();
    expect(screen.getByText('渲染预览')).toBeTruthy();
    expect(screen.getByText('正字法构建器')).toBeTruthy();
    expect(screen.getByText('脚本：Arab')).toBeTruthy();
    expect(screen.getByText('方向：RTL')).toBeTruthy();
    expect(screen.getByText('字体覆盖：样例 3 项')).toBeTruthy();
    expect(screen.getByText('最终字体栈：Scheherazade New -> Noto Sans Arabic -> 系统默认')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('默认字体验证：Scheherazade New · 已验证')).toBeTruthy();
    });

    const sample = screen.getByText('ا ب ت');
    expect(sample.getAttribute('dir')).toBe('rtl');
  });

  it('renders script-only coverage warning when exemplars are missing', () => {
    renderZh(
      <OrthographyBuilderPanel
        picker={createPicker({
          draftRenderPolicy: createRenderPolicy({
            scriptTag: 'Deva',
            direction: 'ltr',
            textDirection: 'ltr',
            defaultFontKey: 'Annapurna SIL',
            defaultFontCss: '"Annapurna SIL", "Noto Sans Devanagari", serif',
            preferredFontKeys: [],
            fallbackFontKeys: [],
            resolvedFontKeys: ['Annapurna SIL', 'Noto Sans Devanagari', '系统默认'],
            coverageSummary: {
              confidence: 'script-only',
              exemplarCharacterCount: 0,
              exemplarSample: '',
              warning: '未配置示例字符，当前仅提供脚本级字体推荐。',
            },
            isolateInlineRuns: false,
            preferDirAttribute: false,
          }),
          draftRenderPreviewText: 'कखग १२३',
        })}
        languageOptions={[]}
      />,
    );

    expect(screen.getByText('字体覆盖：未配置样例')).toBeTruthy();
    expect(screen.getByText('未配置示例字符，当前仅提供脚本级字体推荐。')).toBeTruthy();
    expect(screen.getByText('最终字体栈：Annapurna SIL -> Noto Sans Devanagari -> 系统默认')).toBeTruthy();

    const sample = screen.getByText('कखग १२३');
    expect(sample.getAttribute('dir')).toBeNull();
  });

  it('shows warning confirmation state before creation when render risks exist', () => {
    renderZh(
      <OrthographyBuilderPanel
        picker={createPicker({
          draftRenderWarnings: ['未配置示例字符，当前仅提供脚本级字体推荐。'],
          requiresRenderWarningConfirmation: true,
        })}
        languageOptions={[]}
      />,
    );

    expect(screen.getByText('创建风险提示')).toBeTruthy();
    expect(screen.getByText('首次点击创建将进入确认状态，再次点击才会按当前配置创建。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '先确认这些风险' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认风险并创建' })).toBeTruthy();
  });

  it('shows missing-glyph status for draft default font when runtime verification fails', async () => {
    renderZh(
      <OrthographyBuilderPanel
        picker={createPicker({
          draftRenderPolicy: createRenderPolicy({
            defaultFontKey: 'Missing Arabic',
            defaultFontCss: '"Missing Arabic", "Noto Sans Arabic", serif',
            resolvedFontKeys: ['Missing Arabic', 'Noto Sans Arabic', '系统默认'],
          }),
        })}
        languageOptions={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('默认字体验证：Missing Arabic · 缺字')).toBeTruthy();
    });
  });

  it('shows shaping-risk for verified custom complex-script fonts in draft preview', async () => {
    renderZh(
      <OrthographyBuilderPanel
        picker={createPicker({
          draftPrimaryFonts: 'Experimental Arabic',
          draftRenderPolicy: createRenderPolicy({
            defaultFontKey: 'Experimental Arabic',
            defaultFontCss: '"Experimental Arabic", "Noto Sans Arabic", serif',
            preferredFontKeys: ['Experimental Arabic'],
            resolvedFontKeys: ['Experimental Arabic', 'Noto Sans Arabic', '系统默认'],
          }),
        })}
        languageOptions={[]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('默认字体验证：Experimental Arabic · 高风险')).toBeTruthy();
    });
  });

  it('keeps compact fields accessible by role and name', () => {
    renderZh(
      <OrthographyBuilderPanel
        compact
        picker={createPicker({
          createMode: 'derive-other',
          sourceLanguageId: 'eng',
          sourceOrthographies: [
            {
              id: 'ortho-eng',
              languageId: 'eng',
              name: { zho: '英语方案', eng: 'English Orthography' },
              abbreviation: 'ENG',
              scriptTag: 'Latn',
              type: 'practical',
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          ],
          canConfigureBridge: true,
          bridgeEnabled: true,
        })}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    expect(screen.getByRole('combobox', { name: '创建方式' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '来源语言' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '来源语言代码' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '来源正字法' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '本族语名称' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '文本方向' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '文字标签' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '桥接引擎' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '桥接规则文本' })).toBeTruthy();
  });

  it('renders lightweight context notes when provided', () => {
    renderZh(
      <OrthographyBuilderPanel
        picker={createPicker({})}
        languageOptions={[]}
        contextLines={['新建项目', '项目主语言：英语 English']}
      />,
    );

    expect(screen.getByText('当前创建场景')).toBeTruthy();
    expect(screen.getByText('项目主语言：英语 English')).toBeTruthy();
  });

  it('shows grouped source orthography options and icu syntax hints', () => {
    const view = renderZh(
      <OrthographyBuilderPanel
        compact
        picker={createPicker({
          createMode: 'derive-other',
          sourceLanguageId: 'eng',
          canConfigureBridge: true,
          bridgeEnabled: true,
          draftBridgeEngine: 'icu-rule',
          sourceOrthographies: [
            {
              id: 'user-orth',
              languageId: 'eng',
              name: { eng: 'User Orthography' },
              scriptTag: 'Latn',
              type: 'practical',
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:00:00.000Z',
              catalogMetadata: { catalogSource: 'user' },
            },
            {
              id: 'reviewed-orth',
              languageId: 'eng',
              name: { eng: 'Reviewed Orthography' },
              scriptTag: 'Latn',
              type: 'practical',
              createdAt: '2026-04-04T00:00:00.000Z',
              updatedAt: '2026-04-04T00:00:00.000Z',
              catalogMetadata: { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-primary', priority: 'primary' },
            },
          ],
        })}
        languageOptions={[]}
      />,
    );

    expect(view.container.querySelector('optgroup[label="自建正字法"]')).toBeTruthy();
    expect(view.container.querySelector('optgroup[label="已审校主项"]')).toBeTruthy();
    expect(screen.getByText(/语法提示/)).toBeTruthy();
    expect(screen.getByText(/ICU 规则按行链式执行/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: '桥接样例' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '添加创建前自检样例' }));
    expect(screen.getByRole('textbox', { name: '桥接样例' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: '桥接规则文本' }).getAttribute('placeholder')).toContain('::NFC');
  });

  it('renders a resolved source language code with its locale-first display label', async () => {
    renderZh(
      <OrthographyBuilderPanel
        picker={createPicker({
          createMode: 'derive-other',
          sourceLanguageId: 'eng',
        })}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    const sourceLanguageNameInput = screen.getByRole('combobox', { name: '来源语言' }) as HTMLInputElement;
    const sourceLanguageCodeInput = screen.getByRole('textbox', { name: '来源语言代码' }) as HTMLInputElement;

    await waitFor(() => {
      expect(sourceLanguageCodeInput.value).toBe('eng');
      expect(sourceLanguageNameInput.value).toBe('英语 · English');
    });
  });
});
