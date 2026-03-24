import { useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TranslationLayerDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { saveRecoverySnapshot } from '../services/SnapshotService';
import { fireAndForget } from '../utils/fireAndForget';
import { useDebouncedCallback } from './useDebouncedCallback';

type Params = {
  utterancesRef: MutableRefObject<UtteranceDocType[]>;
  translationsRef: MutableRefObject<UtteranceTextDocType[]>;
  layersRef: MutableRefObject<TranslationLayerDocType[]>;
};

export function useTranscriptionRecoverySnapshotScheduler({
  utterancesRef,
  translationsRef,
  layersRef,
}: Params) {
  const dbNameRef = useRef<string | undefined>(undefined);
  const dirtyRef = useRef(false);

  const recoverySave = useDebouncedCallback(() => {
    if (!dirtyRef.current) return;
    const name = dbNameRef.current;
    if (!name) return;
    fireAndForget(saveRecoverySnapshot(name, {
      utterances: utterancesRef.current,
      translations: translationsRef.current,
      layers: layersRef.current,
    }));
  }, 3000);

  const scheduleRecoverySave = recoverySave.run;

  return {
    dbNameRef,
    dirtyRef,
    recoverySave,
    scheduleRecoverySave,
  };
}

export function useTranscriptionRecovery(params: Params) {
  return useTranscriptionRecoverySnapshotScheduler(params);
}
