import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeferredTranscriptionAiRuntimeState } from './TranscriptionPage.AssistantBridge';
import { buildAiStateWorkerFingerprint, type AiStateWorkerRequest, type AiStateWorkerResponse, type AiStateWorkerSlice } from '../ai/workers/aiStateWorkerProtocol';
import { buildAiStateWorkerSlice, createInitialDeferredAiRuntimeState } from './TranscriptionPage.ReadyWorkspace.runtime';

export interface DeferredAiRuntimeBridgeResult {
  deferredAiRuntime: DeferredTranscriptionAiRuntimeState;
  deferredAiRuntimeForSidebar: DeferredTranscriptionAiRuntimeState;
  setDeferredAiRuntime: React.Dispatch<React.SetStateAction<DeferredTranscriptionAiRuntimeState>>;
  handleDeferredAiRuntimeChange: (runtimeState: DeferredTranscriptionAiRuntimeState) => void;
  flushDeferredAiRuntime: () => void;
}

export function useDeferredAiRuntimeBridge(): DeferredAiRuntimeBridgeResult {
  const [deferredAiRuntime, setDeferredAiRuntime] = useState<DeferredTranscriptionAiRuntimeState>(() => createInitialDeferredAiRuntimeState());
  /** 与主快照同步；不用 useDeferredValue，避免侧边栏交互晚一帧 */
  const deferredAiRuntimeForSidebar = deferredAiRuntime;

  const aiStateWorkerRef = useRef<Worker | null>(null);
  const latestBridgeRuntimeRef = useRef<DeferredTranscriptionAiRuntimeState>(deferredAiRuntime);
  const latestRuntimeSliceRef = useRef<AiStateWorkerSlice>(buildAiStateWorkerSlice(deferredAiRuntime));
  const fallbackFingerprintRef = useRef<string>(buildAiStateWorkerFingerprint(latestRuntimeSliceRef.current));
  const lastAiChatSettingsFingerprintRef = useRef<string>('');

  const recoverToMainThreadFingerprint = useCallback(() => {
    const worker = aiStateWorkerRef.current;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      aiStateWorkerRef.current = null;
    }
    const nextFingerprint = buildAiStateWorkerFingerprint(latestRuntimeSliceRef.current);
    fallbackFingerprintRef.current = nextFingerprint;
    setDeferredAiRuntime(latestBridgeRuntimeRef.current);
  }, []);

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      return;
    }
    const worker = new Worker(new URL('../ai/workers/aiStateWorker.ts', import.meta.url), { type: 'module' });
    aiStateWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<AiStateWorkerResponse>) => {
      if (event.data?.type !== 'fingerprint-updated') {
        return;
      }
      fallbackFingerprintRef.current = event.data.fingerprint;
      setDeferredAiRuntime(latestBridgeRuntimeRef.current);
    };
    worker.onerror = () => {
      recoverToMainThreadFingerprint();
    };
    worker.onmessageerror = () => {
      recoverToMainThreadFingerprint();
    };
    return () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      aiStateWorkerRef.current = null;
    };
  }, [recoverToMainThreadFingerprint]);

  const handleDeferredAiRuntimeChange = useCallback((runtimeState: DeferredTranscriptionAiRuntimeState) => {
    latestBridgeRuntimeRef.current = runtimeState;
    const nextSlice = buildAiStateWorkerSlice(runtimeState);
    latestRuntimeSliceRef.current = nextSlice;

    const nextSettingsFp = nextSlice.aiChatSettingsFingerprint;
    const settingsFingerprintChanged = lastAiChatSettingsFingerprintRef.current !== nextSettingsFp;
    lastAiChatSettingsFingerprintRef.current = nextSettingsFp;

    const worker = aiStateWorkerRef.current;
    if (worker) {
      const message: AiStateWorkerRequest = { type: 'state_slice', payload: nextSlice };
      try {
        worker.postMessage(message);
      } catch {
        recoverToMainThreadFingerprint();
      }
      // 设置指纹变则立刻 setState；仅依赖 Worker 回传会晚一拍
      if (settingsFingerprintChanged) {
        setDeferredAiRuntime(runtimeState);
      }
      if (aiStateWorkerRef.current) {
        return;
      }
    }

    const nextFingerprint = buildAiStateWorkerFingerprint(nextSlice);
    if (nextFingerprint === fallbackFingerprintRef.current) {
      return;
    }
    fallbackFingerprintRef.current = nextFingerprint;
    setDeferredAiRuntime(runtimeState);
  }, []);

  const flushDeferredAiRuntime = useCallback(() => {
    const latestSlice = latestRuntimeSliceRef.current;
    const worker = aiStateWorkerRef.current;
    if (worker) {
      const flushMessage: AiStateWorkerRequest = { type: 'flush', payload: latestSlice };
      try {
        worker.postMessage(flushMessage);
        return;
      } catch {
        recoverToMainThreadFingerprint();
      }
    }

    const nextFingerprint = buildAiStateWorkerFingerprint(latestSlice);
    if (nextFingerprint === fallbackFingerprintRef.current) {
      return;
    }
    fallbackFingerprintRef.current = nextFingerprint;
    setDeferredAiRuntime(latestBridgeRuntimeRef.current);
  }, [recoverToMainThreadFingerprint]);

  return {
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    setDeferredAiRuntime,
    handleDeferredAiRuntimeChange,
    flushDeferredAiRuntime,
  };
}
