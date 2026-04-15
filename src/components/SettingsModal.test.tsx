// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal, type SettingsModalProps } from './SettingsModal';

// Mock ModalPanel / PanelSection — render children directly
vi.mock('./ui', () => ({
  ModalPanel: ({ isOpen, children, title }: { isOpen: boolean; children: React.ReactNode; title?: string }) =>
    isOpen ? <div data-testid="modal">{title && <h2>{title}</h2>}{children}</div> : null,
  PanelSection: ({ children, title }: { children: React.ReactNode; title?: string }) =>
    <section><h3>{title}</h3>{children}</section>,
}));

// Mock AI settings storage (async crypto)
vi.mock('../ai/config/aiChatSettingsStorage', () => ({
  loadAiChatSettingsFromStorage: vi.fn(async () => ({
    providerKind: 'mock',
    baseUrl: '',
    model: '',
    apiKey: '',
    apiKeysByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '',
    authHeaderName: '',
    authScheme: 'Bearer',
    responseFormat: 'openai',
  })),
  persistAiChatSettings: vi.fn(async () => {}),
}));

// Mock provider catalog — minimal definitions
vi.mock('../ai/providers/providerCatalog', () => ({
  aiChatProviderDefinitions: [
    { kind: 'mock', label: 'Mock', description: 'Local mock', fields: [] },
    { kind: 'deepseek', label: 'DeepSeek', description: 'DeepSeek API', fields: [
      { key: 'baseUrl', label: 'Base URL', type: 'text', placeholder: 'https://...', required: true },
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...', required: true },
    ] },
  ],
  normalizeAiChatSettings: vi.fn((raw: Record<string, unknown> = {}) => ({
    providerKind: 'mock',
    baseUrl: '',
    model: '',
    apiKey: '',
    apiKeysByProvider: {},
    toolFeedbackStyle: 'detailed',
    endpointUrl: '',
    authHeaderName: '',
    authScheme: 'Bearer',
    responseFormat: 'openai',
    ...raw,
  })),
}));

// Mock KeybindingService — keep minimal
const mockOverrides = new Map<string, string>();
vi.mock('../services/KeybindingService', () => ({
  DEFAULT_KEYBINDINGS: [
    { id: 'playPause', label: '播放/暂停', defaultKey: 'space', scope: 'waveform', category: 'playback' },
    { id: 'undo', label: '撤销', defaultKey: 'mod+z', scope: 'global', category: 'editing' },
  ],
  formatKeyComboForDisplay: (combo: string) => combo.toUpperCase(),
  loadUserOverrides: () => new Map(mockOverrides),
  saveUserOverride: vi.fn((id: string, combo: string) => { mockOverrides.set(id, combo); }),
  removeUserOverride: vi.fn((id: string) => { mockOverrides.delete(id); }),
  resetUserOverrides: vi.fn(() => { mockOverrides.clear(); }),
}));

function renderModal(overrides: Partial<SettingsModalProps> = {}) {
  const props: SettingsModalProps = {
    isOpen: true,
    onClose: vi.fn(),
    locale: 'zh-CN',
    themeMode: 'system',
    onThemeChange: vi.fn(),
    onLocaleChange: vi.fn(),
    fontScale: 1,
    fontScaleMode: 'auto',
    onFontScaleChange: vi.fn(),
    onFontScaleModeChange: vi.fn(),
    iconEffect: 'material',
    onIconEffectChange: vi.fn(),
    version: '0.1.0',
    ...overrides,
  };
  return render(<SettingsModal {...props} />);
}

beforeEach(() => {
  mockOverrides.clear();
  localStorage.clear();
  document.documentElement.classList.remove('jieyu-reduced-motion', 'jieyu-high-contrast');
});

afterEach(cleanup);

// ── 外观标签 | Appearance tab ──────────────────────────────

