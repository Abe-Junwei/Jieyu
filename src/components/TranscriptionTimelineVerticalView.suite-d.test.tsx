// @vitest-environment jsdom
/**
 * Isolated process: paired-reading **source** header context menu through「层操作」submenu.
 * Kept separate from suite-c so Vitest threads worker can exit cleanly; does not click「编辑」
 * (LayerActionPopover + jsdom 在该路径上曾出现长时间挂起，层操作入口覆盖在下方断言)。
 */
import 'fake-indexeddb/auto';

const { mockShowToast } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
}));

vi.mock('../contexts/ToastContext', () => ({
  useToast: () => ({
    showToast: mockShowToast,
    showSaveState: vi.fn(),
    showVoiceState: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { LocaleProvider } from '../i18n';
import { TranscriptionTimelineVerticalView } from './TranscriptionTimelineVerticalView';
import {
  makeEditorContext,
  makeLayer,
  makeTranslationLayer,
  makeUnit,
} from './TranscriptionTimelineVerticalView.test.fixtures';

afterEach(() => {
  cleanup();
  mockShowToast.mockReset();
});

describe('TranscriptionTimelineVerticalView', () => {
  it('opens the vertical layer header context menu and exposes enabled layer operation entries', async () => {
    const transcriptionLayers = [makeLayer('tr-a', 'transcription', '原文层')];
    const translationLayers = [makeTranslationLayer('translation-1', 'tr-a', '翻译层')];
    const units = [makeUnit('u1', 'tr-a', 0, 1)];

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionEditorContext.Provider value={makeEditorContext()}>
          <TranscriptionTimelineVerticalView
            transcriptionLayers={transcriptionLayers}
            translationLayers={translationLayers}
            unitsOnCurrentMedia={units}
            focusedLayerRowId="tr-a"
            onFocusLayer={vi.fn()}
            handleAnnotationClick={vi.fn()}
            deletableLayers={[...transcriptionLayers, ...translationLayers]}
            displayStyleControl={{
              orthographies: [],
              onUpdate: vi.fn(),
              onReset: vi.fn(),
            }}
          />
        </TranscriptionEditorContext.Provider>
      </LocaleProvider>,
    );

    const comparisonView = screen.getByTestId('timeline-paired-reading-view');
    fireEvent.contextMenu(screen.getByTestId('paired-reading-layer-header-source'));
    expect(await screen.findByRole('menu')).toBeTruthy();

    const viewCategory = screen.getByRole('menuitem', { name: /^视图/ });
    fireEvent.mouseEnter(viewCategory);
    const sourceOnlyItem = await screen.findByRole('menuitem', { name: '仅原文' });
    fireEvent.click(sourceOnlyItem);
    expect(comparisonView.getAttribute('data-compact-mode')).toBe('source');

    fireEvent.contextMenu(screen.getByTestId('paired-reading-layer-header-source'));
    const layerOpsCategory = await screen.findByRole('menuitem', { name: /^层操作/ });
    fireEvent.click(layerOpsCategory);

    const editLayerAction = await screen.findByRole('menuitem', { name: /编辑该层元信息/ });
    const deleteLayerAction = await screen.findByRole('menuitem', { name: /删除当前层/ });
    expect((editLayerAction as HTMLButtonElement).disabled).toBe(false);
    expect((deleteLayerAction as HTMLButtonElement).disabled).toBe(false);
  });
});
