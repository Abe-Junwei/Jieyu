import { createDesktopClient } from '../app/desktopProjectReadPageAccess';
import type { DesktopReadHost } from '../desktop/projectReadHost';
import { t, type Locale } from '../i18n';
import {
  speakerFilterRevision,
  writeScopeArgs,
  type SpeakerFilterState,
} from './desktopTranscriptionSpeakerFilter';

export function confirmCreateAndAssignSpeaker(input: {
  name: string;
  sessionId: string | null;
  manuscriptId: string | null;
  desktopCall: DesktopReadHost['desktopCall'] | undefined;
  unitIds: readonly string[];
  speakerFilter: SpeakerFilterState;
  revisionAtOpen: string;
  locale: Locale;
  showToast: (message: string, kind?: 'error' | 'success' | 'info' | 'warning') => void;
  refresh: () => Promise<unknown>;
  close: () => void;
}): void {
  const name = input.name.trim();
  if (name.length === 0 || input.sessionId === null || input.desktopCall === undefined) return;
  if (input.unitIds.length === 0) {
    input.showToast(
      t(input.locale, 'app.desktopTranscription.createAndAssignNeedSelection'),
      'error',
    );
    return;
  }
  if (speakerFilterRevision(input.speakerFilter) !== input.revisionAtOpen) {
    input.showToast(t(input.locale, 'app.desktopTranscription.mergeStale'), 'error');
    input.close();
    return;
  }
  const api = createDesktopClient({ desktopCall: input.desktopCall });
  const scope = writeScopeArgs(input.manuscriptId, input.speakerFilter, input.unitIds);
  void api
    .createAndAssignSpeaker(input.sessionId, { name, unitIds: [...input.unitIds], ...scope })
    .then(() => {
      input.showToast(t(input.locale, 'app.desktopTranscription.speakerAssignedUndo'), 'success');
      input.close();
      return input.refresh();
    })
    .catch(() =>
      input.showToast(t(input.locale, 'app.desktopTranscription.metadataFailed'), 'error'),
    );
}
