import { getDb, runDexieIndexedQueryOrElse, type LexemeDocType } from '../db';
import { LayerSegmentQueryService } from './LayerSegmentQueryService';

/** 词典 → 转写深链：由 `token_lexeme_links` 解析出的可跳转时间轴单元 | Lexicon → transcription deep-link row */
export interface LexemeTranscriptionJumpTarget {
  textId: string;
  unitId: string;
  layerId: string;
  mediaId?: string;
  unitKind: 'unit' | 'segment';
  surfaceHint?: string;
  linkUpdatedAt: string;
}

export async function listLexemes(): Promise<LexemeDocType[]> {
  const db = await getDb();
  const docs = await db.collections.lexemes.find().exec();

  return docs
    .map((doc) => doc.toJSON())
    .sort((left, right) => {
      const usageDiff = (right.usageCount ?? 0) - (left.usageCount ?? 0);
      if (usageDiff !== 0) return usageDiff;

      const updatedDiff = right.updatedAt.localeCompare(left.updatedAt);
      if (updatedDiff !== 0) return updatedDiff;

      const leftLabel = Object.values(left.lemma)[0] ?? left.id;
      const rightLabel = Object.values(right.lemma)[0] ?? right.id;
      return leftLabel.localeCompare(rightLabel, 'zh-CN');
    });
}

export async function searchLexemes(query: string): Promise<LexemeDocType[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const db = await getDb();
  const docs = await db.collections.lexemes.find().exec();
  return docs
    .map((doc) => doc.toJSON())
    .filter((item) =>
      Object.values(item.lemma).some((value) => value.toLowerCase().includes(normalized)),
    );
}

export async function saveLexeme(data: LexemeDocType): Promise<string> {
  const db = await getDb();
  const doc = await db.collections.lexemes.insert(data);
  return doc.primary;
}

/**
 * 词条在转写库中的可跳转命中（经 token_lexeme_links → token/morpheme → layer_unit） |
 * Transcription jump targets for a lexeme via token/morpheme links into canonical layer units.
 */
export async function listLexemeTranscriptionJumpTargets(
  lexemeId: string,
  opts?: { limit?: number },
): Promise<LexemeTranscriptionJumpTarget[]> {
  const limit = Math.max(1, Math.min(opts?.limit ?? 40, 200));
  const id = lexemeId.trim();
  if (!id) return [];

  const db = await getDb();
  const links = await runDexieIndexedQueryOrElse(
    'LinguisticService.lexemes.listTranscriptionJumpTargets:token_lexeme_links',
    () => db.dexie.token_lexeme_links.where('lexemeId').equals(id).toArray(),
    async () => {
      const all = await db.dexie.token_lexeme_links.toArray();
      return all.filter((row) => (row.lexemeId ?? '').trim() === id);
    },
  );
  links.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const seen = new Set<string>();
  const out: LexemeTranscriptionJumpTarget[] = [];

  for (const link of links) {
    if (out.length >= limit) break;

    let unitId = '';
    let textId = '';
    let surfaceHint: string | undefined;

    if (link.targetType === 'token') {
      const tok = await db.dexie.unit_tokens.get(link.targetId);
      if (!tok) continue;
      unitId = tok.unitId.trim();
      textId = tok.textId.trim();
      const rawForm = Object.values(tok.form ?? {}).find(
        (v) => typeof v === 'string' && v.trim().length > 0,
      );
      surfaceHint = typeof rawForm === 'string' ? rawForm.trim() : undefined;
    } else {
      const mor = await db.dexie.unit_morphemes.get(link.targetId);
      if (!mor) continue;
      unitId = mor.unitId.trim();
      textId = mor.textId.trim();
      const rawForm = Object.values(mor.form ?? {}).find(
        (v) => typeof v === 'string' && v.trim().length > 0,
      );
      surfaceHint = typeof rawForm === 'string' ? rawForm.trim() : undefined;
    }

    if (!unitId || !textId) continue;

    const [layerUnit] = await LayerSegmentQueryService.listUnitsByIds([unitId]);
    if (!layerUnit) continue;

    const layerId = layerUnit.layerId?.trim() ?? '';
    if (!layerId) continue;

    const unitKind: 'unit' | 'segment' = layerUnit.unitType === 'segment' ? 'segment' : 'unit';
    const mediaId = layerUnit.mediaId?.trim() || undefined;
    const dedupeKey = `${textId}|${layerId}|${unitId}|${unitKind}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      textId,
      unitId,
      layerId,
      ...(mediaId ? { mediaId } : {}),
      unitKind,
      ...(surfaceHint ? { surfaceHint } : {}),
      linkUpdatedAt: link.updatedAt,
    });
  }

  return out;
}