describe('Appearance tab', () => {
  it('renders icon effect toggle (Material vs motion)', () => {
    renderModal();
    expect(screen.getByText('图标效果')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Material（默认）' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '动效增强' })).toBeTruthy();
  });

  it('renders theme and font-scale settings', () => {
    renderModal();
    expect(screen.getByText('主题')).toBeTruthy();
    expect(screen.getByText('字体缩放')).toBeTruthy();
  });

  it('calls onThemeChange when clicking theme option', () => {
    const onThemeChange = vi.fn();
    renderModal({ onThemeChange });
    fireEvent.click(screen.getByText('浅色'));
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });

  it('calls onFontScaleModeChange when toggling font mode', () => {
    const onFontScaleModeChange = vi.fn();
    renderModal({ fontScaleMode: 'manual', onFontScaleModeChange });
    fireEvent.click(screen.getByRole('button', { name: '自动' }));
    expect(onFontScaleModeChange).toHaveBeenCalledWith('auto');
  });

  it('renders section title above section body', () => {
    renderModal();
    const section = screen.getByLabelText('主题');
    const first = section.firstElementChild as HTMLElement | null;
    const second = section.children.item(1) as HTMLElement | null;

    expect(first?.className).toContain('settings-section-rail');
    expect(second?.className).toContain('settings-section-body');

    const titleText = section.querySelector('.settings-section-title-text');
    expect(titleText?.textContent).toBe('主题');
  });
});

describe('Language tab', () => {
  it('renders locale options', () => {
    renderModal();
    fireEvent.click(screen.getByRole('tab', { name: '语言' }));
    expect(screen.getByText('界面语言')).toBeTruthy();
  });

  it('calls onLocaleChange when clicking locale option', () => {
    const onLocaleChange = vi.fn();
    renderModal({ onLocaleChange });
    fireEvent.click(screen.getByRole('tab', { name: '语言' }));
    fireEvent.click(screen.getByText('English'));
    expect(onLocaleChange).toHaveBeenCalledWith('en-US');
  });
});

// ── 快捷键标签 | Shortcuts tab ─────────────────────────────

describe('Shortcuts tab', () => {
  it('shows keybinding entries grouped by category', () => {
    renderModal();
    fireEvent.click(screen.getByText('快捷键'));
    expect(screen.getByText('SPACE')).toBeTruthy();
    expect(screen.getByText('播放/暂停')).toBeTruthy();
    expect(screen.getByText('MOD+Z')).toBeTruthy();
  });

  it('enters editing mode on kbd click and cancels with Escape', () => {
    renderModal();
    fireEvent.click(screen.getByText('快捷键'));
    const kbd = screen.getByText('SPACE');
    fireEvent.click(kbd);
    expect(screen.getByText(/请按下快捷键/)).toBeTruthy();

    // Escape cancels
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/请按下快捷键/)).toBeNull();
  });

  it('shows "全部恢复默认" when there are overrides', async () => {
    mockOverrides.set('playPause', 'p');
    renderModal();
    fireEvent.click(screen.getByText('快捷键'));
    expect(screen.getByText('全部恢复默认')).toBeTruthy();
  });
});

// ── AI 标签 | AI tab ───────────────────────────────────────

describe('AI tab', () => {
  it('stops shortcut capture after leaving shortcuts tab', async () => {
    renderModal();
    fireEvent.click(screen.getByText('快捷键'));
    fireEvent.click(screen.getByText('SPACE'));
    expect(screen.getByText(/请按下快捷键/)).toBeTruthy();

    fireEvent.click(screen.getByText('AI'));
    await waitFor(() => expect(screen.queryByText(/请按下快捷键/)).toBeNull());

    const keydown = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    const notCanceled = document.dispatchEvent(keydown);
    expect(notCanceled).toBe(true);
    expect(keydown.defaultPrevented).toBe(false);
  });

  it('loads AI settings and renders provider select', async () => {
    renderModal();
    fireEvent.click(screen.getByText('AI'));
    await waitFor(() => expect(screen.getByText('AI 服务商')).toBeTruthy());
    // Provider select is rendered with options
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('mock');
  });

  it('persists embedding defaults and acoustic runtime defaults', async () => {
    renderModal();
    fireEvent.click(screen.getByText('AI'));

    await waitFor(() => expect(screen.getByText('Embedding 默认值')).toBeTruthy());

    const embeddingRow = screen.getByText('Embedding 服务商').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(embeddingRow).getByRole('button', { name: 'MiniMax' }));
    expect(localStorage.getItem('jieyu.embeddingProvider')).toContain('"kind":"minimax"');

    fireEvent.change(screen.getByDisplayValue('10000'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: '保存声学默认值' }));
    expect(localStorage.getItem('jieyu.acoustic.external.timeoutMs')).toBe('15000');
  });
});

