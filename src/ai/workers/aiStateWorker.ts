import {
  AI_STATE_WORKER_DEFAULT_THRESHOLDS,
  buildAiStateWorkerFingerprint,
  computeAiStateWorkerSignalWeight,
  type AiStateWorkerRequest,
  type AiStateWorkerResponse,
  type AiStateWorkerSlice,
} from './aiStateWorkerProtocol';

type AiStateWorkerScope = {
  onmessage: ((event: MessageEvent<AiStateWorkerRequest>) => void) | null;
  postMessage: (message: AiStateWorkerResponse) => void;
};

const workerScope = self as unknown as AiStateWorkerScope;

let latestSlice: AiStateWorkerSlice | null = null;
let lastFingerprint = '';
let lastSignalWeight: number | null = null;
let pendingCharDelta = 0;
let pendingOpCount = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer(): void {
  if (idleTimer != null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function resetPendingCounters(): void {
  pendingCharDelta = 0;
  pendingOpCount = 0;
}

function emitIfFingerprintChanged(slice: AiStateWorkerSlice): void {
  const nextFingerprint = buildAiStateWorkerFingerprint(slice);
  if (nextFingerprint === lastFingerprint) {
    return;
  }
  lastFingerprint = nextFingerprint;
  workerScope.postMessage({
    type: 'fingerprint-updated',
    fingerprint: nextFingerprint,
  });
}

function scheduleIdleFlush(): void {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!latestSlice) {
      return;
    }
    emitIfFingerprintChanged(latestSlice);
    resetPendingCounters();
  }, AI_STATE_WORKER_DEFAULT_THRESHOLDS.idleAfterEditMs);
}

function consumeSlice(slice: AiStateWorkerSlice): void {
  latestSlice = slice;

  const currentSignalWeight = computeAiStateWorkerSignalWeight(slice);
  if (lastSignalWeight != null) {
    pendingCharDelta += Math.abs(currentSignalWeight - lastSignalWeight);
  }
  lastSignalWeight = currentSignalWeight;
  pendingOpCount += 1;

  const reachedThreshold = pendingCharDelta >= AI_STATE_WORKER_DEFAULT_THRESHOLDS.charDelta
    || pendingOpCount >= AI_STATE_WORKER_DEFAULT_THRESHOLDS.opCount;

  if (reachedThreshold) {
    emitIfFingerprintChanged(slice);
    resetPendingCounters();
    clearIdleTimer();
    return;
  }

  scheduleIdleFlush();
}

workerScope.onmessage = (event) => {
  const message = event.data;
  if (!message) {
    return;
  }

  if (message.type === 'state_slice') {
    consumeSlice(message.payload);
    return;
  }

  if (message.type === 'flush') {
    latestSlice = message.payload;
    emitIfFingerprintChanged(message.payload);
    resetPendingCounters();
    clearIdleTimer();
  }
};
