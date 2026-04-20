import type { MediaItemDocType } from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';
import { t } from '../i18n';
import { reportValidationError } from './validationErrorReporter';

export const TIMELINE_MEDIA_REQUIRED_I18N_KEY = 'transcription.error.validation.mediaRequired' as const;

/**
 * 建段、拖选建段、相邻建段等写库路径的统一前置：必须能解析到当前时间轴媒体行（含占位）。
 * Single gate for create-style mutations: timeline media row must be resolved (incl. placeholder).
 */
export function assertTimelineMediaForMutation(
  media: MediaItemDocType | null | undefined,
  input: {
    locale: Locale;
    setSaveState: (state: SaveState) => void;
  },
): media is MediaItemDocType {
  if (media) return true;
  reportValidationError({
    message: t(input.locale, TIMELINE_MEDIA_REQUIRED_I18N_KEY),
    i18nKey: TIMELINE_MEDIA_REQUIRED_I18N_KEY,
    setErrorState: ({ message, meta }) => input.setSaveState({ kind: 'error', message, errorMeta: meta }),
  });
  return false;
}
