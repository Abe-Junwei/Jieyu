import type { VoiceSession } from './IntentRouter';
import type { VoiceAgentServiceState } from './VoiceAgentService.types';

interface Stoppable {
  stop: () => void;
}

interface Disposable {
  dispose: () => void;
}

interface VoiceServiceLike extends Stoppable, Disposable {
  releaseSharedAnalysisStream: () => void;
}

export async function cancelVoiceAgentExclusiveStart(input: {
  bumpActivateToken: () => void;
  getExclusiveStartPromise: () => Promise<void> | null;
  clearExclusiveStartPromise: () => void;
}): Promise<void> {
  input.bumpActivateToken();
  const pendingExclusiveStart = input.getExclusiveStartPromise();
  input.clearExclusiveStartPromise();
  if (!pendingExclusiveStart) return;
  try {
    await pendingExclusiveStart;
  } catch {
    // _runExclusiveStart may reject during shutdown race; keep teardown path stable.
  }
}

export function restoreVoiceAgentRecentSession(input: {
  loadRecentVoiceSessions: (limit: number) => Promise<VoiceSession[]>;
  onSessionRestored: (session: VoiceSession) => void;
  onRestoreError: (err: unknown) => void;
}): void {
  void input
    .loadRecentVoiceSessions(1)
    .then(([recent]) => {
      if (recent && recent.entries.length > 0) {
        input.onSessionRestored(recent);
      }
    })
    .catch((err) => {
      input.onRestoreError(err);
    });
}

export function persistVoiceAgentSessionOnDeactivate(input: {
  session: VoiceSession;
  saveSession: (session: VoiceSession) => Promise<void>;
  onPersistError: (err: unknown) => void;
}): void {
  if (input.session.entries.length <= 0) return;
  void input.saveSession(input.session).catch((err) => {
    input.onPersistError(err);
  });
}

export async function runVoiceAgentStopFlow(input: {
  cancelAndWaitExclusiveStart: () => Promise<void>;
  dictationController: Stoppable;
  clearRecordingDurationTimer: () => void;
  speechQuality: Stoppable | null;
  voiceService: VoiceServiceLike | null;
  setState: (partial: Partial<VoiceAgentServiceState>) => void;
  session: VoiceSession;
  saveSession: (session: VoiceSession) => Promise<void>;
  onPersistError: (err: unknown) => void;
  playDeactivate: () => void;
}): Promise<void> {
  await input.cancelAndWaitExclusiveStart();
  input.dictationController.stop();
  input.clearRecordingDurationTimer();
  input.speechQuality?.stop();
  input.voiceService?.releaseSharedAnalysisStream();
  input.voiceService?.stop();
  input.setState({
    listening: false,
    speechActive: false,
    interimText: '',
    pendingConfirm: null,
    agentState: 'idle',
  });

  persistVoiceAgentSessionOnDeactivate({
    session: input.session,
    saveSession: input.saveSession,
    onPersistError: input.onPersistError,
  });

  input.playDeactivate();
}

export async function runVoiceAgentDisposeFlow<T>(input: {
  cancelAndWaitExclusiveStart: () => Promise<void>;
  removeVisibilityListener: () => void;
  ambientUnsubscribe: (() => void) | null;
  dictationController: Stoppable;
  voiceService: VoiceServiceLike | null;
  clearVoiceServiceRef: () => void;
  speechQuality: Stoppable | null;
  stopWakeWordDetector: () => void;
  clearRecordingDurationTimer: () => void;
  subscriptions: Map<T, (...args: unknown[]) => void>;
  removeStateListener: (handler: T) => void;
  removeAllListeners: () => void;
}): Promise<void> {
  await input.cancelAndWaitExclusiveStart();
  input.removeVisibilityListener();
  input.ambientUnsubscribe?.();
  input.dictationController.stop();
  input.voiceService?.dispose();
  input.voiceService?.releaseSharedAnalysisStream();
  input.clearVoiceServiceRef();
  input.speechQuality?.stop();
  input.stopWakeWordDetector();
  input.clearRecordingDurationTimer();
  cleanupVoiceAgentTrackedSubscriptions({
    subscriptions: input.subscriptions,
    removeStateListener: input.removeStateListener,
  });
  input.removeAllListeners();
}

export function cleanupVoiceAgentTrackedSubscriptions<T>(input: {
  subscriptions: Map<T, (...args: unknown[]) => void>;
  removeStateListener: (handler: T) => void;
}): void {
  const handlers = Array.from(input.subscriptions.keys());
  for (const handler of handlers) {
    input.removeStateListener(handler);
  }
  input.subscriptions.clear();
}
