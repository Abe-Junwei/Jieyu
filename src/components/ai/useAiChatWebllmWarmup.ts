import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAiChatProviderDefinition, type AiChatSettings } from '../../ai/providers/providerCatalog';
import { detectWebLLMRuntimeStatus, warmupWebLLMModel, type WebLLMRuntimeStatus, type WebLLMWarmupProgress } from '../../ai/providers/webllmRuntime';
import type { getAiChatCardMessages } from '../../i18n/messages';

type AiChatCardMessages = ReturnType<typeof getAiChatCardMessages>;
type WebllmWarmupState = 'idle' | 'running' | 'success' | 'error';

export function useAiChatWebllmWarmup(input: {
  aiChatSettings: AiChatSettings | null | undefined;
  cardMessages: AiChatCardMessages;
  showProviderConfig: boolean;
}) {
  const { aiChatSettings, cardMessages, showProviderConfig } = input;
  const [webllmRuntimeStatus, setWebllmRuntimeStatus] = useState<WebLLMRuntimeStatus>(() => detectWebLLMRuntimeStatus());
  const [webllmWarmupState, setWebllmWarmupState] = useState<WebllmWarmupState>('idle');
  const [webllmWarmupProgress, setWebllmWarmupProgress] = useState<WebLLMWarmupProgress | null>(null);
  const [webllmWarmupMessage, setWebllmWarmupMessage] = useState<string | null>(null);
  const webllmWarmupAbortRef = useRef<AbortController | null>(null);
  const webllmWarmupRunIdRef = useRef(0);

  const webllmFallbackDefinition = useMemo(() => {
    const fallbackKind = aiChatSettings?.fallbackProviderKind;
    if (!fallbackKind || fallbackKind === 'webllm') {
      return getAiChatProviderDefinition('mock');
    }
    return getAiChatProviderDefinition(fallbackKind);
  }, [aiChatSettings?.fallbackProviderKind]);

  const webllmSourceLabel = useMemo(() => {
    if (webllmRuntimeStatus.source === 'injected-runtime') return cardMessages.webllmRuntimeSourceInjected;
    if (webllmRuntimeStatus.source === 'prompt-api') return cardMessages.webllmRuntimeSourcePromptApi;
    return cardMessages.webllmRuntimeSourceUnavailable;
  }, [cardMessages, webllmRuntimeStatus.source]);

  const refreshWebllmRuntimeStatus = useCallback(() => {
    setWebllmRuntimeStatus(detectWebLLMRuntimeStatus());
  }, []);

  const dispatchWebllmWarmupEvent = useCallback((status: 'success' | 'error' | 'cancelled', message: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('ai:webllm-warmup', {
      detail: { status, message },
    }));
  }, []);

  const webllmWarmupPercent = useMemo(() => {
    if (!webllmWarmupProgress) {
      return webllmWarmupState === 'success' ? 100 : 0;
    }
    return Math.max(0, Math.min(100, Math.round(webllmWarmupProgress.progress * 100)));
  }, [webllmWarmupProgress, webllmWarmupState]);

  const webllmWarmupPhaseLabel = useMemo(() => {
    if (!webllmWarmupProgress) return null;
    if (webllmWarmupProgress.phase === 'downloading') return cardMessages.webllmWarmupPhaseDownloading;
    if (webllmWarmupProgress.phase === 'initializing') return cardMessages.webllmWarmupPhaseInitializing;
    if (webllmWarmupProgress.phase === 'ready') return cardMessages.webllmWarmupPhaseReady;
    return cardMessages.webllmWarmupPhasePreparing;
  }, [cardMessages, webllmWarmupProgress]);

  const webllmWarmupFailureMessage = useCallback((reason?: string | null) => {
    const trimmed = (reason ?? '').trim();
    if (!trimmed) return cardMessages.webllmWarmupFailed;
    const normalized = trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
    return cardMessages.webllmWarmupFailedWithReason(normalized);
  }, [cardMessages]);

  useEffect(() => {
    if (aiChatSettings?.providerKind !== 'webllm') return;
    refreshWebllmRuntimeStatus();
  }, [aiChatSettings?.providerKind, showProviderConfig, refreshWebllmRuntimeStatus]);

  useEffect(() => {
    return () => {
      webllmWarmupAbortRef.current?.abort();
    };
  }, []);

  const handleWarmupWebllmModel = useCallback(async () => {
    if (!aiChatSettings || aiChatSettings.providerKind !== 'webllm') return;
    webllmWarmupAbortRef.current?.abort();
    const runId = webllmWarmupRunIdRef.current + 1;
    webllmWarmupRunIdRef.current = runId;
    const abortController = new AbortController();
    webllmWarmupAbortRef.current = abortController;
    setWebllmWarmupState('running');
    setWebllmWarmupProgress({ phase: 'preparing', progress: 0, message: cardMessages.webllmWarmupPreparing });
    setWebllmWarmupMessage(null);
    try {
      const status = await warmupWebLLMModel(aiChatSettings.model, {
        signal: abortController.signal,
        onProgress: (progress) => {
          if (runId !== webllmWarmupRunIdRef.current) return;
          setWebllmWarmupProgress(progress);
        },
      });
      if (runId !== webllmWarmupRunIdRef.current) return;
      webllmWarmupAbortRef.current = null;
      setWebllmRuntimeStatus(status);
      if (status.available) {
        setWebllmWarmupState('success');
        setWebllmWarmupMessage(cardMessages.webllmWarmupDone);
        setWebllmWarmupProgress({ phase: 'ready', progress: 1, message: cardMessages.webllmWarmupDone });
        dispatchWebllmWarmupEvent('success', cardMessages.webllmWarmupDone);
        return;
      }
      const failedMessage = webllmWarmupFailureMessage(status.detail);
      setWebllmWarmupState('error');
      setWebllmWarmupMessage(failedMessage);
      dispatchWebllmWarmupEvent('error', failedMessage);
    } catch (error) {
      if (runId !== webllmWarmupRunIdRef.current) return;
      webllmWarmupAbortRef.current = null;
      const isAbort = typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError';
      if (isAbort) {
        setWebllmWarmupState('idle');
        setWebllmWarmupProgress(null);
        setWebllmWarmupMessage(cardMessages.webllmWarmupCancelled);
        dispatchWebllmWarmupEvent('cancelled', cardMessages.webllmWarmupCancelled);
        return;
      }
      const failedReason = typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : null;
      const failedMessage = webllmWarmupFailureMessage(failedReason);
      setWebllmWarmupState('error');
      setWebllmWarmupMessage(failedMessage);
      dispatchWebllmWarmupEvent('error', failedMessage);
    }
  }, [aiChatSettings, cardMessages, dispatchWebllmWarmupEvent, webllmWarmupFailureMessage]);

  const handleCancelWebllmWarmup = useCallback(() => {
    if (webllmWarmupState !== 'running') return;
    webllmWarmupRunIdRef.current += 1;
    webllmWarmupAbortRef.current?.abort();
    webllmWarmupAbortRef.current = null;
    setWebllmWarmupState('idle');
    setWebllmWarmupProgress(null);
    setWebllmWarmupMessage(cardMessages.webllmWarmupCancelled);
    dispatchWebllmWarmupEvent('cancelled', cardMessages.webllmWarmupCancelled);
  }, [cardMessages.webllmWarmupCancelled, dispatchWebllmWarmupEvent, webllmWarmupState]);

  return {
    webllmRuntimeStatus,
    webllmWarmupState,
    webllmWarmupMessage,
    webllmFallbackDefinition,
    webllmSourceLabel,
    webllmWarmupPercent,
    webllmWarmupPhaseLabel,
    handleWarmupWebllmModel,
    handleCancelWebllmWarmup,
  };
}