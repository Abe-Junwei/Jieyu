/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesktopTranscriptionPointTrack } from './DesktopTranscriptionPointTrack';
import type { DesktopPointTrackApi } from './useDesktopTranscriptionPointController';

function api(partial: Partial<DesktopPointTrackApi>): DesktopPointTrackApi {
  return {
    selected: { layerId: 'pt', pointId: 'a' },
    editingId: 'a',
    draft: 'ni',
    drag: null,
    menu: null,
    setDraft: vi.fn(),
    clearSelection: vi.fn(),
    onTrackPointerDown: vi.fn(),
    onPointPointerDown: vi.fn(),
    onPointContextMenu: vi.fn(),
    closeMenu: vi.fn(),
    editPoint: vi.fn(),
    seekSelected: vi.fn(),
    deleteSelected: vi.fn(),
    commitLabel: vi.fn(),
    cancelEdit: vi.fn(),
    shownTimeMs: (point) => point.timeMs,
    ...partial,
  };
}

describe('DesktopTranscriptionPointTrack', () => {
  it('does not commit the label while an IME composition is open', () => {
    const pointsApi = api({});
    render(
      <DesktopTranscriptionPointTrack
        locale="zh-CN"
        layerId="pt"
        points={[{ id: 'a', timeMs: 500, label: '' }]}
        duration={10}
        zoomPxPerSec={100}
        pointsApi={pointsApi}
      />,
    );
    const input = screen.getByDisplayValue('ni');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(pointsApi.commitLabel).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false, keyCode: 13 });
    expect(pointsApi.commitLabel).toHaveBeenCalledTimes(1);
  });
});
