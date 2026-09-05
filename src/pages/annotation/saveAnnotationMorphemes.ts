import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { UnitMorphemeDocType } from '../../types/jieyuDbDocTypes';
import { newId } from '../../utils/transcriptionFormatters';
import { resolveAnnotationGlossWriteLang } from './annotationTokenDrafts';
import type { AnnotationIgtMorpheme } from './annotationMorphemeDrafts';

export type AnnotationMorphemeWriteDeps = {
  replaceMorphemesForToken: (
    tokenId: string,
    items: readonly UnitMorphemeDocType[],
  ) => Promise<UnitMorphemeDocType[]>;
  listMorphemesByTokenIds: (tokenIds: readonly string[]) => Promise<UnitMorphemeDocType[]>;
};

const defaultDeps: AnnotationMorphemeWriteDeps = {
  replaceMorphemesForToken: (tokenId, items) =>
    LinguisticService.units.replaceMorphemesForToken(tokenId, [...items]),
  listMorphemesByTokenIds: (tokenIds) => LinguisticService.units.listMorphemesByTokenIds(tokenIds),
};

export function verifyAnnotationMorphemeReadback(
  expected: readonly AnnotationIgtMorpheme[],
  rows: readonly UnitMorphemeDocType[],
): void {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const morph of expected) {
    const row = byId.get(morph.id);
    if (!row) {
      throw new Error(`readback missing morpheme ${morph.id}`);
    }
    const actualForm = (row.form[morph.glossLang] ?? row.form.default ?? '').trim();
    const actualGloss = (row.gloss?.[morph.glossLang] ?? '').trim();
    if (actualForm !== morph.form.trim()) {
      throw new Error(`morpheme form readback mismatch for ${morph.id}`);
    }
    if (actualGloss !== morph.gloss.trim()) {
      throw new Error(`morpheme gloss readback mismatch for ${morph.id}`);
    }
  }
}

function toStoredMorpheme(
  morph: AnnotationIgtMorpheme,
  textId: string,
  unitId: string,
  now: string,
): UnitMorphemeDocType {
  const lang = morph.glossLang.trim().length > 0 ? morph.glossLang : 'default';
  const formValue = morph.form.trim();
  const glossValue = morph.gloss.trim();
  return {
    id: morph.id,
    textId,
    unitId,
    tokenId: morph.tokenId,
    form: { [lang]: formValue },
    ...(glossValue.length > 0 ? { gloss: { [lang]: glossValue } } : {}),
    morphemeIndex: morph.morphemeIndex,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveAnnotationMorphemesForToken(
  input: {
    textId: string;
    unitId: string;
    tokenId: string;
    morphs: readonly AnnotationIgtMorpheme[];
  },
  deps: AnnotationMorphemeWriteDeps = defaultDeps,
): Promise<UnitMorphemeDocType[]> {
  const now = new Date().toISOString();
  const stored = input.morphs.map((morph) =>
    toStoredMorpheme(morph, input.textId, input.unitId, now),
  );
  await deps.replaceMorphemesForToken(input.tokenId, stored);
  const readback = await deps.listMorphemesByTokenIds([input.tokenId]);
  verifyAnnotationMorphemeReadback(input.morphs, readback);
  return readback;
}

export function buildSeedMorphemes(input: {
  textId: string;
  unitId: string;
  tokenId: string;
  forms: readonly string[];
  glossLang?: string;
}): AnnotationIgtMorpheme[] {
  const lang = input.glossLang ?? 'default';
  return input.forms.map((form, index) => ({
    id: newId('mor'),
    tokenId: input.tokenId,
    form,
    gloss: '',
    glossLang: lang,
    morphemeIndex: index,
  }));
}

export function mapStoredMorphemes(rows: readonly UnitMorphemeDocType[]): AnnotationIgtMorpheme[] {
  return [...rows]
    .sort((a, b) => a.tokenId.localeCompare(b.tokenId) || a.morphemeIndex - b.morphemeIndex)
    .map((row) => {
      const glossLang = resolveAnnotationGlossWriteLang(row.gloss ?? row.form);
      return {
        id: row.id,
        tokenId: row.tokenId,
        form: (row.form[glossLang] ?? row.form.default ?? Object.values(row.form)[0] ?? '').trim(),
        gloss: (row.gloss?.[glossLang] ?? '').trim(),
        glossLang,
        morphemeIndex: row.morphemeIndex,
      };
    });
}
