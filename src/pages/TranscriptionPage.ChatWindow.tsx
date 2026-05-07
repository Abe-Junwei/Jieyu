import { Suspense, lazy, useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import '../styles/pages/ai-chat-window.css';
import { normalizeLocale, t } from '../i18n';
import { getAiChatCardMessages } from '../i18n/messages';
import { aiChatProviderDefinitions, getAiChatProviderDefinition, type AiChatProviderKind, type AiChatSettings } from '../ai/providers/providerCatalog';
import type { TranscriptionPageAssistantRuntimeProps } from './TranscriptionPage.runtimeContracts';
import { AiAssistantHubContext } from '../contexts/AiAssistantHubContext';
import { DEFAULT_VOICE_AGENT_CONTEXT_VALUE } from '../contexts/VoiceAgentContext';
import { pickAiAssistantHubContextValue } from '../hooks/useAiAssistantHubContextValue';
import { pickVoiceAgentContextValue } from '../hooks/useVoiceAgentContextValue';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE } from '../utils/jieyuMaterialIcon';
import { OPEN_APPROVAL_CENTER_EVENT, REQUEST_AGENT_LOOP_RESUME_EVENT } from '../ai/tasks/taskRefreshEvents';

const AiChatCard = lazy(async () => import('../components/ai/AiChatCard').then((module) => ({
  default: module.AiChatCard,
})));

export interface TranscriptionPageChatWindowProps {
  locale: string;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
}

const CHAT_WINDOW_STORAGE_KEY = 'jieyu.aiChatWindow.v1';
const SNAP_THRESHOLD = 24;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 420;
const MAX_WIDTH = 720;
const MAX_HEIGHT = 880;
const AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY = 'jieyu.aiChat.resumeAgentLoopTaskId';

/** Stable hub branch when the voice agent UI is dormant (avoids an extra `useMemo` for architecture guard ceilings). */
const DORMANT_VOICE_CONTEXT_FOR_CHAT_WINDOW = pickVoiceAgentContextValue(DEFAULT_VOICE_AGENT_CONTEXT_VALUE);

