import { useCallback } from 'react';
import { fireAndForget } from '../../utils/fireAndForget';

type Params = {
  autoSaveTimersRef: React.MutableRefObject<Record<string, number>>;
};

export function useTranscriptionAutoSaveActions({ autoSaveTimersRef }: Params) {
  const clearAutoSaveTimer = useCallback(
    (key: string) => {
      const timer = autoSaveTimersRef.current[key];
      if (timer !== undefined) {
        window.clearTimeout(timer);
        delete autoSaveTimersRef.current[key];
      }
    },
    [autoSaveTimersRef],
  );

  const scheduleAutoSave = useCallback(
    (key: string, task: () => Promise<void>) => {
      clearAutoSaveTimer(key);
      const timerId = window.setTimeout(() => {
        // Drop our own record as soon as we fire so an in-flight save cannot
        // erase a newer debounce timer in finally (#504).
        if (autoSaveTimersRef.current[key] === timerId) {
          delete autoSaveTimersRef.current[key];
        }
        fireAndForget(
          task().finally(() => {
            // Only clear if this timer still owns the slot (defensive).
            if (autoSaveTimersRef.current[key] === timerId) {
              delete autoSaveTimersRef.current[key];
            }
          }),
          {
            context: 'src/hooks/transcription/useTranscriptionAutoSaveActions.ts:L22',
            policy: 'background',
          },
        );
      }, 550);
      autoSaveTimersRef.current[key] = timerId;
    },
    [autoSaveTimersRef, clearAutoSaveTimer],
  );

  return {
    clearAutoSaveTimer,
    scheduleAutoSave,
  };
}
