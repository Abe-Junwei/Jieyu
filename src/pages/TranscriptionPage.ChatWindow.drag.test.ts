// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  createChatWindowDragSession,
  createChatWindowPointerInteractionHandlers,
} from './TranscriptionPage.ChatWindow.layout';

describe('chat header inside its real dialog ancestor', () => {
  it.each(['span', 'button', 'input', 'a', '[role="button"]'])(
    'drags only header whitespace, not %s controls',
    (control) => {
      const dialog = document.createElement('section');
      dialog.setAttribute('role', 'dialog');
      dialog.innerHTML =
        '<header><span class="blank">Chat</span><button><i>action</i></button><input /><a href="#">link</a><div role="button"><b>action</b></div></header>';
      const dragSession = {
        current: null as ReturnType<typeof createChatWindowDragSession> | null,
      };
      const setDragging = vi.fn();
      const setPosition = vi.fn();
      const setPointerCapture = vi.fn();
      const handlers = createChatWindowPointerInteractionHandlers(
        { dragSession, resizeSession: { current: null } },
        () => ({
          open: true,
          minimized: false,
          maximized: false,
          position: { x: 40, y: 60 },
          size: { width: 480, height: 640 },
        }),
        { setPosition, setSize: vi.fn(), setDragging, setResizing: vi.fn() },
      );
      const target = dialog.querySelector(
        control === 'button'
          ? 'button i'
          : control === '[role="button"]'
            ? '[role="button"] b'
            : control,
      );
      const event = {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        target,
        currentTarget: { setPointerCapture },
      };
      handlers.handleHeaderPointerDown(event);
      if (control === 'span') {
        expect(dragSession.current).not.toBeNull();
        expect(setDragging).toHaveBeenCalledWith(true);
        expect(setPointerCapture).toHaveBeenCalledWith(1);
        handlers.handleHeaderPointerMove({ ...event, clientX: 120, clientY: 130 });
        expect(setPosition).toHaveBeenCalledWith({ x: 60, y: 90 });
      } else {
        expect(dragSession.current).toBeNull();
        expect(setDragging).not.toHaveBeenCalled();
        expect(setPointerCapture).not.toHaveBeenCalled();
      }
    },
  );
});
