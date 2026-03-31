// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LayerActionPopover } from './LayerActionPopover';

const NOW = '2025-01-01T00:00:00.000Z';

const { mockCreateOrthography, mockCloneOrthographyToLanguage, mockCreateOrthographyTransform, mockUseOrthographies } = vi.hoisted(() => ({
  mockCreateOrthography: vi.fn(),
  mockCloneOrthographyToLanguage: vi.fn(),
  mockCreateOrthographyTransform: vi.fn(),
  mockUseOrthographies: vi.fn(),
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    createOrthography: mockCreateOrthography,
    cloneOrthographyToLanguage: mockCloneOrthographyToLanguage,
    createOrthographyTransform: mockCreateOrthographyTransform,
  },
}));

vi.mock('../hooks/useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

describe('LayerActionPopover orthography creation', () => {
  afterEach(() => {
    cleanup();
    mockCreateOrthography.mockReset();
    mockCloneOrthographyToLanguage.mockReset();
    mockCreateOrthographyTransform.mockReset();
    mockUseOrthographies.mockReset();
  });

  it('derives a new current-language orthography from another language before layer creation', async () => {
    mockUseOrthographies.mockImplementation((languageIds: string[]) => {
      if (languageIds.includes('eng')) {
        return [{
          id: 'orth_eng_base',
          name: { eng: 'English Practical' },
          languageId: 'eng',
          abbreviation: 'ENG-PRAC',
          scriptTag: 'Latn',
          type: 'practical',
          createdAt: NOW,
          updatedAt: NOW,
        }];
      }
      return [];
    });
    mockCloneOrthographyToLanguage.mockResolvedValue({
      id: 'orth_cmn_derived',
      name: { eng: 'English Practical' },
      languageId: 'cmn',
      abbreviation: 'ENG-PRAC',
      scriptTag: 'Latn',
      type: 'practical',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const createLayer = vi.fn(async () => true);
    const onClose = vi.fn();

    render(
      <LayerActionPopover
        action="create-transcription"
        layerId={undefined}
        deletableLayers={[]}
        createLayer={createLayer}
        deleteLayer={vi.fn(async () => undefined)}
        onClose={onClose}
      />,
    );

    fireEvent.change(document.body.querySelectorAll('select')[0] as HTMLSelectElement, {
      target: { value: 'cmn' },
    });

    await waitFor(() => {
      expect(document.body.querySelectorAll('select').length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.change(document.body.querySelectorAll('select')[1] as HTMLSelectElement, {
      target: { value: '__create_new_orthography__' },
    });

    fireEvent.change(await screen.findByDisplayValue('基于 IPA 创建'), {
      target: { value: 'derive-other' },
    });

    await waitFor(() => {
      expect(document.body.querySelectorAll('select').length).toBeGreaterThanOrEqual(4);
    });

    fireEvent.change(document.body.querySelectorAll('select')[3] as HTMLSelectElement, {
      target: { value: 'eng' },
    });

    await waitFor(() => {
      const selects = document.body.querySelectorAll('select');
      expect(selects.length).toBeGreaterThanOrEqual(5);
      const sourceOrthographySelect = selects[4] as HTMLSelectElement;
      expect(sourceOrthographySelect.options.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: '确认风险并创建' }));
    fireEvent.click(await screen.findByRole('button', { name: '创建并选中' }));

    await waitFor(() => {
      expect(mockCloneOrthographyToLanguage).toHaveBeenCalledWith(expect.objectContaining({
        sourceOrthographyId: 'orth_eng_base',
        targetLanguageId: 'cmn',
        scriptTag: 'Latn',
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(createLayer).toHaveBeenCalledWith(
        'transcription',
        expect.objectContaining({
          languageId: 'cmn',
          orthographyId: 'orth_cmn_derived',
        }),
        undefined,
      );
      expect(onClose).toHaveBeenCalled();
    });
  });
});