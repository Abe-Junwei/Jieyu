import { Suspense, lazy, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
import { OPEN_APPROVAL_CENTER_EVENT } from '../ai/tasks/taskRefreshEvents';

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

type ChatWindowLayoutState = {
  open: boolean;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function TranscriptionPageChatWindow({
  locale,
  assistantRuntimeProps,
}: TranscriptionPageChatWindowProps) {
  const uiLocale = normalizeLocale(locale) ?? 'zh-CN';
  const isZh = uiLocale === 'zh-CN';
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
  const windowRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogId = useMemo(() => `ai-chat-window-${Math.random().toString(36).slice(2, 9)}`, []);
  const windowTitleId = `${dialogId}-title`;
  const title = useMemo(() => t(uiLocale, 'ai.chat.title').replace(/\s*[（(]MVP[）)]\s*/gi, ''), [uiLocale]);
  const aiChatState = assistantRuntimeProps.aiChatContextValue;
  const dormantVoiceContextValue = useMemo(
    () => pickVoiceAgentContextValue(DEFAULT_VOICE_AGENT_CONTEXT_VALUE),
    [],
  );
  const aiAssistantHubContextValue = useMemo(
    () => pickAiAssistantHubContextValue(aiChatState, dormantVoiceContextValue),
    [aiChatState, dormantVoiceContextValue],
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

  useEffect(() => {
    setIsMounted(typeof document !== 'undefined');
  }, []);

  // 审批中心深度联动：监听来自任务列表的「查看审批」事件，打开浮窗 | Deep-link from task list to approval center
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      setOpen(true);
      setMinimized(false);
    };
    window.addEventListener(OPEN_APPROVAL_CENTER_EVENT, handler);
    return () => window.removeEventListener(OPEN_APPROVAL_CENTER_EVENT, handler);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || layoutInitialized) return;
    const raw = window.localStorage.getItem(CHAT_WINDOW_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<ChatWindowLayoutState>;
        if (typeof parsed.open === 'boolean') setOpen(parsed.open);
        if (typeof parsed.minimized === 'boolean') setMinimized(parsed.minimized);
        if (typeof parsed.width === 'number' && typeof parsed.height === 'number') {
          setSize({
            width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed.width)),
            height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed.height)),
          });
        }
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition({ x: parsed.x, y: parsed.y });
          setLayoutInitialized(true);
          return;
        }
      } catch {
        // ignore malformed cache
      }
    }
    const width = Math.min(480, window.innerWidth - 28);
    const height = Math.min(Math.floor(window.innerHeight * 0.72), 760);
    setPosition({
      x: Math.max(14, window.innerWidth - width - 16),
      y: Math.max(14, window.innerHeight - height - 16),
    });
    setSize({ width, height });
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
    if (!open || minimized || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      const input = windowRef.current?.querySelector<HTMLInputElement>('.ai-chat-input.ai-chat-input-composer');
      input?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, minimized]);

  useEffect(() => {
    if (open || typeof window === 'undefined') return;
    const timer = window.setTimeout(() => triggerRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!isMounted || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const isToggle = (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'j';
      if (isToggle) {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setMinimized(false);
        } else if (minimized) {
          setMinimized(false);
        } else {
          setMinimized(true);
        }
        return;
      }
      if (event.key === 'Escape' && open && !minimized) {
        event.preventDefault();
        setMinimized(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMounted, minimized, open]);

  const clampPosition = (x: number, y: number): { x: number; y: number } => {
    if (typeof window === 'undefined') return { x, y };
    const panelWidth = size.width;
    const panelHeight = minimized ? 44 : size.height;
    const maxX = Math.max(14, window.innerWidth - panelWidth - 14);
    const maxY = Math.max(14, window.innerHeight - panelHeight - 14);
    return {
      x: Math.min(Math.max(14, x), maxX),
      y: Math.min(Math.max(14, y), maxY),
    };
  };

  const clampSize = (width: number, height: number): { width: number; height: number } => {
    if (typeof window === 'undefined') {
      return { width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)), height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)) };
    }
    const maxW = Math.min(MAX_WIDTH, window.innerWidth - 28);
    const maxH = Math.min(MAX_HEIGHT, window.innerHeight - 28);
    return {
      width: Math.min(maxW, Math.max(MIN_WIDTH, width)),
      height: Math.min(maxH, Math.max(MIN_HEIGHT, height)),
    };
  };

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