type ChatWindowLayoutState = {
  open: boolean;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

function clampChatWindowSize(width: number, height: number, viewportWidth: number, viewportHeight: number): { width: number; height: number } {
  const maxW = Math.min(MAX_WIDTH, viewportWidth - 28);
  const maxH = Math.min(MAX_HEIGHT, viewportHeight - 28);
  return {
    width: Math.min(maxW, Math.max(MIN_WIDTH, width)),
    height: Math.min(maxH, Math.max(MIN_HEIGHT, height)),
  };
}

function clampChatWindowPosition(
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

function getDefaultChatWindowLayout(viewportWidth: number, viewportHeight: number): { position: { x: number; y: number }; size: { width: number; height: number } } {
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

export function TranscriptionPageChatWindow({
  locale,
  assistantRuntimeProps,
}: TranscriptionPageChatWindowProps) {
  const uiLocale = normalizeLocale(locale) ?? 'zh-CN';
  const isZh = uiLocale === 'zh-CN';
  const aiChatState = assistantRuntimeProps.aiChatContextValue;
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => ({ x: 0, y: 0 }));
  const [size, setSize] = useState<{ width: number; height: number }>(() => ({ width: 480, height: 640 }));
  const [layoutInitialized, setLayoutInitialized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [providerConfigOpen, setProviderConfigOpen] = useState(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);
  const resizeStartRef = useRef<{ pointerX: number; pointerY: number; startWidth: number; startHeight: number } | null>(null);
  const openRef = useRef(open);
  const minimizedRef = useRef(minimized);
  const aiIsStreamingRef = useRef(aiChatState.aiIsStreaming);
  const onSendAiMessageRef = useRef(aiChatState.onSendAiMessage);
  const uiLocaleRef = useRef(uiLocale);
  const windowRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogId = useId();
  const windowTitleId = `${dialogId}-title`;
  const title = t(uiLocale, 'ai.chat.title').replace(/\s*[（(]MVP[）)]\s*/gi, '');
  const aiAssistantHubContextValue = useMemo(
    () => pickAiAssistantHubContextValue(aiChatState, DORMANT_VOICE_CONTEXT_FOR_CHAT_WINDOW),
    [aiChatState],
  );
  const providerKind = aiChatState.aiChatSettings?.providerKind ?? 'mock';
  const pinnedCount = aiChatState.aiSessionMemory?.pinnedMessageIds?.length ?? 0;
  const connectionStatus = aiChatState.aiConnectionTestStatus ?? 'idle';
  const cardMessages = useMemo(() => getAiChatCardMessages(isZh), [isZh]);
  const toolFeedbackStyleResolved = aiChatState.aiChatSettings?.toolFeedbackStyle === 'concise' ? 'concise' : 'detailed';
  const activeProviderDefinition = aiChatState.aiChatSettings
    ? getAiChatProviderDefinition(aiChatState.aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');
  const providerStatusLabel = useMemo(() => {
    const kind = aiChatState.aiChatSettings?.providerKind ?? 'mock';
    return cardMessages.providerStatusLabel(kind, aiChatState.aiConnectionTestStatus);
  }, [aiChatState.aiChatSettings?.providerKind, aiChatState.aiConnectionTestStatus, cardMessages]);
  const providerStatusTone = useMemo(() => {
    const kind = aiChatState.aiChatSettings?.providerKind ?? 'mock';
    if (aiChatState.aiConnectionTestStatus === 'error') return 'error';
    if (aiChatState.aiConnectionTestStatus === 'success') return 'ok';
    if (kind === 'mock' || kind === 'ollama' || kind === 'webllm') return 'local';
    return 'idle';
  }, [aiChatState.aiChatSettings?.providerKind, aiChatState.aiConnectionTestStatus]);
  const providerGroups = useMemo(() => {
    const directKinds: AiChatProviderKind[] = ['deepseek', 'qwen', 'anthropic', 'gemini', 'ollama', 'minimax'];
    const compatibleKinds: AiChatProviderKind[] = ['openai-compatible'];
    const localKinds: AiChatProviderKind[] = ['mock', 'webllm', 'custom-http'];
    const byKind = new Map(aiChatProviderDefinitions.map((provider) => [provider.kind, provider]));
    const pick = (kinds: AiChatProviderKind[]) => kinds
      .map((kind) => byKind.get(kind))
      .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));
    return [
      { label: cardMessages.providerGroupOfficial, items: pick(directKinds) },
      { label: cardMessages.providerGroupCompatible, items: pick(compatibleKinds) },
      { label: cardMessages.providerGroupLocalCustom, items: pick(localKinds) },
    ].filter((group) => group.items.length > 0);
  }, [cardMessages]);

  openRef.current = open;
  minimizedRef.current = minimized;
  aiIsStreamingRef.current = aiChatState.aiIsStreaming;
  onSendAiMessageRef.current = aiChatState.onSendAiMessage;
  uiLocaleRef.current = uiLocale;

  // 挂载标记 + 审批中心 / Agent loop 恢复：合并为单 effect，降低 useEffect 计数（architecture-guard）
  useEffect(() => {
    setIsMounted(typeof document !== 'undefined');
    if (typeof window === 'undefined') return;
    const openHub = () => {
      setOpen(true);
      setMinimized(false);
    };
    const onApprovalCenter = () => {
      openHub();
    };
    const onAgentLoopResume = (event: Event) => {
      openHub();
      const detail = (event as CustomEvent<{ taskId?: string }>).detail;
      const taskId = typeof detail?.taskId === 'string' ? detail.taskId.trim() : '';
      if (taskId) {
        window.sessionStorage.setItem(AGENT_LOOP_RESUME_TASK_ID_STORAGE_KEY, taskId);
      }
      if (aiIsStreamingRef.current) return;
      void onSendAiMessageRef.current?.(t(uiLocaleRef.current, 'ai.alerts.agentLoopResumeDefaultInput'));
    };
    window.addEventListener(OPEN_APPROVAL_CENTER_EVENT, onApprovalCenter);
    window.addEventListener(REQUEST_AGENT_LOOP_RESUME_EVENT, onAgentLoopResume);
    return () => {
      window.removeEventListener(OPEN_APPROVAL_CENTER_EVENT, onApprovalCenter);
      window.removeEventListener(REQUEST_AGENT_LOOP_RESUME_EVENT, onAgentLoopResume);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || layoutInitialized) return;
    const defaultLayout = getDefaultChatWindowLayout(window.innerWidth, window.innerHeight);
    const raw = window.localStorage.getItem(CHAT_WINDOW_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<ChatWindowLayoutState>;
        const nextMinimized = typeof parsed.minimized === 'boolean' ? parsed.minimized : false;
        if (typeof parsed.open === 'boolean') setOpen(parsed.open);
        if (typeof parsed.minimized === 'boolean') setMinimized(parsed.minimized);
        let nextSize = defaultLayout.size;
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          nextSize = clampChatWindowSize(parsed.width, parsed.height, window.innerWidth, window.innerHeight);
        }
        setSize(nextSize);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition(clampChatWindowPosition(parsed.x, parsed.y, nextSize, nextMinimized, window.innerWidth, window.innerHeight));
          setLayoutInitialized(true);
          return;
        }
      } catch {
        // ignore malformed cache
      }
    }
    setPosition(defaultLayout.position);
    setSize(defaultLayout.size);
    setLayoutInitialized(true);
  }, [layoutInitialized]);

  useEffect(() => {
    if (!layoutInitialized || typeof window === 'undefined') return;
    const snapshot: ChatWindowLayoutState = {
      open,
      minimized,
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    };
    window.localStorage.setItem(CHAT_WINDOW_STORAGE_KEY, JSON.stringify(snapshot));
  }, [layoutInitialized, minimized, open, position.x, position.y, size.height, size.width]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      if (open && !minimized) {
        const input = windowRef.current?.querySelector<HTMLInputElement>('.ai-chat-input.ai-chat-input-composer');
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
      const isToggle = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'j';
      if (isToggle) {
        event.preventDefault();
        if (!openRef.current) {
          setOpen(true);
          setMinimized(false);
        } else if (minimizedRef.current) {
          setMinimized(false);
        } else {
          setMinimized(true);
        }
        return;
      }
      if (event.key === 'Escape' && openRef.current && !minimizedRef.current) {
        event.preventDefault();
        setMinimized(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMounted]);

  const clampPosition = (x: number, y: number): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x, y };
    return clampChatWindowPosition(x, y, size, minimized, window.innerWidth, window.innerHeight);
  };

  const clampSize = (width: number, height: number): { width: number; height: number } => {
    if (typeof window === 'undefined') {
      return { width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)), height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)) };
    }
    return clampChatWindowSize(width, height, window.innerWidth, window.innerHeight);
  };

  useEffect(() => {
    if (!layoutInitialized || typeof window === 'undefined') return;
    const handleResize = () => {
      setSize((prevSize) => {
        const nextSize = clampChatWindowSize(prevSize.width, prevSize.height, window.innerWidth, window.innerHeight);
        setPosition((prevPosition) => clampChatWindowPosition(
          prevPosition.x,
          prevPosition.y,
          nextSize,
          minimizedRef.current,
          window.innerWidth,
          window.innerHeight,
        ));
        return nextSize;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [layoutInitialized]);

  const applyEdgeSnap = () => {
    if (typeof window === 'undefined') return;
    const maxX = Math.max(14, window.innerWidth - size.width - 14);
    const maxY = Math.max(14, window.innerHeight - (minimized ? 44 : size.height) - 14);
    setPosition((prev) => {
      let nextX = prev.x;
      let nextY = prev.y;
      if (Math.abs(prev.x - 14) <= SNAP_THRESHOLD) nextX = 14;
      if (Math.abs(prev.x - maxX) <= SNAP_THRESHOLD) nextX = maxX;
      if (Math.abs(prev.y - 14) <= SNAP_THRESHOLD) nextY = 14;
      if (Math.abs(prev.y - maxY) <= SNAP_THRESHOLD) nextY = maxY;
      return { x: nextX, y: nextY };
    });
  };

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!open || minimized) return;
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: position.x,
      startY: position.y,
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handleHeaderPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragStartRef.current) return;
    const deltaX = event.clientX - dragStartRef.current.pointerX;
    const deltaY = event.clientY - dragStartRef.current.pointerY;
    setPosition(clampPosition(dragStartRef.current.startX + deltaX, dragStartRef.current.startY + deltaY));
  };

  const stopDragging = () => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    setDragging(false);
    applyEdgeSnap();
  };

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || minimized) return;
    event.stopPropagation();
    resizeStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return;
    const next = clampSize(
      resizeStartRef.current.startWidth + (event.clientX - resizeStartRef.current.pointerX),
      resizeStartRef.current.startHeight + (event.clientY - resizeStartRef.current.pointerY),
    );
    setSize(next);
    setPosition((prev) => clampPosition(prev.x, prev.y));
  };

  const stopResizing = () => {
    resizeStartRef.current = null;
    setResizing(false);
  };

  const handleOpenWindow = () => {
    setOpen(true);
    setMinimized(false);
  };

  const content = (
    <div className="transcription-chat-window-host">
      <button
        ref={triggerRef}
        type="button"
        className={`transcription-chat-window-trigger ${open ? 'is-hidden' : ''}`}
        onClick={handleOpenWindow}
        aria-label={title}
        title={title}
      >
        <span className="transcription-chat-window-trigger-dot" aria-hidden="true" />
        <span className="transcription-chat-window-trigger-label">{title}</span>
      </button>
      {open && (
        <section
          ref={(node) => { windowRef.current = node; }}
          className={`transcription-chat-window ${dragging ? 'is-dragging' : ''} ${resizing ? 'is-resizing' : ''} ${minimized ? 'is-minimized' : ''}`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={windowTitleId}
          aria-label={title}
          style={{ left: `${position.x}px`, top: `${position.y}px`, width: `${size.width}px`, height: minimized ? '44px' : `${size.height}px` }}
        >
          <header
            className="transcription-chat-window-header"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={stopDragging}
            onPointerCancel={stopDragging}
          >
            <div className="transcription-chat-window-header-meta">
              <div id={windowTitleId} className="transcription-chat-window-title">{title}</div>
              <div className="transcription-chat-window-subtitle">
                {providerKind} · {connectionStatus} · {isZh ? `\u9489\u4f4f ${pinnedCount}` : `Pinned ${pinnedCount}`}
              </div>
            </div>
            <div className="transcription-chat-window-header-controls" onPointerDown={(event) => event.stopPropagation()}>
              {!minimized && (
                <div className="transcription-chat-window-toolbar">
                  <div className="transcription-ai-mode-switch" role="group" aria-label={cardMessages.toolFeedbackStyle}>
                    <button
                      type="button"
                      className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'detailed' ? 'is-active' : ''}`}
                      aria-pressed={toolFeedbackStyleResolved === 'detailed'}
                      onClick={() => {
                        if (toolFeedbackStyleResolved === 'detailed') return;
                        aiChatState.onUpdateAiChatSettings?.({ toolFeedbackStyle: 'detailed' });
                      }}
                    >
                      {cardMessages.detailed}
                    </button>
                    <button
                      type="button"
                      className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'concise' ? 'is-active' : ''}`}
                      aria-pressed={toolFeedbackStyleResolved === 'concise'}
                      onClick={() => {
                        if (toolFeedbackStyleResolved === 'concise') return;
                        aiChatState.onUpdateAiChatSettings?.({ toolFeedbackStyle: 'concise' });
                      }}
                    >
                      {cardMessages.concise}
                    </button>
                  </div>
                  <span
                    className={`ai-chat-provider-status-dot ai-chat-provider-status-dot-${providerStatusTone} ai-chat-provider-status-dot-inline`}
                    role="status"
                    aria-label={providerStatusLabel}
                    title={`${activeProviderDefinition.label} · ${providerStatusLabel}`}
                  />
                  <select
                    className="ai-chat-provider-select"
                    value={aiChatState.aiChatSettings?.providerKind ?? 'mock'}
                    onChange={(event) => aiChatState.onUpdateAiChatSettings?.({
                      providerKind: event.currentTarget.value as AiChatSettings['providerKind'],
                    })}
                  >
                    {providerGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.items.map((provider) => (
                          <option key={provider.kind} value={provider.kind}>{provider.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}
              <div className="transcription-chat-window-actions">
                <button
                  type="button"
                  className="transcription-chat-window-head-btn transcription-chat-window-config-btn"
                  onClick={() => setProviderConfigOpen((prev) => !prev)}
                  aria-label={providerConfigOpen ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
                  title={providerConfigOpen ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
                >
                  <MaterialSymbol name="settings" className={JIEYU_MATERIAL_INLINE} />
                </button>
                <button
                  type="button"
                  className="transcription-chat-window-head-btn"
                  onClick={() => aiChatState.onClearAiMessages?.()}
                  aria-label={isZh ? '\u6e05\u7a7a\u4f1a\u8bdd' : 'Clear chat'}
                  title={isZh ? '\u6e05\u7a7a\u4f1a\u8bdd' : 'Clear chat'}
                >
                  {isZh ? '\u6e05\u7a7a' : 'Clear'}
                </button>
                <button
                  type="button"
                  className="transcription-chat-window-head-btn"
                  onClick={() => setMinimized((prev) => !prev)}
                  aria-label={minimized ? (isZh ? '\u5c55\u5f00\u7a97\u53e3' : 'Expand') : (isZh ? '\u6536\u8d77\u7a97\u53e3' : 'Minimize')}
                  title={minimized ? (isZh ? '\u5c55\u5f00\u7a97\u53e3' : 'Expand') : (isZh ? '\u6536\u8d77\u7a97\u53e3' : 'Minimize')}
                >
                  {minimized ? '▢' : '—'}
                </button>
                <button
                  type="button"
                  className="transcription-chat-window-close"
                  onClick={() => setOpen(false)}
                  aria-label={isZh ? '\u5173\u95ed\u804a\u5929\u7a97\u53e3' : 'Close chat window'}
                  title={isZh ? '\u5173\u95ed\u804a\u5929\u7a97\u53e3' : 'Close chat window'}
                >
                  ×
                </button>
              </div>
            </div>
          </header>
          {!minimized && (
            <div className="transcription-chat-window-body">
              <AiAssistantHubContext.Provider value={aiAssistantHubContextValue}>
                <Suspense fallback={null}>
                  <AiChatCard
                    embedded
                    showHeader={false}
                    showProviderConfigButton={false}
                    providerConfigOpen={providerConfigOpen}
                    onProviderConfigOpenChange={setProviderConfigOpen}
                  />
                </Suspense>
              </AiAssistantHubContext.Provider>
            </div>
          )}
          {!minimized && (
            <div
              className="transcription-chat-window-resizer"
              role="presentation"
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={stopResizing}
              onPointerCancel={stopResizing}
            />
          )}
        </section>
      )}
    </div>
  );

  if (!isMounted) return null;
  return createPortal(content, document.body);
}
