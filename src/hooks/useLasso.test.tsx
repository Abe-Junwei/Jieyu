// @vitest-environment jsdom
/**
 * 横纵清单 §6.2：tier 套索与对读 DOM / 纵向禁链的最低回归。
 * @see docs/execution/plans/横纵时间轴宿主差异与整改清单-2026-04-21.md
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useRef, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type WaveSurfer from 'wavesurfer.js';
import { useLasso, type SubSelectDrag } from './useLasso';

function TierLassoHarness(props: {
  tierTimelineLassoSuppressed?: boolean;
  clearUnitSelection: () => void;
  createUnitFromSelection?: (start: number, end: number) => Promise<void>;
  timelineItems?: Array<{ id: string; startTime: number; endTime: number }>;
  zoomPxPerSec?: number;
  children?: ReactNode;
}) {
  const waveCanvasRef = useRef<HTMLDivElement>(null);
  const tierRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<WaveSurfer | null>(null);
  const skipSeekForIdRef = useRef<string | null>(null);
  const subSelectDragRef = useRef<SubSelectDrag | null>(null);

  const lasso = useLasso({
    waveCanvasRef,
    tierContainerRef: tierRef,
    playerInstanceRef: playerRef,
    playerIsReady: true,
    selectedMediaUrl: 'blob:test',
    timelineItems: props.timelineItems ?? [{ id: 'u1', startTime: 0, endTime: 10 }],
    selectedUnitIds: new Set(['u1']),
    selectedUnitId: 'u1',
    zoomPxPerSec: props.zoomPxPerSec ?? 10,
    skipSeekForIdRef,
    clearUnitSelection: props.clearUnitSelection,
    createUnitFromSelection: props.createUnitFromSelection ?? vi.fn(async () => {}),
    setUnitSelection: vi.fn(),
    playerSeekTo: vi.fn(),
    subSelectionRange: null,
    setSubSelectionRange: vi.fn(),
    subSelectDragRef,
    ...(props.tierTimelineLassoSuppressed ? { tierTimelineLassoSuppressed: true } : {}),
  });

  return (
    <div
      ref={tierRef}
      data-testid="timeline-scroll"
      onPointerDown={lasso.handleLassoPointerDown}
      onPointerMove={lasso.handleLassoPointerMove}
      onPointerUp={lasso.handleLassoPointerUp}
    >
      <div ref={waveCanvasRef} data-testid="wave-canvas" style={{ width: 0, height: 0, overflow: 'hidden' }} />
      {props.children}
    </div>
  );
}

const rect800x100 = {
  width: 800,
  height: 100,
  top: 0,
  left: 0,
  right: 800,
  bottom: 100,
  x: 0,
  y: 0,
  toJSON: () => {},
} as DOMRect;

/** 波形区套索：解码时长为 0 时依赖 `waveformMappingDurationSec` 与波形桥对齐。 */
function WaveformLassoHarness(props: {
  clearUnitSelection: () => void;
  createUnitFromSelection?: (start: number, end: number) => Promise<void>;
  waveformMappingDurationSec: number;
}) {
  const waveCanvasRef = useRef<HTMLDivElement>(null);
  const tierRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<WaveSurfer | null>(null);
  const skipSeekForIdRef = useRef<string | null>(null);
  const subSelectDragRef = useRef<SubSelectDrag | null>(null);

  const mockWs = useMemo((): WaveSurfer => {
    const scrollParent = document.createElement('div');
    Object.defineProperty(scrollParent, 'scrollLeft', { value: 0, writable: true, configurable: true });
    vi.spyOn(scrollParent, 'getBoundingClientRect').mockReturnValue(rect800x100);
    const wrapper = document.createElement('div');
    Object.defineProperty(wrapper, 'scrollWidth', { configurable: true, value: 800 });
    scrollParent.appendChild(wrapper);
    return {
      getDuration: () => 0,
      getWrapper: () => wrapper,
    } as unknown as WaveSurfer;
  }, []);

  if (playerRef.current === null) {
    playerRef.current = mockWs;
  }

  useLasso({
    waveCanvasRef,
    tierContainerRef: tierRef,
    playerInstanceRef: playerRef,
    playerIsReady: true,
    selectedMediaUrl: undefined,
    timelineItems: [],
    selectedUnitIds: new Set(),
    selectedUnitId: '',
    zoomPxPerSec: 10,
    skipSeekForIdRef,
    clearUnitSelection: props.clearUnitSelection,
    createUnitFromSelection: props.createUnitFromSelection ?? vi.fn(async () => {}),
    setUnitSelection: vi.fn(),
    playerSeekTo: vi.fn(),
    subSelectionRange: null,
    setSubSelectionRange: vi.fn(),
    subSelectDragRef,
    waveformMappingDurationSec: props.waveformMappingDurationSec,
  });

  return (
    <div ref={tierRef} data-testid="timeline-scroll">
      <div
        ref={waveCanvasRef}
        data-testid="wave-lasso-canvas"
        style={{ width: 800, height: 100 }}
      />
    </div>
  );
}

