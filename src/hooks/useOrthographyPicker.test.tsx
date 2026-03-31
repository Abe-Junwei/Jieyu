// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrthographyDocType } from '../db';
import { useOrthographyPicker } from './useOrthographyPicker';

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

vi.mock('./useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

describe('useOrthographyPicker render warnings', () => {
  beforeEach(() => {
    mockCreateOrthography.mockReset();
    mockCloneOrthographyToLanguage.mockReset();
    mockCreateOrthographyTransform.mockReset();
    mockUseOrthographies.mockReset();
    mockUseOrthographies.mockReturnValue([] as OrthographyDocType[]);
  });

  it('requires an explicit second submit when render warnings exist', async () => {
    mockCreateOrthography.mockResolvedValue({
      id: 'ortho-eng-ipa',
      languageId: 'eng',
      name: { zho: 'English IPA', eng: 'English IPA' },
      abbreviation: 'IPA',
      scriptTag: 'Latn',
      type: 'phonetic',
      createdAt: '2026-03-31T00:00:00.000Z',
      updatedAt: '2026-03-31T00:00:00.000Z',
    });

    const onChange = vi.fn();
    const { result } = renderHook(() => useOrthographyPicker('eng', '', onChange));

    await waitFor(() => {
      expect(result.current.draftRenderWarnings.length).toBeGreaterThan(0);
      expect(result.current.requiresRenderWarningConfirmation).toBe(true);
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    expect(mockCreateOrthography).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.renderWarningsAcknowledged).toBe(true);
      expect(result.current.requiresRenderWarningConfirmation).toBe(false);
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    expect(mockCreateOrthography).toHaveBeenCalledWith(expect.objectContaining({
      languageId: 'eng',
      abbreviation: 'IPA',
      scriptTag: 'Latn',
    }));
    expect(onChange).toHaveBeenCalledWith('ortho-eng-ipa');
  });

  it('clears the confirmation state after warning-related fields change', async () => {
    const { result } = renderHook(() => useOrthographyPicker('urd', '', vi.fn()));

    await waitFor(() => {
      expect(result.current.draftRenderWarnings.length).toBeGreaterThan(0);
    });

    await act(async () => {
      await result.current.createOrthography();
    });

    await waitFor(() => {
      expect(result.current.renderWarningsAcknowledged).toBe(true);
    });

    act(() => {
      result.current.setDraftExemplarMain('ا, ب, ت');
    });

    await waitFor(() => {
      expect(result.current.renderWarningsAcknowledged).toBe(false);
    });
  });
});