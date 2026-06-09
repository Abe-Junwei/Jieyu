import { describe, expect, it, vi } from 'vitest';
import {
  applyChatWindowEdgeSnap,
  applyChatWindowKeyboardAction,
  clampChatWindowPosition,
  clampChatWindowSize,
  computeChatWindowDragPosition,
  computeChatWindowResizeSize,
  createChatWindowDragSession,
  createChatWindowResizeSession,
  createChatWindowViewportClamps,
  getDefaultChatWindowLayout,
  readStoredChatWindowLayout,
  reconcileChatWindowLayoutForViewport,
  resolveChatWindowKeyboardAction,
  MAX_HEIGHT,
  MAX_WIDTH,
  MIN_HEIGHT,
  MIN_WIDTH,
} from './TranscriptionPage.ChatWindow.layout';

describe('TranscriptionPage.ChatWindow.layout', () => {
  it('clamps size within viewport and min/max bounds', () => {
    expect(clampChatWindowSize(100, 100, 1280, 800)).toEqual({
      width: MIN_WIDTH,
      height: MIN_HEIGHT,
    });
    expect(clampChatWindowSize(2000, 2000, 1280, 800)).toEqual({
      width: Math.min(MAX_WIDTH, 1280 - 28),
      height: Math.min(MAX_HEIGHT, 800 - 28),
    });
  });

  it('clamps position inside viewport with minimized height', () => {
    const size = { width: 480, height: 640 };
    expect(clampChatWindowPosition(0, 0, size, true, 1280, 800)).toEqual({ x: 14, y: 14 });
    expect(clampChatWindowPosition(9999, 9999, size, false, 1280, 800)).toEqual({
      x: 1280 - size.width - 14,
      y: 800 - size.height - 14,
    });
  });

  it('returns default layout anchored to bottom-right', () => {
    const layout = getDefaultChatWindowLayout(1280, 900);
    expect(layout.size.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(layout.size.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
    expect(layout.position.x).toBeGreaterThanOrEqual(14);
    expect(layout.position.y).toBeGreaterThanOrEqual(14);
  });

  it('snaps position to viewport edges within threshold', () => {
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 900 });
    const size = { width: 480, height: 640 };
    expect(applyChatWindowEdgeSnap({ x: 16, y: 16 }, size, false)).toEqual({ x: 14, y: 14 });
    vi.unstubAllGlobals();
  });

  it('reads stored layout from localStorage', () => {
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({ open: true, minimized: false, x: 20, y: 20, width: 400, height: 500 }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    vi.stubGlobal('window', { localStorage: storage, innerWidth: 1280, innerHeight: 900 });
    const restored = readStoredChatWindowLayout(1280, 900);
    expect(restored?.open).toBe(true);
    expect(restored?.size.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(restored?.position?.x).toBeGreaterThanOrEqual(14);
    vi.unstubAllGlobals();
  });

  it('computes drag and resize deltas through viewport clamps', () => {
    const dragSession = createChatWindowDragSession(100, 120, 40, 60);
    const { clampPosition, clampSize } = createChatWindowViewportClamps(
      { width: 480, height: 640 },
      false,
      1280,
      900,
    );
    expect(computeChatWindowDragPosition(dragSession, 130, 150, clampPosition)).toEqual({
      x: 70,
      y: 90,
    });
    const resizeSession = createChatWindowResizeSession(200, 220, 480, 640);
    expect(computeChatWindowResizeSize(resizeSession, 260, 280, clampSize)).toEqual({
      width: 540,
      height: 700,
    });
  });

  it('reconciles layout when viewport shrinks', () => {
    const next = reconcileChatWindowLayoutForViewport(
      { width: 720, height: 880 },
      { x: 9999, y: 9999 },
      false,
      800,
      600,
    );
    expect(next.size.width).toBeLessThanOrEqual(800 - 28);
    expect(next.position.x).toBeLessThanOrEqual(800 - next.size.width - 14);
  });

  it('maps keyboard shortcuts to layout actions', () => {
    expect(resolveChatWindowKeyboardAction(false, false, 'j', true, false, false)).toBe(
      'toggle-open',
    );
    expect(resolveChatWindowKeyboardAction(true, true, 'j', true, false, false)).toBe(
      'toggle-restore',
    );
    expect(resolveChatWindowKeyboardAction(true, false, 'Escape', false, false, false)).toBe(
      'escape-minimize',
    );

    const setOpen = vi.fn();
    const setMinimized = vi.fn();
    applyChatWindowKeyboardAction('toggle-open', { setOpen, setMinimized });
    expect(setOpen).toHaveBeenCalledWith(true);
    expect(setMinimized).toHaveBeenCalledWith(false);
  });
});
