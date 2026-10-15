// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider, t } from '../i18n';

const { mockPreview, mockApply } = vi.hoisted(() => ({
  mockPreview: vi.fn(),
  mockApply: vi.fn(),
}));

vi.mock('./annotation/applyAnnotationAutoGloss', () => ({
  previewAnnotationAutoGloss: mockPreview,
  applyAnnotationAutoGlossPreview: mockApply,
}));

import { useAnnotationAutoGlossController } from './useAnnotationAutoGlossController';

const match = {
  tokenId: 'tok-1',
  tokenForm: { default: 'cat' },
  lexemeId: 'lex-1',
  lexemeLemma: { default: 'cat' },
  gloss: { default: 'animal' },
  confidence: 1,
  matchType: 'exact' as const,
};

function wrapper({ children }: { children: ReactNode }) {
  return createElement(LocaleProvider, { locale: 'zh-CN', children });
}

describe('useAnnotationAutoGlossController onApply', () => {
  it('clears the preview and says the view is stale when reload fails after the write', async () => {
    mockPreview.mockResolvedValue({ matches: [match], skipped: 0, total: 1 });
    mockApply.mockResolvedValue([]);
    const reloadWorkspace = vi.fn(async () => {
      throw new Error('snapshot down');
    });
    const { result } = renderHook(
      () =>
        useAnnotationAutoGlossController({
          drafts: {},
          rows: [],
          reloadWorkspace,
        }),
      { wrapper },
    );

    await act(async () => {
      result.current.onPreview('unit-1');
    });
    await waitFor(() => {
      expect(result.current.matches).toHaveLength(1);
    });

    await act(async () => {
      result.current.onApply('unit-1');
    });

    await waitFor(() => {
      expect(result.current.saveNotice).toEqual({
        kind: 'saved',
        message: t('zh-CN', 'workspace.annotation.writtenViewStale'),
      });
    });
    expect(result.current.matches).toEqual([]);
    expect(result.current.previewUnitId).toBe('');
    expect(reloadWorkspace).toHaveBeenCalledTimes(1);
  });
});
