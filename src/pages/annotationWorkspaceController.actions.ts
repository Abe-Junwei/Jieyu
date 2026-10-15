import { t, tf, type Locale } from '../i18n';
import type { useLocale } from '../i18n';
import {
  writeAnnotationFormsToTranscription,
  writeAnnotationUnitLayerText,
} from './annotation/writeAnnotationFormsToSurface';
import { acceptAnnotationGlossSuggestion } from './annotation/acceptAnnotationGlossSuggestion';
import { saveAnnotationTokenLanguage } from './annotation/saveAnnotationTokenLanguage';
import { saveAnnotationOccurrenceCitation } from './annotation/saveAnnotationOccurrenceCitation';
import { saveAnnotationGlossByForm } from './annotation/saveAnnotationGlossByForm';
import { deleteAnnotationToken } from './annotation/deleteAnnotationToken';
import { LinguisticService } from '../app/languageAssetPageAccess';
import type { AnnotationIgtRow } from './annotation/annotationIgtRows';

/** 保存提示状态（定义在此以免与控制器循环依赖，JY-24）| Save notice (lives here to avoid a cycle). */
export type AnnotationSaveNotice = {
  kind: 'idle' | 'saving' | 'saved' | 'error';
  message: string;
};

/** Saved with a message means the write landed and the view did not refresh. */
export function annotationSaveStatusText(
  notice: AnnotationSaveNotice,
  locale: Locale,
  playbackSkipped: boolean,
): string {
  if (notice.kind === 'saving') return t(locale, 'workspace.annotation.saving');
  if (notice.kind === 'saved') {
    return notice.message.trim().length > 0
      ? notice.message
      : t(locale, 'workspace.annotation.saveSaved');
  }
  if (notice.kind === 'error') {
    return tf(locale, 'workspace.annotation.saveFailed', { message: notice.message });
  }
  return playbackSkipped ? t(locale, 'workspace.annotation.playbackSkipped') : '';
}

/**
 * The write has already returned. A failed reload keeps the saved notice and
 * says the view is stale. `report` runs after the reload: false leaves the
 * current notice alone, so a focus change does not skip the reload.
 */
export async function publishAnnotationWriteRefresh(input: {
  reload: () => Promise<unknown>;
  setSaveNotice: (notice: AnnotationSaveNotice) => void;
  locale: Locale;
  report?: boolean | (() => boolean);
}): Promise<'refreshed' | 'stale'> {
  const refresh = input.reload;
  let stale = false;
  try {
    await refresh();
  } catch {
    stale = true;
  }
  const show = typeof input.report === 'function' ? input.report() : input.report !== false;
  if (show) {
    input.setSaveNotice(
      stale
        ? { kind: 'saved', message: t(input.locale, 'workspace.annotation.writtenViewStale') }
        : { kind: 'saved', message: '' },
    );
  }
  return stale ? 'stale' : 'refreshed';
}

/** Run several post-write reads as one reload. */
export function composeAnnotationRefresh(
  ...steps: ReadonlyArray<() => Promise<unknown>>
): () => Promise<unknown> {
  return async () => {
    for (const step of steps) await step();
  };
}

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

/** Workspace writes report a failed reload as a saved view that did not refresh. */
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
    const finish = (notice: AnnotationSaveNotice) => {
      finishAnnotationSaveNotice(ticket, mine, input.setSaveNotice, notice);
    };
    finish({ kind: 'saving', message: '' });
    try {
      await action();
    } catch (error) {
      finish({
        kind: 'error',
        message:
          error instanceof Error && error.message.trim()
            ? error.message
            : t(input.locale, 'workspace.annotation.saveError'),
      });
      return;
    }
    await publishAnnotationWriteRefresh({
      reload: input.reload,
      setSaveNotice: finish,
      locale: input.locale,
    });
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
    onApplyGlossByForm: (writes: Parameters<typeof saveAnnotationGlossByForm>[0]) =>
      run(() => saveAnnotationGlossByForm(writes)),
    onDeleteToken: (unitId: string, tokenId: string, confirmLoss: boolean) =>
      deleteTokenWithoutNoticeOnConfirm(run, unitId, tokenId, confirmLoss),
  };
}

async function deleteTokenWithoutNoticeOnConfirm(
  run: (action: () => Promise<unknown>) => Promise<void>,
  unitId: string,
  tokenId: string,
  confirmLoss: boolean,
): Promise<void> {
  try {
    const plan = await deleteAnnotationToken({ unitId, tokenId, confirmLoss });
    if (plan.kind === 'confirm') return;
  } catch (error) {
    await run(async () => {
      throw error;
    });
    return;
  }
  await run(async () => undefined);
}

async function commitAnnotationLayerText(
  args: Parameters<typeof writeAnnotationUnitLayerText>[0],
): Promise<void> {
  const result = await writeAnnotationUnitLayerText(args);
  if (result === 'missing') throw new Error('');
}
