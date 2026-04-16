import { AutoGlossService } from '../ai/AutoGlossService';
import { t, tf } from '../i18n';
import type { ToolObjectAdapter } from './useAiToolCallHandler.types';

export const glossAdapter: ToolObjectAdapter = {
  handles: ['auto_gloss_unit'],
  async execute(ctx) {
    const { locale } = ctx;
    if (!ctx.hasRequestedUnitTarget()) {
      return { ok: false, message: t(locale, 'transcription.aiTool.gloss.missingUnitId') };
    }
    const targetUnit = ctx.resolveRequestedUnit();
    if (!targetUnit) {
      return { ok: false, message: tf(locale, 'transcription.aiTool.segment.segmentNotFound', { unitId: ctx.describeRequestedUnitTarget() }) };
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
    return {
      ok: true,
      message: tf(locale, 'transcription.aiTool.gloss.done', {
        matched: result.matched.length,
        total: result.total,
        labels,
      }),
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
        await ctx.updateTokenPos(tokenId, pos);
        return {
          ok: true,
          message: tf(locale, 'transcription.aiTool.token.setPosDone', {
            tokenId,
            pos: pos ?? t(locale, 'transcription.aiTool.token.clearedValue'),
          }),
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
      const updated = await ctx.batchUpdateTokenPosByForm(unitId, form, pos);
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.token.batchSetPosDone', {
          updated,
          form,
          pos: pos ?? t(locale, 'transcription.aiTool.token.clearedValue'),
        }),
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
      await ctx.updateTokenGloss(tokenId, gloss, lang);
      return {
        ok: true,
        message: tf(locale, 'transcription.aiTool.token.setGlossDone', {
          tokenId,
          lang,
          gloss: gloss ?? t(locale, 'transcription.aiTool.token.clearedValue'),
        }),
      };
    }

    return { ok: false, message: tf(locale, 'transcription.aiTool.token.unsupportedTool', { toolName: call.name }) };
  },
};
