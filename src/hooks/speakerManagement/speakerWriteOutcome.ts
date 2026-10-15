import type { SpeakerTranslate } from './speakerI18n';
import type { Dispatch, SetStateAction } from 'react';
import type { LayerUnitDocType } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import type { SaveState } from '../transcription/transcriptionTypes';

export function speakerWriteCopy(t: SpeakerTranslate) {
  return {
    needsCheckMessage: t('transcription.error.action.speakerWriteUnconfirmed'),
    viewStaleMessage: t('transcription.toast.segmentWrittenViewStale'),
    retryLabel: t('transcription.toast.segmentViewRetry'),
  };
}

export async function rereadSpeakerProject(input: {
  projectTextId: string;
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
  refreshSpeakers: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
}): Promise<void> {
  if (input.projectTextId.length > 0) {
    input.setUnits(await LinguisticService.units.listByTextId(input.projectTextId));
  }
  await input.refreshSpeakers();
  await input.refreshSpeakerReferenceStats();
}

/**
 * Speaker writes here are more than one commit, so a thrown error does not
 * prove the database is unchanged. Never undo. Re-read after a write error.
 * A refresh error after a returned write only reloads.
 */
export async function settleSpeakerWrite(input: {
  write: () => Promise<void>;
  refresh: () => Promise<void>;
  reread: () => Promise<void>;
  setSaveState: (state: SaveState) => void;
  doneMessage: () => string;
  needsCheckMessage: string;
  viewStaleMessage: string;
  retryLabel: string;
}): Promise<'written' | 'unconfirmed' | 'view-stale'> {
  try {
    await input.write();
  } catch {
    try {
      await input.reread();
    } catch {
      // The write outcome is already unknown. Keep the needs-check notice.
    }
    input.setSaveState({ kind: 'error', message: input.needsCheckMessage });
    return 'unconfirmed';
  }

  const publish = async (): Promise<'written' | 'view-stale'> => {
    try {
      await input.refresh();
    } catch {
      input.setSaveState({
        kind: 'viewStale',
        message: input.viewStaleMessage,
        actionLabel: input.retryLabel,
        onAction: () => {
          void publish();
        },
      });
      return 'view-stale';
    }
    input.setSaveState({ kind: 'done', message: input.doneMessage() });
    return 'written';
  };

  return publish();
}
