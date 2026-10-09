import { t } from '../i18n';
import type { useLocale } from '../i18n';
import {
  writeAnnotationFormsToTranscription,
  writeAnnotationUnitLayerText,
} from './annotation/writeAnnotationFormsToSurface';
import { acceptAnnotationGlossSuggestion } from './annotation/acceptAnnotationGlossSuggestion';
import { saveAnnotationTokenLanguage } from './annotation/saveAnnotationTokenLanguage';
import { saveAnnotationOccurrenceCitation } from './annotation/saveAnnotationOccurrenceCitation';
import { LinguisticService } from '../app/languageAssetPageAccess';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';

/** 保存提示状态（定义在此以免与控制器循环依赖，JY-24）| Save notice (lives here to avoid a cycle). */
export type AnnotationSaveNotice = {
  kind: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
};

/** Ignore a finished write when a later write has already taken the notice. */
export function finishAnnotationSaveNotice(
  ticket: { current: number },
  mine: number,
  setSaveNotice: (notice: AnnotationSaveNotice) => void,
  notice: AnnotationSaveNotice,
): void {
  if (mine !== ticket.current) return;
  setSaveNotice(notice);
}

/** Workspace write actions share one failure path, including refresh failures. */
export function annotationWorkspaceWriteActions(input: {
  textId: string;
  languageId: string;
  rows: readonly AnnotationIgtRow[];
  reload: () => Promise<unknown>;
  setSaveNotice: (notice: AnnotationSaveNotice) => void;
  locale: ReturnType<typeof useLocale>;
  noticeGate: { current: number };
}) {
  const run = async (action: () => Promise<unknown>) => {
    const ticket = input.noticeGate;
    ticket.current += 1;
    const mine = ticket.current;
    input.setSaveNotice({ kind: 'saving', message: '' });
    try {
      await action();
      await input.reload();
      finishAnnotationSaveNotice(ticket, mine, input.setSaveNotice, { kind: 'saved', message: '' });
    } catch (error) {
      finishAnnotationSaveNotice(ticket, mine, input.setSaveNotice, {
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
    onCommitLanguageLine: (unitId: string, layerId: string, text: string) => {
      void run(() =>
        commitAnnotationLayerText({
          textId: input.textId,
          unitId,
          text,
          languageId: input.languageId,
          layerIds: layerId.length > 0 ? [layerId] : [],
          ...(layerId.length > 0 ? { createLayerId: layerId } : {}),
        }),
      );
    },
    onCommitGlossLanguage: (_unitId: string, tokenId: string, languageId: string, text: string) => {
      void run(() =>
        LinguisticService.units.updateTokenGloss(
          tokenId,
          text.trim().length > 0 ? text : null,
          languageId,
        ),
      );
    },
    onCommitSurface: (unitId: string, text: string) => {
      void run(() =>
        commitAnnotationLayerText({
          textId: input.textId,
          unitId,
          text,
          languageId: input.languageId,
          layerType: 'transcription',
        }),
      );
    },
    onCommitTranslation: (unitId: string, layerId: string, text: string) => {
      void run(() =>
        commitAnnotationLayerText({
          textId: input.textId,
          unitId,
          text,
          languageId: input.languageId,
          layerIds: layerId.length > 0 ? [layerId] : [],
          ...(layerId.length > 0 ? { createLayerId: layerId } : {}),
        }),
      );
    },
    onCommitTokenForm: (_unitId: string, tokenId: string, form: string) => {
      void run(() => LinguisticService.units.updateTokenForm(tokenId, form, input.languageId));
    },
  };
}

async function commitAnnotationLayerText(
  args: Parameters<typeof writeAnnotationUnitLayerText>[0],
): Promise<void> {
  const result = await writeAnnotationUnitLayerText(args);
  if (result === 'missing') throw new Error('');
}
