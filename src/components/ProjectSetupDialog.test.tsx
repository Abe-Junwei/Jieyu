// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectSetupDialog } from './ProjectSetupDialog';

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

describe('ProjectSetupDialog orthography creation', () => {
  afterEach(() => {
    cleanup();
    mockCreateOrthography.mockReset();
    mockCloneOrthographyToLanguage.mockReset();
    mockCreateOrthographyTransform.mockReset();
    mockUseOrthographies.mockReset();
  });

  it('creates an IPA orthography inline and submits it as project default', async () => {
    mockUseOrthographies.mockReturnValue([]);
    mockCreateOrthography.mockResolvedValue({
      id: 'orth_project_ipa',
      languageId: 'eng',
      name: { zho: 'English IPA', eng: 'English IPA' },
      abbreviation: 'IPA',
      scriptTag: 'Latn',
      type: 'phonetic',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });

    const onSubmit = vi.fn(async () => undefined);
    const onClose = vi.fn();
    const view = render(
      <ProjectSetupDialog
        isOpen
        onClose={onClose}
        onSubmit={onSubmit}
      />, 
    );

    fireEvent.change(screen.getByPlaceholderText('例：白马藏语田野调查'), {
      target: { value: '项目 A' },
    });

    const initialSelects = view.container.querySelectorAll('select');
    fireEvent.change(initialSelects[0] as HTMLSelectElement, {
      target: { value: 'eng' },
    });

    await waitFor(() => {
      const selects = view.container.querySelectorAll('select');
      expect(selects.length).toBeGreaterThanOrEqual(2);
    });

    fireEvent.change(view.container.querySelectorAll('select')[1] as HTMLSelectElement, {
      target: { value: '__create_new_orthography__' },
    });

    fireEvent.click(await screen.findByRole('button', { name: '确认风险并创建' }));
    fireEvent.click(await screen.findByRole('button', { name: '创建并选中' }));

    await waitFor(() => {
      expect(mockCreateOrthography).toHaveBeenCalledWith(expect.objectContaining({
        languageId: 'eng',
        abbreviation: 'IPA',
        scriptTag: 'Latn',
        type: 'phonetic',
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        titleZh: '项目 A',
        primaryLanguageId: 'eng',
        primaryOrthographyId: 'orth_project_ipa',
      }));
    });
  });
});