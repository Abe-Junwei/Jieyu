import { t } from '../i18n';
import type { useLocale } from '../i18n';
import { writeAnnotationFormsToTranscription } from './annotation/writeAnnotationFormsToSurface';
import { acceptAnnotationGlossSuggestion } from './annotation/acceptAnnotationGlossSuggestion';
import { saveAnnotationTokenLanguage } from './annotation/saveAnnotationTokenLanguage';
import { saveAnnotationOccurrenceCitation } from './annotation/saveAnnotationOccurrenceCitation';
import { LinguisticService } from '../app/languageAssetPageAccess';
import type { AnnotationIgtRow, AnnotationSaveNotice } from './useAnnotationWorkspaceController';

/** Workspace write actions share one failure path, including refresh failures. */
export function annotationWorkspaceWriteActions(input: {
  textId: string;
  languageId: string;
  rows: readonly AnnotationIgtRow[];
  reload: () => Promise<unknown>;
  setSaveNotice: (notice: AnnotationSaveNotice) => void;
  locale: ReturnType<typeof useLocale>;
}) {
  const run = async (action: () => Promise<unknown>) => {
    input.setSaveNotice({ kind: 'saving', message: '' });
    try {
      await action();
      await input.reload();
      input.setSaveNotice({ kind: 'saved', message: '' });
    } catch (error) {
      input.setSaveNotice({
        kind: 'error',
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : t(input.locale, 'workspace.annotation.saveError'),
      });
    }
  };
  return {
    onAcceptGlossSuggestion: (_unitId: string, tokenId: string, gloss: string, lang: string) => {
      void run(() => acceptAnnotationGlossSuggestion(tokenId, gloss, lang));
    },
    onSaveTokenLanguage: (unitId: string, tokenId: string, languageId: string) => {
      void run(() => saveAnnotationTokenLanguage(unitId, tokenId, languageId));
    },
    onCiteOccurrence: (unitId: string, tokenId: string) => {
      void run(async () => {
        const links = await LinguisticService.units.listTokenLexemeLinks('token', tokenId);
        const link = links.find((item) => item.lexemeId && item.senseId);
        if (!link?.senseId) return;
        await saveAnnotationOccurrenceCitation({
          textId: input.textId,
          unitId,
          tokenId,
          lexemeId: link.lexemeId,
          senseId: link.senseId,
        });
      });
    },
    onWriteFormsToSurface: (unitId: string) => {
      const row = input.rows.find((item) => item.id === unitId);
      if (!row) return;
      void run(() =>
        writeAnnotationFormsToTranscription({
          textId: input.textId,
          unitId,
          forms: row.tokens.map((token) => token.form),
          languageId: input.languageId,
        }),
      );
    },
  };
}
