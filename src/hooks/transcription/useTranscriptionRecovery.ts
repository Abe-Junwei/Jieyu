import { useRef } from 'react';
import { saveRecoverySnapshot } from '../../services/SnapshotService';
import { fireAndForget } from '../../utils/fireAndForget';
import { useDebouncedCallback } from '../ui/useDebouncedCallback';

export function useTranscriptionRecoverySnapshotScheduler() {
  const dbNameRef = useRef<string | undefined>(undefined);
  const dirtyRef = useRef(false);

  const recoverySave = useDebouncedCallback(() => {
    if (!dirtyRef.current) return;
    const name = dbNameRef.current;
    if (!name) return;
    fireAndForget(saveRecoverySnapshot(name), {
      context: 'src/hooks/transcription/useTranscriptionRecovery.ts:L16',
      policy: 'background',
    });
  }, 3000);

  const scheduleRecoverySave = recoverySave.run;

  return {
    dbNameRef,
    dirtyRef,
    recoverySave,
    scheduleRecoverySave,
  };
}
