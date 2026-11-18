/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { DesktopPageRouter, resetDesktopPageRouters } from '../test/desktopPageRouter';

const saveText = vi.fn(async () => true);

vi.mock('./useDesktopProjectReadController', () => ({
  useDesktopProjectReadController: () => ({
    sessionId: 'session-1',
    model: {
      manuscriptId: 'ms-1',
      manuscripts: [{ id: 'ms-1', title: { und: 'Story' }, timeMapping: null }],
      units: [
        { id: 'u-a', startTime: 0, endTime: 1, text: 'alpha' },
        { id: 'u-b', startTime: 1, endTime: 2, text: 'beta' },
      ],
      audioUrl: null,
    },
    notes: [],
    projectTitle: 'Project',
    error: '',
    openFolder: vi.fn(),
    selectManuscript: vi.fn(),
    saveText,
    persistTextDraft: vi.fn(async () => undefined),
    discardTextDraft: vi.fn(async () => undefined),
    inspectTextSave: vi.fn(async () => 'saved'),
    readTextDraft: vi.fn(async () => null),
    undoText: vi.fn(),
    splitUnit: vi.fn(),
    mergeUnits: vi.fn(),
    moveBoundary: vi.fn(),
    saveMapping: vi.fn(),
    saveUnitNote: vi.fn(),
    saveTierNote: vi.fn(),
  }),
}));

import { DesktopTranscriptionWorkspacePage } from './DesktopTranscriptionWorkspacePage';

afterEach(() => {
  resetDesktopPageRouters();
  cleanup();
  saveText.mockClear();
  delete (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop;
});

function renderWorkspace(entry = '/transcription') {
  (globalThis as { jieyuDesktop?: unknown }).jieyuDesktop = {
    projectReadEnabled: true,
    chooseDesktopFolder: vi.fn(async () => ({ cancelled: true as const })),
    desktopCall: vi.fn(async () => {
      throw new Error('unused');
    }),
    desktopMediaUrl: vi.fn(async () => ({ url: '' })),
  };
  render(
    <LocaleProvider locale="zh-CN">
      <DesktopPageRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/transcription" element={<DesktopTranscriptionWorkspacePage />} />
        </Routes>
      </DesktopPageRouter>
    </LocaleProvider>,
  );
}

function inspector(): HTMLElement {
  return screen.getByRole('complementary', { name: '片段检查器' });
}

describe('DesktopTranscriptionWorkspacePage selection (#550)', () => {
  it('shows the clicked unit in the inspector before and after save', async () => {
    renderWorkspace();
    expect(inspector().textContent).toContain('这个文件夹里还没有文稿');

    fireEvent.click(screen.getByRole('button', { name: /alpha/ }));
    expect(inspector().textContent).toContain('alpha');
    expect(inspector().textContent).not.toContain('这个文件夹里还没有文稿');

    fireEvent.click(screen.getByRole('button', { name: /beta/ }));
    expect(inspector().textContent).toContain('beta');

    fireEvent.change(screen.getByLabelText('正文'), { target: { value: 'beta edited' } });
    expect(inspector().textContent).toContain('beta edited');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^保存正文$/ }));
      await Promise.resolve();
    });
    expect(saveText).toHaveBeenCalled();
    expect(inspector().textContent).toContain('beta');
    expect(inspector().textContent).not.toContain('beta edited');
    expect(inspector().textContent).not.toContain('这个文件夹里还没有文稿');
  });

  it('replaces a deep-linked unit when another unit is clicked', () => {
    renderWorkspace('/transcription?manuscriptId=ms-1&layerId=layer-1&unitId=u-b');
    expect(inspector().textContent).toContain('beta');
    fireEvent.click(screen.getByRole('button', { name: /alpha/ }));
    expect(inspector().textContent).toContain('alpha');
    expect(inspector().textContent).not.toContain('beta');
  });
});
