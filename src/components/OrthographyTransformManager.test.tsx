// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType, OrthographyTransformDocType } from '../db';
import { OrthographyTransformManager } from './OrthographyTransformManager';

const NOW = '2026-03-31T00:00:00.000Z';

const {
  mockListOrthographyTransforms,
  mockCreateOrthographyTransform,
  mockUpdateOrthographyTransform,
  mockDeleteOrthographyTransform,
  mockUseOrthographies,
  mockGetDb,
  mockBulkGet,
} = vi.hoisted(() => ({
  mockListOrthographyTransforms: vi.fn(),
  mockCreateOrthographyTransform: vi.fn(),
  mockUpdateOrthographyTransform: vi.fn(),
  mockDeleteOrthographyTransform: vi.fn(),
  mockUseOrthographies: vi.fn(),
  mockGetDb: vi.fn(),
  mockBulkGet: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    listOrthographyTransforms: mockListOrthographyTransforms,
    createOrthographyTransform: mockCreateOrthographyTransform,
    updateOrthographyTransform: mockUpdateOrthographyTransform,
    deleteOrthographyTransform: mockDeleteOrthographyTransform,
  },
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
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

describe('OrthographyTransformManager', () => {
  beforeEach(() => {
    mockListOrthographyTransforms.mockReset();
    mockCreateOrthographyTransform.mockReset();
    mockUpdateOrthographyTransform.mockReset();
    mockDeleteOrthographyTransform.mockReset();
    mockUseOrthographies.mockReset();
    mockGetDb.mockReset();
    mockBulkGet.mockReset();

    mockListOrthographyTransforms.mockResolvedValue([] as OrthographyTransformDocType[]);
    mockBulkGet.mockResolvedValue([]);
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

  it('creates a new inbound transform for the selected orthography', async () => {
    render(
      <OrthographyTransformManager
        targetOrthography={targetOrthography}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '管理导入变换规则' }));
    await screen.findByText('当前正字法尚未配置入站 transform，导入时会保留原文本。');

    fireEvent.click(screen.getByRole('button', { name: '新建规则' }));
    fireEvent.change(screen.getByLabelText('来源语言'), { target: { value: 'eng' } });

    await waitFor(() => {
      const select = screen.getByLabelText('来源正字法') as HTMLSelectElement;
      expect(select.options.length).toBeGreaterThan(1);
    });

    fireEvent.change(screen.getByLabelText('来源正字法'), { target: { value: 'orth-source' } });
    fireEvent.change(screen.getByPlaceholderText('每行一条映射，如 aa -> a'), { target: { value: 'sh => s' } });
    fireEvent.change(screen.getByPlaceholderText('输入一段样例文本预览转换结果'), { target: { value: 'sha' } });
    fireEvent.click(screen.getByRole('button', { name: '保存规则' }));

    await waitFor(() => {
      expect(mockCreateOrthographyTransform).toHaveBeenCalledWith(expect.objectContaining({
        sourceOrthographyId: 'orth-source',
        targetOrthographyId: 'orth-target',
        engine: 'table-map',
        status: 'draft',
      }));
    });
  });

  it('lists existing inbound transforms and supports toggling status and deleting', async () => {
    mockListOrthographyTransforms.mockResolvedValue([
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
    ] satisfies OrthographyTransformDocType[]);
    mockBulkGet.mockResolvedValue([sourceOrthography]);

    render(
      <OrthographyTransformManager
        targetOrthography={targetOrthography}
        languageOptions={[{ code: 'eng', label: '英语 English' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '管理导入变换规则' }));

    await screen.findByText('Source Orthography · Latn · practical -> 目标正字法 · Latn · practical');

    fireEvent.click(screen.getByRole('button', { name: '设为草稿' }));
    await waitFor(() => {
      expect(mockUpdateOrthographyTransform).toHaveBeenCalledWith({
        id: 'orthxfm-1',
        status: 'draft',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: '删除规则' }));
    await waitFor(() => {
      expect(mockDeleteOrthographyTransform).toHaveBeenCalledWith('orthxfm-1');
    });
  });
});