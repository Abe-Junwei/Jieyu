export const CHAT_WINDOW_STORAGE_KEY = 'jieyu.aiChatWindow.v1';
export const SNAP_THRESHOLD = 24;
export const MIN_WIDTH = 360;
export const MIN_HEIGHT = 420;
export const MAX_WIDTH = 720;
export const MAX_HEIGHT = 880;
export const MAXIMIZED_INSET = 14;
export const AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY = 'jieyu.aiChat.resumeAgentLoopTaskId';

export type ChatWindowLayoutState = {
  open: boolean;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clampChatWindowSize(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { width: number; height: number } {
  const maxW = Math.min(MAX_WIDTH, viewportWidth - 28);
  const maxH = Math.min(MAX_HEIGHT, viewportHeight - 28);
  return {
    width: Math.min(maxW, Math.max(MIN_WIDTH, width)),
    height: Math.min(maxH, Math.max(MIN_HEIGHT, height)),
  };
}

export function clampChatWindowPosition(
  x: number,
  y: number,
  panelSize: { width: number; height: number },
  minimized: boolean,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number } {
  const panelHeight = minimized ? 44 : panelSize.height;
  const maxX = Math.max(14, viewportWidth - panelSize.width - 14);
  const maxY = Math.max(14, viewportHeight - panelHeight - 14);
  return {
    x: Math.min(Math.max(14, x), maxX),
    y: Math.min(Math.max(14, y), maxY),
  };
}

export function getMaximizedChatWindowLayout(
  viewportWidth: number,
  viewportHeight: number,
): { position: { x: number; y: number }; size: { width: number; height: number } } {
  return {
    size: {
      width: Math.max(MIN_WIDTH, viewportWidth - MAXIMIZED_INSET * 2),
      height: Math.max(MIN_HEIGHT, viewportHeight - MAXIMIZED_INSET * 2),
    },
    position: { x: MAXIMIZED_INSET, y: MAXIMIZED_INSET },
  };
}

export function getDefaultChatWindowLayout(
  viewportWidth: number,
  viewportHeight: number,
): { position: { x: number; y: number }; size: { width: number; height: number } } {
  const width = Math.min(480, viewportWidth - 28);
  const height = Math.min(Math.floor(viewportHeight * 0.72), 760);
  const size = clampChatWindowSize(width, height, viewportWidth, viewportHeight);
  return {
    size,
    position: {
      x: Math.max(14, viewportWidth - size.width - 16),
      y: Math.max(14, viewportHeight - size.height - 16),
    },
  };
}

export function clampChatWindowSizeOffline(
  width: number,
  height: number,
): {
  width: number;
  height: number;
} {
  return {
    width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)),
    height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)),
  };
}

export function applyChatWindowEdgeSnap(
  prev: { x: number; y: number },
  panelSize: { width: number; height: number },
  minimized: boolean,
): { x: number; y: number } {
  if (typeof window === 'undefined') return prev;
  const maxX = Math.max(14, window.innerWidth - panelSize.width - 14);
  const maxY = Math.max(14, window.innerHeight - (minimized ? 44 : panelSize.height) - 14);
  let nextX = prev.x;
  let nextY = prev.y;
  if (Math.abs(prev.x - 14) <= SNAP_THRESHOLD) nextX = 14;
  if (Math.abs(prev.x - maxX) <= SNAP_THRESHOLD) nextX = maxX;
  if (Math.abs(prev.y - 14) <= SNAP_THRESHOLD) nextY = 14;
  if (Math.abs(prev.y - maxY) <= SNAP_THRESHOLD) nextY = maxY;
  return { x: nextX, y: nextY };
}

export type RestoredChatWindowLayout = {
  open?: boolean;
  minimized: boolean;
  position?: { x: number; y: number };
  size: { width: number; height: number };
};

export function readStoredChatWindowLayout(
  viewportWidth: number,
  viewportHeight: number,
): RestoredChatWindowLayout | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(CHAT_WINDOW_STORAGE_KEY);
  if (raw === null || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ChatWindowLayoutState>;
    const nextMinimized = typeof parsed.minimized === 'boolean' ? parsed.minimized : false;
    const defaultLayout = getDefaultChatWindowLayout(viewportWidth, viewportHeight);
    let nextSize = defaultLayout.size;
    if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
      nextSize = clampChatWindowSize(parsed.width, parsed.height, viewportWidth, viewportHeight);
    }
    const restored: RestoredChatWindowLayout = {
      minimized: nextMinimized,
      size: nextSize,
      ...(typeof parsed.open === 'boolean' ? { open: parsed.open } : {}),
    };
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      restored.position = clampChatWindowPosition(
        parsed.x,
        parsed.y,
        nextSize,
        nextMinimized,
        viewportWidth,
        viewportHeight,
      );
    }
    return restored;
  } catch {
    return null;
  }
}

