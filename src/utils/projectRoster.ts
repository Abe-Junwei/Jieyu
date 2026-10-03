import type { Locale } from '../i18n';
import { LinguisticService } from '../services/LinguisticService';
import { pickTextTitle } from './homeTranscriptionRecordProgress';

export const PROJECT_ROSTER_QUERY_KEY = 'projectRoster';

export type ProjectRosterRow = {
  textId: string;
  title: string;
  updatedAt: string;
};

export async function loadProjectRoster(locale: Locale): Promise<ProjectRosterRow[]> {
  const texts = await LinguisticService.timeline.listTexts();
  return texts
    .map((text) => ({
      textId: text.id,
      title: pickTextTitle(text, locale),
      updatedAt: text.updatedAt,
    }))
    .sort((left, right) => {
      const rightMs = Date.parse(right.updatedAt);
      const leftMs = Date.parse(left.updatedAt);
      return (Number.isFinite(rightMs) ? rightMs : 0) - (Number.isFinite(leftMs) ? leftMs : 0);
    });
}