// ── 播放标签 | Playback tab ────────────────────────────────

describe('Playback tab', () => {
  it('renders default playback rate options', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));
    expect(screen.getByText('1×')).toBeTruthy();
    expect(screen.getByText('0.5×')).toBeTruthy();
    expect(screen.getByText('2×')).toBeTruthy();
  });

  it('persists selected rate to localStorage', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));
    fireEvent.click(screen.getByText('1.5×'));
    expect(localStorage.getItem('jieyu:default-playback-rate')).toBe('1.5');
  });

  it('persists workflow defaults to localStorage', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));

    const autoFollowRow = screen.getByText('自动跟随选中语段').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(autoFollowRow).getByRole('button', { name: '关闭' }));
    expect(localStorage.getItem('jieyu:workspace-auto-scroll-enabled')).toBe('0');

    const snapRow = screen.getByText('吸附到零交叉').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(snapRow).getByRole('button', { name: '开启' }));
    expect(localStorage.getItem('jieyu:workspace-snap-enabled')).toBe('1');

    const zoomModeRow = screen.getByText('默认缩放模式').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(zoomModeRow).getByRole('button', { name: '适应选区' }));
    expect(localStorage.getItem('jieyu:workspace-default-zoom-mode')).toBe('fit-selection');
  });

  it('persists selection and edit defaults to localStorage', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));

    const doubleClickRow = screen.getByText('波形双击行为').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(doubleClickRow).getByRole('button', { name: '按双击区间创建语段' }));
    expect(localStorage.getItem('jieyu:waveform-double-click-action')).toBe('create-segment');

    const newSegmentSelectionRow = screen.getByText('新建后选中行为').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(newSegmentSelectionRow).getByRole('button', { name: '保持当前选中' }));
    expect(localStorage.getItem('jieyu:new-segment-selection-behavior')).toBe('keep-current');
  });

  it('persists waveform display defaults to localStorage', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));

    const displayModeRow = screen.getByText('波形显示模式').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(displayModeRow).getByRole('button', { name: '频谱' }));
    expect(localStorage.getItem('jieyu:waveform-display-mode')).toBe('spectrogram');

    fireEvent.change(screen.getByLabelText('默认波形高度'), { target: { value: '240' } });
    expect(localStorage.getItem('jieyu:waveform-height')).toBe('240');
  });

  it('persists advanced waveform defaults to localStorage', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));

    fireEvent.change(screen.getByLabelText('默认振幅倍率'), { target: { value: '1.75' } });
    expect(localStorage.getItem('jieyu:amplitude-scale')).toBe('1.75');

    const visualStyleRow = screen.getByText('默认视觉样式').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(visualStyleRow).getByRole('button', { name: 'Praat' }));
    expect(localStorage.getItem('jieyu:waveform-visual-style')).toBe('praat');

    const overlayRow = screen.getByText('默认声学叠加').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(overlayRow).getByRole('button', { name: '基频 + 强度' }));
    expect(localStorage.getItem('jieyu:acoustic-overlay-mode')).toBe('both');
  });

  it('persists video layout defaults to localStorage', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));

    const layoutRow = screen.getByText('视频布局模式').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(layoutRow).getByRole('button', { name: '左侧' }));
    expect(localStorage.getItem('jieyu:video-layout-mode')).toBe('left');

    fireEvent.change(screen.getByLabelText('视频预览高度'), { target: { value: '320' } });
    expect(localStorage.getItem('jieyu:video-preview-height')).toBe('320');

    fireEvent.change(screen.getByLabelText('右侧面板宽度'), { target: { value: '520' } });
    expect(localStorage.getItem('jieyu:video-right-panel-width')).toBe('520');
  });

  it('applies accessibility toggles to html class and localStorage', () => {
    renderModal();
    fireEvent.click(screen.getByText('播放'));

    const reducedMotionRow = screen.getByText('减少动态效果').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(reducedMotionRow).getByRole('button', { name: '开启' }));
    expect(document.documentElement.classList.contains('jieyu-reduced-motion')).toBe(true);
    expect(localStorage.getItem('jieyu:accessibility-reduced-motion')).toBe('1');

    const highContrastRow = screen.getByText('增强对比度').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(highContrastRow).getByRole('button', { name: '开启' }));
    expect(document.documentElement.classList.contains('jieyu-high-contrast')).toBe(true);
    expect(localStorage.getItem('jieyu:accessibility-high-contrast')).toBe('1');
  });
});

