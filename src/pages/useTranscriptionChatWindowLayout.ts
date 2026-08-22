import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { t, type Locale } from '../i18n';
import {
  OPEN_APPROVAL_CENTER_EVENT,
  REQUEST_AGENT_LOOP_RESUME_EVENT,
} from '../ai/tasks/taskRefreshEvents';
import {
  AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY,
  applyChatWindowKeyboardAction,
  createChatWindowPointerInteractionHandlers,
  getDefaultChatWindowLayout,
  readStoredChatWindowLayout,
  resolveChatWindowKeyboardAction,
  resolveChatWindowMaximizeToggle,
  resolveChatWindowPersistedRect,
  resolveChatWindowViewportLayout,
  writeStoredChatWindowLayout,
  type ChatWindowDragSession,
  type ChatWindowPointerInteractionState,
  type ChatWindowRect,
  type ChatWindowResizeSession,
} from './TranscriptionPage.ChatWindow.layout';

export interface UseTranscriptionChatWindowLayoutInput {
  uiLocale: Locale;
  aiIsStreaming: boolean;
  onSendAiMessage: ((text: string) => Promise<unknown> | void) | undefined;
  pendingToolCall?: unknown;
}

export function useTranscriptionChatWindowLayout({
  uiLocale,
  aiIsStreaming,
  onSendAiMessage,
  pendingToolCall,
}: UseTranscriptionChatWindowLayoutInput) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({ x: 0, y: 0 }));
  const [size, setSize] = useState<{ width: number; height: number }>(() => ({
    width: 480,
    height: 640,
  }));
  const [layoutInitialized, setLayoutInitialized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStartRef = useRef<ChatWindowDragSession | null>(null);
  const resizeStartRef = useRef<ChatWindowResizeSession | null>(null);
  const openRef = useRef(open);
  const minimizedRef = useRef(minimized);
  const aiIsStreamingRef = useRef(aiIsStreaming);
  const onSendAiMessageRef = useRef(onSendAiMessage);
  const uiLocaleRef = useRef(uiLocale);
  const windowRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const lastOpenedPendingRef = useRef<unknown>(null);
  const restoreRectRef = useRef<ChatWindowRect | null>(null);
  const maximizedRef = useRef(maximized);
  const layoutStateRef = useRef<ChatWindowPointerInteractionState>({
    open,
    minimized,
    maximized,
    position,
    size,
  });

  openRef.current = open;
  minimizedRef.current = minimized;
  maximizedRef.current = maximized;
  aiIsStreamingRef.current = aiIsStreaming;
  onSendAiMessageRef.current = onSendAiMessage;
  uiLocaleRef.current = uiLocale;
  layoutStateRef.current = { open, minimized, maximized, position, size };

  const pointerHandlersRef = useRef(
    createChatWindowPointerInteractionHandlers(
      { dragSession: dragStartRef, resizeSession: resizeStartRef },
      () => layoutStateRef.current,
      { setPosition, setSize, setDragging, setResizing },
    ),
  );

  useEffect(() => {
    setIsMounted(typeof document !== 'undefined');
    if (typeof window === 'undefined') return;
    const openHub = () => {
      setOpen(true);
      setMinimized(false);
    };
    const onAgentLoopResume = (event: Event) => {
      openHub();
      const detail = (event as CustomEvent<{ taskId?: string }>).detail;
      const taskId = typeof detail?.taskId === 'string' ? detail.taskId.trim() : '';
      if (taskId.length > 0) {
        window.sessionStorage.setItem(AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY, taskId);
      }
      if (aiIsStreamingRef.current === true) return;
      void onSendAiMessageRef.current?.(
        t(uiLocaleRef.current, 'ai.alerts.agentLoopResumeDefaultInput'),
      );
    };
    window.addEventListener(OPEN_APPROVAL_CENTER_EVENT, openHub);
    window.addEventListener(REQUEST_AGENT_LOOP_RESUME_EVENT, onAgentLoopResume);
    return () => {
      window.removeEventListener(OPEN_APPROVAL_CENTER_EVENT, openHub);
      window.removeEventListener(REQUEST_AGENT_LOOP_RESUME_EVENT, onAgentLoopResume);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || layoutInitialized) return;
    if (maximizedRef.current) {
      setLayoutInitialized(true);
      return;
    }
    const stored = readStoredChatWindowLayout(window.innerWidth, window.innerHeight);
    if (stored) {
      if (typeof stored.open === 'boolean') setOpen(stored.open);
      setMinimized(stored.minimized);
      setSize(stored.size);
      if (stored.position) {
        setPosition(stored.position);
        setLayoutInitialized(true);
        return;
      }
    }
    const defaultLayout = getDefaultChatWindowLayout(window.innerWidth, window.innerHeight);
    setPosition(defaultLayout.position);
    setSize(defaultLayout.size);
    setLayoutInitialized(true);
  }, [layoutInitialized]);

  useEffect(() => {
    if (!layoutInitialized || typeof window === 'undefined') return;
    const persistRect = resolveChatWindowPersistedRect(maximized, restoreRectRef.current, {
      position,
      size,
    });
    writeStoredChatWindowLayout({
      open,
      minimized,
      x: persistRect.position.x,
      y: persistRect.position.y,
      width: persistRect.size.width,
      height: persistRect.size.height,
    });
  }, [layoutInitialized, maximized, minimized, open, position, size]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      if (open && !minimized) {
        const input = windowRef.current?.querySelector<HTMLInputElement>(
          '.ai-chat-input.ai-chat-input-composer',
        );
        input?.focus();
      } else if (!open) {
        triggerRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, minimized]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveChatWindowKeyboardAction(
        openRef.current,
        minimizedRef.current,
        event.key,
        event.metaKey,
        event.ctrlKey,
        event.shiftKey,
      );
      if (action === 'none') return;
      event.preventDefault();
      applyChatWindowKeyboardAction(action, { setOpen, setMinimized });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMounted]);

  useEffect(() => {
    if (!layoutInitialized || typeof window === 'undefined') return;
    const handleResize = () => {
      const next = resolveChatWindowViewportLayout(
        maximizedRef.current,
        {
          position: layoutStateRef.current.position,
          size: layoutStateRef.current.size,
        },
        minimizedRef.current,
        window.innerWidth,
        window.innerHeight,
      );
      setSize(next.size);
      setPosition(next.position);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [layoutInitialized]);

  useEffect(() => {
    if (!layoutInitialized) return;
    if (pendingToolCall == null) {
      lastOpenedPendingRef.current = null;
      return;
    }
    if (lastOpenedPendingRef.current === pendingToolCall) return;
    lastOpenedPendingRef.current = pendingToolCall;
    setOpen(true);
    setMinimized(false);
  }, [layoutInitialized, pendingToolCall]);

  const {
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleResizePointerDown,
    handleResizePointerMove,
    stopDragging,
    stopResizing,
  } = pointerHandlersRef.current;

  const handleOpenWindow = () => {
    setOpen(true);
    setMinimized(false);
  };

  const toggleMaximized = () => {
    if (typeof window === 'undefined') return;
    const next = resolveChatWindowMaximizeToggle(
      maximizedRef.current,
      restoreRectRef.current,
      {
        position: layoutStateRef.current.position,
        size: layoutStateRef.current.size,
      },
      minimizedRef.current,
      window.innerWidth,
      window.innerHeight,
    );
    restoreRectRef.current = next.restoreRect;
    maximizedRef.current = next.maximized;
    setMaximized(next.maximized);
    setMinimized(next.minimized);
    setSize(next.size);
    setPosition(next.position);
  };

  return {
    dragging,
    handleHeaderPointerDown: (event: ReactPointerEvent<HTMLElement>) =>
      handleHeaderPointerDown(event),
    handleHeaderPointerMove: (event: ReactPointerEvent<HTMLElement>) =>
      handleHeaderPointerMove(event),
    handleOpenWindow,
    handleResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) =>
      handleResizePointerDown(event),
    handleResizePointerMove: (event: ReactPointerEvent<HTMLDivElement>) =>
      handleResizePointerMove(event),
    isMounted,
    maximized,
    minimized,
    open,
    position,
    resizing,
    setMinimized,
    setOpen,
    size,
    stopDragging,
    stopResizing,
    toggleMaximized,
    triggerRef,
    windowRef,
  };
}
