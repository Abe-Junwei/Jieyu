import { useCallback } from 'react';
import { fireAndForget } from '../utils/fireAndForget';

type Params = {
  autoSaveTimersRef: React.MutableRefObject<Record<string, number>>;
};

export function useTranscriptionAutoSaveActions({
  autoSaveTimersRef,
}: Params) {
  const clearAutoSaveTimer = useCallback((key: string) => {
    const timer = autoSaveTimersRef.current[key];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete autoSaveTimersRef.current[key];
    }
  }, [autoSaveTimersRef]);

  const scheduleAutoSave = useCallback((key: string, task: () => Promise<void>) => {
    clearAutoSaveTimer(key);
    autoSaveTimersRef.current[key] = window.setTimeout(() => {
      fireAndForget(task().finally(() => {
        delete autoSaveTimersRef.current[key];
      }));
    }, 550);
  }, [autoSaveTimersRef, clearAutoSaveTimer]);

  return {
    clearAutoSaveTimer,
    scheduleAutoSave,
  };
}