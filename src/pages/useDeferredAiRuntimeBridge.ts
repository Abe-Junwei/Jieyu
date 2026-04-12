import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import type { DeferredTranscriptionAiRuntimeState } from './TranscriptionPage.AssistantBridge';
import {
  buildAiStateWorkerFingerprint,
  type AiStateWorkerRequest,
  type AiStateWorkerResponse,
  type AiStateWorkerSlice,
} from '../ai/workers/aiStateWorkerProtocol';
import {
  buildAiStateWorkerSlice,
  createInitialDeferredAiRuntimeState,
} from './TranscriptionPage.ReadyWorkspace.runtime';

export interface DeferredAiRuntimeBridgeResult {
  deferredAiRuntime: DeferredTranscriptionAiRuntimeState;
  deferredAiRuntimeForSidebar: DeferredTranscriptionAiRuntimeState;
  setDeferredAiRuntime: React.Dispatch<React.SetStateAction<DeferredTranscriptionAiRuntimeState>>;
  handleDeferredAiRuntimeChange: (runtimeState: DeferredTranscriptionAiRuntimeState) => void;
  flushDeferredAiRuntime: () => void;
}

export function useDeferredAiRuntimeBridge(): DeferredAiRuntimeBridgeResult {
  const [deferredAiRuntime, setDeferredAiRuntime] = useState<DeferredTranscriptionAiRuntimeState>(() => createInitialDeferredAiRuntimeState());
  const deferredAiRuntimeForSidebar = useDeferredValue(deferredAiRuntime);

  const aiStateWorkerRef = useRef<Worker | null>(null);
  const latestBridgeRuntimeRef = useRef<DeferredTranscriptionAiRuntimeState>(deferredAiRuntime);
  const latestRuntimeSliceRef = useRef<AiStateWorkerSlice>(buildAiStateWorkerSlice(deferredAiRuntime));
  const fallbackFingerprintRef = useRef<string>(buildAiStateWorkerFingerprint(latestRuntimeSliceRef.current));

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
    return () => {
      worker.onmessage = null;
      worker.terminate();
      aiStateWorkerRef.current = null;
    };
  }, []);

  const handleDeferredAiRuntimeChange = useCallback((runtimeState: DeferredTranscriptionAiRuntimeState) => {
    latestBridgeRuntimeRef.current = runtimeState;
    const nextSlice = buildAiStateWorkerSlice(runtimeState);
    latestRuntimeSliceRef.current = nextSlice;

    const worker = aiStateWorkerRef.current;
    if (worker) {
      const message: AiStateWorkerRequest = { type: 'state_slice', payload: nextSlice };
      worker.postMessage(message);
      return;
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
      worker.postMessage(flushMessage);
      return;
    }

    const nextFingerprint = buildAiStateWorkerFingerprint(latestSlice);
    if (nextFingerprint === fallbackFingerprintRef.current) {
      return;
    }
    fallbackFingerprintRef.current = nextFingerprint;
    setDeferredAiRuntime(latestBridgeRuntimeRef.current);
  }, []);

  return {
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    setDeferredAiRuntime,
    handleDeferredAiRuntimeChange,
    flushDeferredAiRuntime,
  };
}
