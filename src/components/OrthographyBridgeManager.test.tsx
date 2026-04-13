// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType, OrthographyBridgeDocType } from '../db';
import { OrthographyBridgeManager } from './OrthographyBridgeManager';
import { SidePaneActionModal } from './SidePaneActionModal';
import { renderWithLocale } from '../test/localeTestUtils';

const NOW = '2026-03-31T00:00:00.000Z';

const {
  mockListOrthographyBridges,
  mockCreateOrthographyBridge,
  mockUpdateOrthographyBridge,
  mockDeleteOrthographyBridge,
  mockListBuiltInOrthographiesByIds,
  mockUseOrthographies,
  mockGetDb,
  mockBulkGet,
} = vi.hoisted(() => ({
  mockListOrthographyBridges: vi.fn(),
  mockCreateOrthographyBridge: vi.fn(),
  mockUpdateOrthographyBridge: vi.fn(),
  mockDeleteOrthographyBridge: vi.fn(),
  mockListBuiltInOrthographiesByIds: vi.fn(),
  mockUseOrthographies: vi.fn(),
  mockGetDb: vi.fn(),
  mockBulkGet: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    listLanguageCatalogEntries: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/LinguisticService.orthography', () => ({
  listOrthographyBridgeRecords: mockListOrthographyBridges,
  createOrthographyBridgeRecord: mockCreateOrthographyBridge,
  updateOrthographyBridgeRecord: mockUpdateOrthographyBridge,
  deleteOrthographyBridgeRecord: mockDeleteOrthographyBridge,
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

vi.mock('../data/builtInOrthographies', () => ({
  listBuiltInOrthographiesByIds: mockListBuiltInOrthographiesByIds,
}));

vi.mock('../db', async () => {
  const actual = await vi.importActual('../db');
  return {
    ...actual,
    getDb: mockGetDb,
  };
});

const targetOrthography: OrthographyDocType = {
  id: 'orth-target',
  languageId: 'cmn',
  name: { zho: '目标正字法' },
  scriptTag: 'Latn',
  type: 'practical',
  catalogMetadata: { catalogSource: 'built-in-reviewed', reviewStatus: 'verified-primary', priority: 'primary' },
  createdAt: NOW,
  updatedAt: NOW,
};

const sourceOrthography: OrthographyDocType = {
  id: 'orth-source',
  languageId: 'eng',
  name: { eng: 'Source Orthography' },
  scriptTag: 'Latn',
  type: 'practical',
  createdAt: NOW,
  updatedAt: NOW,
};

const builtInSourceOrthography: OrthographyDocType = {
  id: 'eng-latn',
  languageId: 'eng',
  name: { eng: 'English Standard Orthography' },
  scriptTag: 'Latn',
  type: 'practical',
  createdAt: NOW,
  updatedAt: NOW,
};

function KeepMountedBridgeModalHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        打开桥接面板
      </button>
      <SidePaneActionModal
        ariaLabel="正字法写入桥接规则"
        closeLabel="关闭"
        onClose={() => setOpen(false)}
        open={open}
        keepMounted
        widthPreset="wide"
      >
        <OrthographyBridgeManager
          targetOrthography={targetOrthography}
          languageOptions={[{ code: 'eng', label: '英语 English' }]}
          compact
          initialExpanded
          hideToggleButton
        />
      </SidePaneActionModal>
    </>
  );
}

describe('OrthographyBridgeManager', () => {
  beforeEach(() => {
    mockListOrthographyBridges.mockReset();
    mockCreateOrthographyBridge.mockReset();
    mockUpdateOrthographyBridge.mockReset();
    mockDeleteOrthographyBridge.mockReset();
    mockListBuiltInOrthographiesByIds.mockReset();
    mockUseOrthographies.mockReset();
    mockGetDb.mockReset();
    mockBulkGet.mockReset();

    // 模拟 window.confirm 总是返回 true | Mock window.confirm to always return true
    vi.stubGlobal('confirm', vi.fn(() => true));

    mockListOrthographyBridges.mockResolvedValue([] as OrthographyBridgeDocType[]);
    mockBulkGet.mockResolvedValue([]);
    mockListBuiltInOrthographiesByIds.mockResolvedValue([]);
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) return [sourceOrthography];
      return [];
    });
    mockGetDb.mockResolvedValue({
      dexie: {
        orthographies: {
          bulkGet: mockBulkGet,
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a new inbound bridge for the selected orthography', async () => {
    renderWithLocale(
      <OrthographyBridgeManager
        targetOrthography={targetOrthography}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '管理写入桥接规则' }));
    await screen.findByText('当前正字法尚未配置入站桥接规则，导入或自动写入时会保留原文本。');
    expect(Array.from(document.querySelectorAll('.panel-chip')).some((node) => node.textContent === '已审校主项')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '新建规则' }));
    const bridgeCodeInput1 = screen.getByRole('textbox', { name: /语言代码|Source language code/i });
    fireEvent.change(bridgeCodeInput1, { target: { value: 'eng' } });
    fireEvent.blur(bridgeCodeInput1);

    await waitFor(() => {
      const select = screen.getByLabelText('来源正字法') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByLabelText('来源正字法'), { target: { value: 'orth-source' } });
    fireEvent.change(screen.getByPlaceholderText('每行一条映射，如 aa => a'), { target: { value: 'sh => s' } });
    fireEvent.change(screen.getByPlaceholderText('输入一段样例文本预览桥接结果'), { target: { value: 'sha' } });
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));

    await waitFor(() => {
      expect(mockCreateOrthographyBridge).toHaveBeenCalledWith(expect.objectContaining({
        sourceOrthographyId: 'orth-source',
        targetOrthographyId: 'orth-target',
        engine: 'table-map',
        status: 'draft',
      }));
    });
  });

  it('lists existing inbound bridges and supports toggling status and deleting', async () => {
    mockListOrthographyBridges.mockResolvedValue([
      {
        id: 'orthxfm-1',
        sourceOrthographyId: 'orth-source',
        targetOrthographyId: 'orth-target',
        name: { zho: '导入规则' },
        engine: 'table-map',
        rules: { mappings: [{ from: 'sh', to: 's' }] },
        sampleInput: 'sha',
        sampleOutput: 'sa',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] satisfies OrthographyBridgeDocType[]);
    mockBulkGet.mockResolvedValue([sourceOrthography]);

    renderWithLocale(
      <OrthographyBridgeManager
        targetOrthography={targetOrthography}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '管理写入桥接规则' }));

    await screen.findByText('Source Orthography · Latn · practical -> 目标正字法 · Latn · practical');

    fireEvent.click(screen.getByRole('button', { name: '设为草稿' }));
    await waitFor(() => {
      expect(mockUpdateOrthographyBridge).toHaveBeenCalledWith({
        id: 'orthxfm-1',
        status: 'draft',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '删除规则' }));
    // window.confirm 被 vi.stubGlobal 模拟为 true | window.confirm mocked to true
    await waitFor(() => {
      expect(mockDeleteOrthographyBridge).toHaveBeenCalledWith('orthxfm-1');
    });
  });

  it('can clear an existing bridge name while keeping the rule', async () => {
    mockListOrthographyBridges.mockResolvedValue([
      {
        id: 'orthxfm-clear-name',
        sourceOrthographyId: 'orth-source',
        targetOrthographyId: 'orth-target',
        name: { und: 'Primary name', eng: 'English name' },
        engine: 'table-map',
        rules: { mappings: [{ from: 'sh', to: 's' }] },
        status: 'draft',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] satisfies OrthographyBridgeDocType[]);
    mockBulkGet.mockResolvedValue([sourceOrthography]);

    renderWithLocale(
      <OrthographyBridgeManager
        targetOrthography={targetOrthography}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '管理写入桥接规则' }));
    await screen.findByText('Source Orthography · Latn · practical -> 目标正字法 · Latn · practical');

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('规则本地名称'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('规则英文回退名'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));

    await waitFor(() => {
      expect(mockUpdateOrthographyBridge).toHaveBeenCalledWith(expect.objectContaining({
        id: 'orthxfm-clear-name',
        name: null,
      }));
    });
  });

  it('preserves draft editing context when the bridge modal closes and reopens', async () => {
    renderWithLocale(<KeepMountedBridgeModalHarness />);

    fireEvent.click(screen.getByRole('button', { name: '打开桥接面板' }));
    await screen.findByRole('dialog', { name: '正字法写入桥接规则' });

    fireEvent.click(screen.getByRole('button', { name: '新建规则' }));
    const bridgeCodeInput2 = screen.getByRole('textbox', { name: /语言代码|Source language code/i });
    fireEvent.change(bridgeCodeInput2, { target: { value: 'eng' } });
    fireEvent.blur(bridgeCodeInput2);

    await waitFor(() => {
      const select = screen.getByLabelText('来源正字法') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByLabelText('来源正字法'), { target: { value: 'orth-source' } });
    fireEvent.change(screen.getByPlaceholderText('每行一条映射，如 aa => a'), { target: { value: 'sh => s' } });
    fireEvent.change(screen.getByPlaceholderText('输入一段样例文本预览桥接结果'), { target: { value: 'sha' } });

    fireEvent.click(screen.getByRole('button', { name: '正字法写入桥接规则 关闭' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '正字法写入桥接规则' })).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: '打开桥接面板' }));
    await screen.findByRole('dialog', { name: '正字法写入桥接规则' });

    expect(screen.getByDisplayValue('sh => s')).toBeTruthy();
    expect(screen.getByDisplayValue('sha')).toBeTruthy();
    expect((screen.getByLabelText('来源正字法') as HTMLSelectElement).value).toBe('orth-source');
  });

  it('can edit a bridge whose source orthography comes from built-in catalog', async () => {
    mockListOrthographyBridges.mockResolvedValue([
      {
        id: 'orthxfm-built-in',
        sourceOrthographyId: 'eng-latn',
        targetOrthographyId: 'orth-target',
        engine: 'table-map',
        rules: { mappings: [{ from: 'th', to: 't' }] },
        status: 'draft',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ] satisfies OrthographyBridgeDocType[]);
    mockBulkGet.mockResolvedValue([]);
    mockListBuiltInOrthographiesByIds.mockResolvedValue([builtInSourceOrthography]);
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) return [builtInSourceOrthography];
      return [];
    });

    renderWithLocale(
      <OrthographyBridgeManager
        targetOrthography={targetOrthography}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '管理写入桥接规则' }));
    await screen.findByText('English Standard Orthography · Latn · practical -> 目标正字法 · Latn · practical');

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    await waitFor(() => {
      expect((screen.getByLabelText('来源正字法') as HTMLSelectElement).value).toBe('eng-latn');
    });

    fireEvent.change(screen.getByPlaceholderText('每行一条映射，如 aa => a'), { target: { value: 'th => θ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));

    await waitFor(() => {
      expect(mockUpdateOrthographyBridge).toHaveBeenCalledWith(expect.objectContaining({
        id: 'orthxfm-built-in',
        sourceOrthographyId: 'eng-latn',
        targetOrthographyId: 'orth-target',
      }));
    });
  });

  it('clears loading state in always-expanded workspace mode', async () => {
    renderWithLocale(
      <OrthographyBridgeManager
        targetOrthography={targetOrthography}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
        compact
        initialExpanded
        hideToggleButton
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('正在加载桥接规则…')).toBeNull();
    });

    expect(screen.getByText('当前正字法尚未配置入站桥接规则，导入或自动写入时会保留原文本。')).toBeTruthy();
  });
});
