/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopTranscriptionPointTrack,
  formatPointReadout,
} from './DesktopTranscriptionPointTrack';
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
    onLabelPointerDown: vi.fn(),
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('formatPointReadout', () => {
  it('formats m:ss.mmm', () => {
    expect(formatPointReadout(12450)).toBe('0:12.450');
    expect(formatPointReadout(65000)).toBe('1:05.000');
  });
});

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

  it('shows an empty-track hint and routes label re-click to the edit gate', () => {
    const pointsApi = api({ selected: null, editingId: null, draft: '' });
    const { rerender } = render(
      <DesktopTranscriptionPointTrack
        locale="zh-CN"
        layerId="pt"
        points={[]}
        duration={10}
        zoomPxPerSec={100}
        pointsApi={pointsApi}
      />,
    );
    expect(screen.getByText('单击添加事件')).toBeTruthy();

    const selectedApi = api({
      selected: { layerId: 'pt', pointId: 'a' },
      editingId: null,
      draft: '',
    });
    rerender(
      <DesktopTranscriptionPointTrack
        locale="zh-CN"
        layerId="pt"
        points={[{ id: 'a', timeMs: 500, label: '拍手' }]}
        duration={10}
        zoomPxPerSec={100}
        pointsApi={selectedApi}
      />,
    );
    fireEvent.pointerDown(screen.getByText('拍手'));
    expect(selectedApi.onLabelPointerDown).toHaveBeenCalledTimes(1);
  });

  it('portals a drag readout outside the clipping point track', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return new DOMRect(0, this.classList.contains('desktop-tx-wave') ? 0 : 100, 200, 36);
    });
    const pointsApi = api({
      selected: { layerId: 'pt', pointId: 'a' },
      editingId: null,
      draft: '',
      drag: { layerId: 'pt', pointId: 'a', timeMs: 12450 },
      shownTimeMs: () => 12450,
    });
    render(
      <>
        <div className="desktop-tx-wave" />
        <div className="desktop-tx-lane" data-layer-id="pt">
          <DesktopTranscriptionPointTrack
            locale="zh-CN"
            layerId="pt"
            points={[{ id: 'a', timeMs: 500, label: 'a' }]}
            duration={30}
            zoomPxPerSec={100}
            pointsApi={pointsApi}
          />
        </div>
      </>,
    );
    expect(screen.getByText('0:12.450').closest('.desktop-tx-lane')).toBeNull();
    expect(document.querySelectorAll('.desktop-tx-pin.is-dragging')).toHaveLength(1);
    expect(document.querySelectorAll('.desktop-tx-pin.is-preview')).toHaveLength(0);
  });
});
