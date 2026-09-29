import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { UnitMorphemeDocType } from '../../types/jieyuDbDocTypes';
import {
  newId,
  pickDefaultTranscriptionLangKey,
  pickDefaultTranscriptionText,
} from '../../utils/transcriptionFormatters';
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
    const actualForm = pickDefaultTranscriptionText(row.form);
    const actualGloss = (row.gloss?.[morph.glossLang] ?? '').trim();
    if (actualForm !== morph.form.trim()) {
      throw new Error(`morpheme form readback mismatch for ${morph.id}`);
    }
    if (actualGloss !== morph.gloss.trim()) {
      throw new Error(`morpheme gloss readback mismatch for ${morph.id}`);
    }
  }
}

function copyLangMap(value: Record<string, string> | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  if (!value) return next;
  for (const [key, text] of Object.entries(value)) {
    if (key.trim().length === 0) continue;
    next[key] = text;
  }
  return next;
}

function toStoredMorpheme(
  morph: AnnotationIgtMorpheme,
  existing: UnitMorphemeDocType | undefined,
  textId: string,
  unitId: string,
  now: string,
): UnitMorphemeDocType {
  const glossLang = morph.glossLang.trim().length > 0 ? morph.glossLang : 'default';
  const form = copyLangMap(existing?.form);
  const formKey = existing ? pickDefaultTranscriptionLangKey(existing.form) : glossLang;
  const formValue = morph.form.trim();
  form[formKey] = formValue;
  const gloss = copyLangMap(existing?.gloss);
  const glossValue = morph.gloss.trim();
  if (glossValue.length > 0) gloss[glossLang] = glossValue;
  else delete gloss[glossLang];
  return {
    id: morph.id,
    textId,
    unitId,
    tokenId: morph.tokenId,
    form,
    ...(Object.keys(gloss).length > 0 ? { gloss } : {}),
    ...(existing?.pos ? { pos: existing.pos } : {}),
    ...(existing?.lexemeId ? { lexemeId: existing.lexemeId } : {}),
    ...(existing?.provenance ? { provenance: existing.provenance } : {}),
    morphemeIndex: morph.morphemeIndex,
    createdAt: existing?.createdAt ?? now,
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
  const existingRows = await deps.listMorphemesByTokenIds([input.tokenId]);
  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  const stored = input.morphs.map((morph) =>
    toStoredMorpheme(morph, existingById.get(morph.id), input.textId, input.unitId, now),
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
      const glossText = pickDefaultTranscriptionText(row.gloss ?? {});
      const glossLang =
        glossText.length > 0
          ? pickDefaultTranscriptionLangKey(row.gloss)
          : pickDefaultTranscriptionLangKey(row.form);
      return {
        id: row.id,
        tokenId: row.tokenId,
        form: pickDefaultTranscriptionText(row.form),
        gloss: glossText,
        glossLang,
        morphemeIndex: row.morphemeIndex,
      };
    });
}