function stubTierGeometry(el: HTMLElement) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 400,
    top: 0,
    left: 0,
    right: 800,
    bottom: 400,
    x: 0,
    y: 0,
    toJSON: () => {},
  } as DOMRect);
}

describe('useLasso — tier 套索与对读排除（§6.2）', () => {
  const clearUnitSelection = vi.fn();

  beforeEach(() => {
    clearUnitSelection.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('横向空白轻点：触发空击清选', () => {
    render(
      <TierLassoHarness clearUnitSelection={clearUnitSelection}>
        <span data-testid="empty-hit"> </span>
      </TierLassoHarness>,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();
    tier.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(tier, { clientX: 400, clientY: 200, button: 0, buttons: 1, pointerId: 1 });
    fireEvent.pointerUp(tier, { clientX: 400, clientY: 200, button: 0, buttons: 0, pointerId: 1 });

    expect(clearUnitSelection).toHaveBeenCalledTimes(1);
  });

  it('纵向禁链：空白轻点不清选', () => {
    render(
      <TierLassoHarness tierTimelineLassoSuppressed clearUnitSelection={clearUnitSelection} />,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    fireEvent.pointerDown(tier, { clientX: 10, clientY: 10, button: 0, buttons: 1, pointerId: 2 });
    fireEvent.pointerUp(tier, { clientX: 10, clientY: 10, button: 0, buttons: 0, pointerId: 2 });

    expect(clearUnitSelection).not.toHaveBeenCalled();
  });

  it('对读 rail（button）：轻点不清选', () => {
    render(
      <TierLassoHarness clearUnitSelection={clearUnitSelection}>
        <button type="button" data-testid="paired-rail">
          rail
        </button>
      </TierLassoHarness>,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    const rail = screen.getByTestId('paired-rail');
    fireEvent.pointerDown(rail, { clientX: 5, clientY: 5, button: 0, buttons: 1, pointerId: 3 });
    fireEvent.pointerUp(rail, { clientX: 5, clientY: 5, button: 0, buttons: 0, pointerId: 3 });

    expect(clearUnitSelection).not.toHaveBeenCalled();
  });

  it('对读 target surface：轻点不清选', () => {
    render(
      <TierLassoHarness clearUnitSelection={clearUnitSelection}>
        <div className="timeline-paired-reading-view">
          <div className="timeline-paired-reading-target-surface" data-testid="target-surface" />
        </div>
      </TierLassoHarness>,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    const surface = screen.getByTestId('target-surface');
    fireEvent.pointerDown(surface, { clientX: 12, clientY: 12, button: 0, buttons: 1, pointerId: 4 });
    fireEvent.pointerUp(surface, { clientX: 12, clientY: 12, button: 0, buttons: 0, pointerId: 4 });

    expect(clearUnitSelection).not.toHaveBeenCalled();
  });

  it('对读 source surface：轻点不清选', () => {
    render(
      <TierLassoHarness clearUnitSelection={clearUnitSelection}>
        <div className="timeline-paired-reading-view">
          <div className="timeline-paired-reading-source-surface" data-testid="source-surface" />
        </div>
      </TierLassoHarness>,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    const surface = screen.getByTestId('source-surface');
    fireEvent.pointerDown(surface, { clientX: 14, clientY: 14, button: 0, buttons: 1, pointerId: 41 });
    fireEvent.pointerUp(surface, { clientX: 14, clientY: 14, button: 0, buttons: 0, pointerId: 41 });

    expect(clearUnitSelection).not.toHaveBeenCalled();
  });

  it('.timeline-annotation：轻点不清选', () => {
    render(
      <TierLassoHarness clearUnitSelection={clearUnitSelection}>
        <div className="timeline-annotation" data-testid="anno" />
      </TierLassoHarness>,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    const anno = screen.getByTestId('anno');
    fireEvent.pointerDown(anno, { clientX: 20, clientY: 20, button: 0, buttons: 1, pointerId: 42 });
    fireEvent.pointerUp(anno, { clientX: 20, clientY: 20, button: 0, buttons: 0, pointerId: 42 });

    expect(clearUnitSelection).not.toHaveBeenCalled();
  });

  it('[role="button"] 命中：轻点不清选', () => {
    render(
      <TierLassoHarness clearUnitSelection={clearUnitSelection}>
        <div role="button" tabIndex={0} data-testid="role-btn">
          act
        </div>
      </TierLassoHarness>,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    const roleBtn = screen.getByTestId('role-btn');
    fireEvent.pointerDown(roleBtn, { clientX: 8, clientY: 8, button: 0, buttons: 1, pointerId: 5 });
    fireEvent.pointerUp(roleBtn, { clientX: 8, clientY: 8, button: 0, buttons: 0, pointerId: 5 });

    expect(clearUnitSelection).not.toHaveBeenCalled();
  });

  it('.timeline-lane-resize-handle：轻点不清选', () => {
    render(
      <TierLassoHarness clearUnitSelection={clearUnitSelection}>
        <div className="timeline-lane-resize-handle" data-testid="resize-handle" />
      </TierLassoHarness>,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    const handle = screen.getByTestId('resize-handle');
    fireEvent.pointerDown(handle, { clientX: 3, clientY: 3, button: 0, buttons: 1, pointerId: 6 });
    fireEvent.pointerUp(handle, { clientX: 3, clientY: 3, button: 0, buttons: 0, pointerId: 6 });

    expect(clearUnitSelection).not.toHaveBeenCalled();
  });

  it('拖选起止反向：createUnitFromSelection 仍收到升序时间范围', () => {
    const createUnitFromSelection = vi.fn(async () => {});
    render(
      <TierLassoHarness
        clearUnitSelection={clearUnitSelection}
        createUnitFromSelection={createUnitFromSelection}
        timelineItems={[]}
        zoomPxPerSec={10}
      />,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    fireEvent.pointerDown(tier, { clientX: 250, clientY: 80, button: 0, buttons: 1, pointerId: 61 });
    fireEvent.pointerMove(tier, { clientX: 100, clientY: 100, button: 0, buttons: 1, pointerId: 61 });
    fireEvent.pointerUp(tier, { clientX: 100, clientY: 100, button: 0, buttons: 0, pointerId: 61 });

    expect(createUnitFromSelection).toHaveBeenCalledTimes(1);
    expect(createUnitFromSelection).toHaveBeenCalledWith(10, 25);
  });

  it('极小框拖选：低于最小时长阈值不创建语段', () => {
    const createUnitFromSelection = vi.fn(async () => {});
    render(
      <TierLassoHarness
        clearUnitSelection={clearUnitSelection}
        createUnitFromSelection={createUnitFromSelection}
        timelineItems={[]}
        zoomPxPerSec={100}
      />,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    tier.setPointerCapture = vi.fn();

    fireEvent.pointerDown(tier, { clientX: 100, clientY: 70, button: 0, buttons: 1, pointerId: 62 });
    fireEvent.pointerMove(tier, { clientX: 104, clientY: 90, button: 0, buttons: 1, pointerId: 62 });
    fireEvent.pointerUp(tier, { clientX: 104, clientY: 90, button: 0, buttons: 0, pointerId: 62 });

    expect(createUnitFromSelection).not.toHaveBeenCalled();
  });

  it('滚动偏移：时间换算包含 scrollLeft 偏移', () => {
    const createUnitFromSelection = vi.fn(async () => {});
    render(
      <TierLassoHarness
        clearUnitSelection={clearUnitSelection}
        createUnitFromSelection={createUnitFromSelection}
        timelineItems={[]}
        zoomPxPerSec={10}
      />,
    );
    const tier = screen.getByTestId('timeline-scroll');
    stubTierGeometry(tier);
    Object.defineProperty(tier, 'scrollLeft', { value: 200, writable: true });
    Object.defineProperty(tier, 'scrollTop', { value: 0, writable: true });
    tier.setPointerCapture = vi.fn();

    fireEvent.pointerDown(tier, { clientX: 100, clientY: 60, button: 0, buttons: 1, pointerId: 63 });
    fireEvent.pointerMove(tier, { clientX: 150, clientY: 90, button: 0, buttons: 1, pointerId: 63 });
    fireEvent.pointerUp(tier, { clientX: 150, clientY: 90, button: 0, buttons: 0, pointerId: 63 });

    expect(createUnitFromSelection).toHaveBeenCalledTimes(1);
    expect(createUnitFromSelection).toHaveBeenCalledWith(30, 35);
  });
});

describe('useLasso — 波形映射与语义轴对齐', () => {
  const clearUnitSelection = vi.fn();

  beforeEach(() => {
    clearUnitSelection.mockClear();
  });

  it('解码时长为 0 时用语义轴秒数仍可拖选建段', () => {
    const createUnitFromSelection = vi.fn(async () => {});
    render(
      <WaveformLassoHarness
        clearUnitSelection={clearUnitSelection}
        createUnitFromSelection={createUnitFromSelection}
        waveformMappingDurationSec={100}
      />,
    );
    const wave = screen.getByTestId('wave-lasso-canvas');
    vi.spyOn(wave, 'getBoundingClientRect').mockReturnValue(rect800x100);
    wave.setPointerCapture = vi.fn();

    fireEvent.pointerDown(wave, { clientX: 100, clientY: 50, button: 0, buttons: 1, pointerId: 70 });
    fireEvent.pointerMove(wave, { clientX: 400, clientY: 80, button: 0, buttons: 1, pointerId: 70 });
    fireEvent.pointerUp(wave, { clientX: 400, clientY: 80, button: 0, buttons: 0, pointerId: 70 });

    expect(createUnitFromSelection).toHaveBeenCalledTimes(1);
    const [start, end] = createUnitFromSelection.mock.calls[0] ?? [];
    expect(start).toBeCloseTo(12.5, 5);
    expect(end).toBeCloseTo(50, 5);
  });
});
