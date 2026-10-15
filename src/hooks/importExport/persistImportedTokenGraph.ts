import type { TokenLexemeLinkDocType, UnitMorphemeDocType, UnitTokenDocType } from '../../db';
import { getDb, isLexemeEntry } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { newId } from '../../utils/transcriptionFormatters';

export type ImportedHostToken = {
  form?: Record<string, string>;
  gloss?: Record<string, string>;
  pos?: string;
  lexemeId?: string;
  morphemes?: Array<{
    form?: Record<string, string>;
    gloss?: Record<string, string>;
    pos?: string;
    lexemeId?: string;
  }>;
};

export type ImportedTokenGraphWrite = {
  hostUnitId: string;
  tokens: readonly ImportedHostToken[];
  now: string;
  language?: string;
};

export type ImportedTokenGraphWriter = {
  write: (input: ImportedTokenGraphWrite) => Promise<void>;
};

async function resolveImportedLexemeId(
  textId: string,
  form: Record<string, string>,
  language: string | undefined,
  cache: Map<string, string>,
  explicitId?: string,
): Promise<string | undefined> {
  const explicit = explicitId?.trim();
  if (explicit) {
    const db = await getDb();
    const row = await db.dexie.lexemes.get(explicit);
    if (row && isLexemeEntry(row) && row.textId === textId) return row.id;
  }
  const surface =
    (typeof form.default === 'string' && form.default.trim()) ||
    (typeof form.eng === 'string' && form.eng.trim()) ||
    Object.values(form)
      .find((value) => typeof value === 'string' && value.trim())
      ?.trim();
  if (!surface) return undefined;
  const lang = language?.trim() || undefined;
  const cacheKey = `${lang ?? ''}::${surface}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const lexemeId = await LinguisticService.lexemes.matchOrCreateByForm({
    form: surface,
    textId,
    ...(lang ? { language: lang } : {}),
  });
  if (lexemeId) cache.set(cacheKey, lexemeId);
  return lexemeId;
}

async function replaceHostTokenGraph(hostUnitId: string): Promise<void> {
  const db = await getDb();
  const oldTokens = await db.dexie.unit_tokens.where('unitId').equals(hostUnitId).toArray();
  const oldMorphs = await db.dexie.unit_morphemes.where('unitId').equals(hostUnitId).toArray();
  const linkTargets = [
    ...oldTokens.map((row) => ['token', row.id] as [string, string]),
    ...oldMorphs.map((row) => ['morpheme', row.id] as [string, string]),
  ];
  if (linkTargets.length > 0) {
    await db.dexie.token_lexeme_links.where('[targetType+targetId]').anyOf(linkTargets).delete();
  }
  await db.dexie.unit_morphemes.where('unitId').equals(hostUnitId).delete();
  await db.dexie.unit_tokens.where('unitId').equals(hostUnitId).delete();
}

/** One writer per import. The surface-form cache stays inside it. */
export function createImportedTokenGraphWriter(input: {
  textId: string;
}): ImportedTokenGraphWriter {
  const textId = input.textId;
  const cache = new Map<string, string>();
  return {
    write: async (write) => {
      if (write.tokens.length === 0) return;
      await replaceHostTokenGraph(write.hostUnitId);
      const tokenRows: UnitTokenDocType[] = [];
      const morphRows: UnitMorphemeDocType[] = [];
      for (const [tokenIndex, token] of write.tokens.entries()) {
        if (!token || typeof token !== 'object' || !token.form || typeof token.form !== 'object') {
          continue;
        }
        const tokenId = newId('tok');
        const tokenLexemeId = await resolveImportedLexemeId(
          textId,
          token.form,
          write.language,
          cache,
          token.lexemeId,
        );
        tokenRows.push({
          id: tokenId,
          textId,
          unitId: write.hostUnitId,
          form: token.form,
          ...(token.gloss ? { gloss: token.gloss } : {}),
          ...(token.pos ? { pos: token.pos } : {}),
          ...(tokenLexemeId ? { lexemeId: tokenLexemeId } : {}),
          tokenIndex,
          createdAt: write.now,
          updatedAt: write.now,
        });
        const morphemes = Array.isArray(token.morphemes) ? token.morphemes : [];
        for (const [morphemeIndex, morph] of morphemes.entries()) {
          if (!morph?.form || typeof morph.form !== 'object') continue;
          const morphLexemeId = await resolveImportedLexemeId(
            textId,
            morph.form,
            write.language,
            cache,
            morph.lexemeId,
          );
          morphRows.push({
            id: newId('morph'),
            textId,
            unitId: write.hostUnitId,
            tokenId,
            form: morph.form,
            ...(morph.gloss ? { gloss: morph.gloss } : {}),
            ...(morph.pos ? { pos: morph.pos } : {}),
            ...(morphLexemeId ? { lexemeId: morphLexemeId } : {}),
            morphemeIndex,
            createdAt: write.now,
            updatedAt: write.now,
          });
        }
      }
      if (tokenRows.length > 0) await LinguisticService.units.saveTokensBatch(tokenRows);
      if (morphRows.length > 0) await LinguisticService.units.saveMorphemesBatch(morphRows);
      const linkRows: TokenLexemeLinkDocType[] = [];
      for (const token of tokenRows) {
        if (!token.lexemeId) continue;
        linkRows.push({
          id: newId('tll'),
          targetType: 'token',
          targetId: token.id,
          lexemeId: token.lexemeId,
          createdAt: write.now,
          updatedAt: write.now,
        });
      }
      for (const morph of morphRows) {
        if (!morph.lexemeId) continue;
        linkRows.push({
          id: newId('tll'),
          targetType: 'morpheme',
          targetId: morph.id,
          lexemeId: morph.lexemeId,
          createdAt: write.now,
          updatedAt: write.now,
        });
      }
      if (linkRows.length > 0) {
        const db = await getDb();
        await db.dexie.token_lexeme_links.bulkPut(linkRows);
      }
    },
  };
}