export function writeStoredChatWindowLayout(snapshot: ChatWindowLayoutState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CHAT_WINDOW_STORAGE_KEY, JSON.stringify(snapshot));
}

export type ChatWindowDragSession = {
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
};

export type ChatWindowResizeSession = {
  pointerX: number;
  pointerY: number;
  startWidth: number;
  startHeight: number;
};

export type ChatWindowPointerCaptureTarget = {
  setPointerCapture: (pointerId: number) => void;
};

export type ChatWindowPointerEventLike = {
  clientX: number;
  clientY: number;
  pointerId: number;
  currentTarget: ChatWindowPointerCaptureTarget;
  stopPropagation?: () => void;
};

export type ChatWindowPointerInteractionState = {
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export type ChatWindowPointerInteractionRefs = {
  dragSession: { current: ChatWindowDragSession | null };
  resizeSession: { current: ChatWindowResizeSession | null };
};

export type ChatWindowPointerInteractionActions = {
  setPosition: (
    value:
      | { x: number; y: number }
      | ((prev: { x: number; y: number }) => { x: number; y: number }),
  ) => void;
  setSize: (value: { width: number; height: number }) => void;
  setDragging: (value: boolean) => void;
  setResizing: (value: boolean) => void;
};

export type ChatWindowKeyboardAction =
  | 'none'
  | 'toggle-open'
  | 'toggle-restore'
  | 'toggle-minimize'
  | 'escape-minimize';

export function createChatWindowDragSession(
  pointerX: number,
  pointerY: number,
  startX: number,
  startY: number,
): ChatWindowDragSession {
  return { pointerX, pointerY, startX, startY };
}

export function createChatWindowResizeSession(
  pointerX: number,
  pointerY: number,
  startWidth: number,
  startHeight: number,
): ChatWindowResizeSession {
  return { pointerX, pointerY, startWidth, startHeight };
}

export function createChatWindowViewportClamps(
  panelSize: { width: number; height: number },
  minimized: boolean,
  viewportWidth: number | undefined,
  viewportHeight: number | undefined,
) {
  const clampPosition = (x: number, y: number): { x: number; y: number } => {
    if (viewportWidth === undefined || viewportHeight === undefined) return { x, y };
    return clampChatWindowPosition(x, y, panelSize, minimized, viewportWidth, viewportHeight);
  };
  const clampSize = (width: number, height: number): { width: number; height: number } => {
    if (viewportWidth === undefined || viewportHeight === undefined) {
      return clampChatWindowSizeOffline(width, height);
    }
    return clampChatWindowSize(width, height, viewportWidth, viewportHeight);
  };
  return { clampPosition, clampSize };
}

export function computeChatWindowDragPosition(
  session: ChatWindowDragSession,
  pointerX: number,
  pointerY: number,
  clampPosition: (x: number, y: number) => { x: number; y: number },
): { x: number; y: number } {
  const deltaX = pointerX - session.pointerX;
  const deltaY = pointerY - session.pointerY;
  return clampPosition(session.startX + deltaX, session.startY + deltaY);
}

export function computeChatWindowResizeSize(
  session: ChatWindowResizeSession,
  pointerX: number,
  pointerY: number,
  clampSize: (width: number, height: number) => { width: number; height: number },
): { width: number; height: number } {
  return clampSize(
    session.startWidth + (pointerX - session.pointerX),
    session.startHeight + (pointerY - session.pointerY),
  );
}

export function reconcileChatWindowLayoutForViewport(
  prevSize: { width: number; height: number },
  prevPosition: { x: number; y: number },
  minimized: boolean,
  viewportWidth: number,
  viewportHeight: number,
): { size: { width: number; height: number }; position: { x: number; y: number } } {
  const size = clampChatWindowSize(prevSize.width, prevSize.height, viewportWidth, viewportHeight);
  const position = clampChatWindowPosition(
    prevPosition.x,
    prevPosition.y,
    size,
    minimized,
    viewportWidth,
    viewportHeight,
  );
  return { size, position };
}

export type ChatWindowRect = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export function resolveChatWindowPersistedRect(
  maximized: boolean,
  restoreRect: ChatWindowRect | null,
  current: ChatWindowRect,
): ChatWindowRect {
  return maximized ? (restoreRect ?? current) : current;
}

export function resolveChatWindowViewportLayout(
  maximized: boolean,
  current: ChatWindowRect,
  minimized: boolean,
  viewportWidth: number,
  viewportHeight: number,
): ChatWindowRect {
  if (maximized) {
    return getMaximizedChatWindowLayout(viewportWidth, viewportHeight);
  }
  return reconcileChatWindowLayoutForViewport(
    current.size,
    current.position,
    minimized,
    viewportWidth,
    viewportHeight,
  );
}

export function resolveChatWindowMaximizeToggle(
  maximized: boolean,
  restoreRect: ChatWindowRect | null,
  current: ChatWindowRect,
  minimized: boolean,
  viewportWidth: number,
  viewportHeight: number,
): { maximized: boolean; restoreRect: ChatWindowRect | null; minimized: boolean } & ChatWindowRect {
  if (maximized) {
    if (restoreRect === null) {
      return { maximized: false, restoreRect: null, minimized, ...current };
    }
    return {
      maximized: false,
      restoreRect: null,
      minimized,
      ...reconcileChatWindowLayoutForViewport(
        restoreRect.size,
        restoreRect.position,
        minimized,
        viewportWidth,
        viewportHeight,
      ),
    };
  }
  return {
    maximized: true,
    restoreRect: {
      position: { ...current.position },
      size: { ...current.size },
    },
    minimized: false,
    ...getMaximizedChatWindowLayout(viewportWidth, viewportHeight),
  };
}

export function resolveChatWindowKeyboardAction(
  open: boolean,
  minimized: boolean,
  key: string,
  metaKey: boolean,
  ctrlKey: boolean,
  shiftKey: boolean,
): ChatWindowKeyboardAction {
  const isToggle = (metaKey || ctrlKey) && !shiftKey && key.toLowerCase() === 'j';
  if (isToggle) {
    if (!open) return 'toggle-open';
    if (minimized) return 'toggle-restore';
    return 'toggle-minimize';
  }
  if (key === 'Escape' && open && !minimized) return 'escape-minimize';
  return 'none';
}

export function applyChatWindowKeyboardAction(
  action: ChatWindowKeyboardAction,
  actions: {
    setOpen: (value: boolean) => void;
    setMinimized: (value: boolean) => void;
  },
): void {
  switch (action) {
    case 'toggle-open':
      actions.setOpen(true);
      actions.setMinimized(false);
      return;
    case 'toggle-restore':
      actions.setMinimized(false);
      return;
    case 'toggle-minimize':
    case 'escape-minimize':
      actions.setMinimized(true);
      return;
    default:
      return;
  }
}

function getChatWindowViewportSize(): { width: number | undefined; height: number | undefined } {
  if (typeof window === 'undefined') return { width: undefined, height: undefined };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function createChatWindowPointerInteractionHandlers(
  refs: ChatWindowPointerInteractionRefs,
  getState: () => ChatWindowPointerInteractionState,
  actions: ChatWindowPointerInteractionActions,
) {
  const getClamps = () => {
    const state = getState();
    const { width, height } = getChatWindowViewportSize();
    return createChatWindowViewportClamps(state.size, state.minimized, width, height);
  };

  return {
    handleHeaderPointerDown: (event: ChatWindowPointerEventLike) => {
      const state = getState();
      if (!state.open || state.minimized) return;
      refs.dragSession.current = createChatWindowDragSession(
        event.clientX,
        event.clientY,
        state.position.x,
        state.position.y,
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      actions.setDragging(true);
    },
    handleHeaderPointerMove: (event: ChatWindowPointerEventLike) => {
      const session = refs.dragSession.current;
      if (!session) return;
      const { clampPosition } = getClamps();
      actions.setPosition(
        computeChatWindowDragPosition(session, event.clientX, event.clientY, clampPosition),
      );
    },
    stopDragging: () => {
      if (!refs.dragSession.current) return;
      refs.dragSession.current = null;
      actions.setDragging(false);
      const state = getState();
      actions.setPosition((prev) => applyChatWindowEdgeSnap(prev, state.size, state.minimized));
    },
    handleResizePointerDown: (event: ChatWindowPointerEventLike) => {
      const state = getState();
      if (!state.open || state.minimized || state.maximized) return;
      event.stopPropagation?.();
      refs.resizeSession.current = createChatWindowResizeSession(
        event.clientX,
        event.clientY,
        state.size.width,
        state.size.height,
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      actions.setResizing(true);
    },
    handleResizePointerMove: (event: ChatWindowPointerEventLike) => {
      const session = refs.resizeSession.current;
      if (!session) return;
      const { clampPosition, clampSize } = getClamps();
      const nextSize = computeChatWindowResizeSize(
        session,
        event.clientX,
        event.clientY,
        clampSize,
      );
      actions.setSize(nextSize);
      actions.setPosition((prev) => clampPosition(prev.x, prev.y));
    },
    stopResizing: () => {
      refs.resizeSession.current = null;
      actions.setResizing(false);
    },
  };
}
