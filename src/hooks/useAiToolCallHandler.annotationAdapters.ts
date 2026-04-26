import { AutoGlossService } from '../ai/AutoGlossService';
import type { LayerUnitDocType } from '../db';
import { LinguisticService } from '../services/LinguisticService';
import { t, tf } from '../i18n';
import type { ToolObjectAdapter } from './useAiToolCallHandler.types';

const DEFAULT_ORTHOGRAPHY_KEY_FOR_BATCH_POS = 'default';

function collectTokenPosSnapshotsByFormFromUnits(
  units: readonly LayerUnitDocType[],
  unitId: string,
  form: string,
  orthographyKey: string,
): Array<{ tokenId: string; previous: string | null }> {
  const normalizedForm = form.trim();
  const unit = units.find((u) => u.id === unitId);
  const words = unit?.words;
  if (!words?.length) return [];
  const out: Array<{ tokenId: string; previous: string | null }> = [];
  for (const w of words) {
    const tokenId = w.id;
    if (!tokenId) continue;
    const direct = w.form?.[orthographyKey];
    if (direct !== normalizedForm && !Object.values(w.form ?? {}).some((v) => v === normalizedForm)) {
      continue;
    }
    const raw = w.pos;
    const prev = raw !== undefined && String(raw).trim() !== '' ? String(raw).trim() : null;
    out.push({ tokenId, previous: prev });
  }
  return out;
}

export const glossAdapter: ToolObjectAdapter = {
  handles: ['auto_gloss_unit'],
  async execute(ctx) {
    const { locale } = ctx;
    if (!ctx.hasRequestedUnitTarget()) {
      return { ok: false, message: t(locale, 'transcription.aiTool.gloss.missingUnitId') };
    }
    const targetUnit = ctx.resolveRequestedUnit();
    if (!targetUnit) {
      return {
        ok: false,
        message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', {
          segmentId: ctx.describeRequestedUnitTarget(),
        }),
      };
    }
    const service = new AutoGlossService();
    const result = await service.glossUnit(targetUnit.id);
    if (result.matched.length === 0) {
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.gloss.noMatches', {
          total: result.total,
          skipped: result.skipped,
        }),
      };
    }
    const labels = result.matched.map((m) => {
      const form = Object.values(m.tokenForm)[0] ?? '';
      const gloss = Object.values(m.gloss)[0] ?? '';
      return `${form}→${gloss}`;
    }).join('、');
    const updateGloss = ctx.updateTokenGloss;
    const canRollbackAutoGloss = Boolean(updateGloss)
      && result.matched.length > 0
      && result.matched.every((m) => typeof m.linkId === 'string' && m.linkId.length > 0);
    return {
      ok: true,
      message: tf(locale, 'transcription.aiTool.gloss.done', {
        matched: result.matched.length,
        total: result.total,
        labels,
      }),
      ...(canRollbackAutoGloss && updateGloss
        ? {
            rollback: async () => {
              const linkIds = result.matched.map((m) => m.linkId);
              await LinguisticService.removeTokenLexemeLinksByIds(linkIds);
              for (let i = result.matched.length - 1; i >= 0; i -= 1) {
                const m = result.matched[i]!;
                const langs = Object.keys(m.gloss);
                for (let j = langs.length - 1; j >= 0; j -= 1) {
                  const lang = langs[j]!;
                  await updateGloss(m.tokenId, null, lang);
                }
              }
            },
          }
        : {}),
    };
  },
};

export const tokenAdapter: ToolObjectAdapter = {
  handles: ['set_token_pos', 'set_token_gloss'],
  async execute(ctx) {
    const { call, locale } = ctx;

    if (call.name === 'set_token_pos') {
      const tokenId = String(call.arguments.tokenId ?? '').trim();
      const posRaw = call.arguments.pos;
      const pos = posRaw === null || posRaw === '' ? null : String(posRaw ?? '').trim() || null;

      if (tokenId.length > 0) {
        if (!ctx.updateTokenPos) {
          return { ok: false, message: t(locale, 'transcription.aiTool.token.setPosCallbackMissing') };
        }
        const previous = ctx.readTokenPos?.(tokenId) ?? null;
        await ctx.updateTokenPos(tokenId, pos);
        const updatePos = ctx.updateTokenPos;
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.token.setPosDone', {
            tokenId,
            pos: pos ?? t(locale, 'transcription.aiTool.token.clearedValue'),
          }),
          ...(ctx.readTokenPos && updatePos
            ? {
                rollback: async () => {
                  await updatePos(tokenId, previous);
                },
              }
            : {}),
        };
      }

      const unitId = String(call.arguments.unitId ?? '').trim();
      const form = String(call.arguments.form ?? '').trim();
      if (!unitId || !form) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.setPosMissingTarget') };
      }
      if (!ctx.batchUpdateTokenPosByForm) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.batchSetPosCallbackMissing') };
      }
      const snapshots = collectTokenPosSnapshotsByFormFromUnits(
        ctx.units,
        unitId,
        form,
        DEFAULT_ORTHOGRAPHY_KEY_FOR_BATCH_POS,
      );
      const updated = await ctx.batchUpdateTokenPosByForm(unitId, form, pos);
      const updatePos = ctx.updateTokenPos;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.token.batchSetPosDone', {
          updated,
          form,
          pos: pos ?? t(locale, 'transcription.aiTool.token.clearedValue'),
        }),
        ...(snapshots.length > 0 && updatePos
          ? {
              rollback: async () => {
                for (let i = snapshots.length - 1; i >= 0; i -= 1) {
                  const row = snapshots[i]!;
                  await updatePos(row.tokenId, row.previous);
                }
              },
            }
          : {}),
      };
    }

    if (call.name === 'set_token_gloss') {
      const tokenId = String(call.arguments.tokenId ?? '').trim();
      const glossRaw = call.arguments.gloss;
      const gloss = glossRaw === null || glossRaw === '' ? null : String(glossRaw ?? '').trim() || null;
      const lang = String(call.arguments.lang ?? 'eng').trim() || 'eng';

      if (!tokenId) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.setGlossMissingTokenId') };
      }
      if (!ctx.updateTokenGloss) {
        return { ok: false, message: t(locale, 'transcription.aiTool.token.setGlossCallbackMissing') };
      }
      const previous = ctx.readTokenGloss?.(tokenId, lang) ?? null;
      await ctx.updateTokenGloss(tokenId, gloss, lang);
      const updateGloss = ctx.updateTokenGloss;
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.token.setGlossDone', {
          tokenId,
          lang,
          gloss: gloss ?? t(locale, 'transcription.aiTool.token.clearedValue'),
        }),
        ...(ctx.readTokenGloss && updateGloss
          ? {
              rollback: async () => {
                await updateGloss(tokenId, previous, lang);
              },
            }
          : {}),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.token.unsupportedTool', { toolName: call.name }) };
  },
};