// ── 数据标签 | Data tab ────────────────────────────────────

describe('Data tab', () => {
  it('shows cache entries with clear buttons', () => {
    renderModal();
    fireEvent.click(screen.getByText('数据'));
    expect(screen.getByText('字体覆盖缓存')).toBeTruthy();
    expect(screen.getByText('VAD 缓存')).toBeTruthy();
    expect(screen.getAllByText('清除').length).toBeGreaterThanOrEqual(2);
  });

  it('clears a specific cache and shows "已清除"', () => {
    localStorage.setItem('jieyu:font-coverage-cache:v2', 'data');
    renderModal();
    fireEvent.click(screen.getByText('数据'));
    const clearBtns = screen.getAllByText('清除');
    fireEvent.click(clearBtns[0]!);
    expect(screen.getByText('已清除')).toBeTruthy();
    expect(localStorage.getItem('jieyu:font-coverage-cache:v2')).toBeNull();
  });

  it('shows storage usage estimate', () => {
    renderModal();
    fireEvent.click(screen.getByText('数据'));
    expect(screen.getByText('本地存储用量')).toBeTruthy();
  });

  it('persists map defaults and resets voice dock position', () => {
    localStorage.setItem('jieyu.voiceDock.pos', JSON.stringify({ right: 20, bottom: 20 }));
    renderModal();
    fireEvent.click(screen.getByText('数据'));

    const mapProviderRow = screen.getByText('地图服务商默认值').closest('.settings-row') as HTMLElement;
    fireEvent.click(within(mapProviderRow).getByRole('button', { name: 'MapTiler' }));
    expect(localStorage.getItem('jieyu:map-provider')).toContain('"kind":"maptiler"');

    fireEvent.click(screen.getByRole('button', { name: '重置位置' }));
    expect(localStorage.getItem('jieyu.voiceDock.pos')).toBeNull();
  });
});

// ── 关于标签 | About tab ───────────────────────────────────

describe('About tab', () => {
  it('shows version and description', () => {
    renderModal({ version: '1.2.3' });
    fireEvent.click(screen.getByText('关于'));
    expect(screen.getByText('Jieyu')).toBeTruthy();
    expect(screen.getByText('1.2.3')).toBeTruthy();
  });
});

// ── 标签切换 | Tab switching ───────────────────────────────

describe('Tab switching', () => {
  it('switches between all 7 tabs', () => {
    renderModal();
    const tabLabels = ['外观', '语言', '快捷键', 'AI', '播放', '数据', '关于'];
    for (const label of tabLabels) {
      fireEvent.click(screen.getByRole('tab', { name: label }));
    }
    // After clicking "关于", the about section should be visible
    expect(screen.getByText('Jieyu')).toBeTruthy();
  });
});
