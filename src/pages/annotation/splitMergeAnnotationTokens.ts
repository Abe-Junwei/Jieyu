import { LinguisticService } from '../../app/languageAssetPageAccess';
import type {
  TokenLexemeLinkDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from '../../types/jieyuDbDocTypes';
import { newId, pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import { submitAnnotationTokenSnapshot } from './annotationRetokenize';

export type AnnotationTokenSplitDeps = {
  listTokensByUnitId: (unitId: string) => Promise<UnitTokenDocType[]>;
  saveToken: (data: UnitTokenDocType) => Promise<string>;
  removeToken: (tokenId: string) => Promise<void>;
  listTokensByUnitIds: (unitIds: readonly string[]) => Promise<UnitTokenDocType[]>;
  listMorphemesByTokenIds: (tokenIds: readonly string[]) => Promise<UnitMorphemeDocType[]>;
  saveMorpheme: (data: UnitMorphemeDocType) => Promise<string>;
  listTokenLexemeLinks: (
    targetType: 'token' | 'morpheme',
    targetId: string,
  ) => Promise<TokenLexemeLinkDocType[]>;
  saveTokenLexemeLink: (data: TokenLexemeLinkDocType) => Promise<string>;
};

const defaultDeps: AnnotationTokenSplitDeps = {
  listTokensByUnitId: (unitId) => LinguisticService.units.listTokensByUnitId(unitId),
  saveToken: (data) => LinguisticService.units.saveToken(data),
  removeToken: (tokenId) => LinguisticService.units.removeToken(tokenId),
  listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
  listMorphemesByTokenIds: (tokenIds) => LinguisticService.units.listMorphemesByTokenIds(tokenIds),
  saveMorpheme: (data) => LinguisticService.units.saveMorpheme(data),
  listTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.listTokenLexemeLinks(targetType, targetId),
  saveTokenLexemeLink: (data) => LinguisticService.units.saveTokenLexemeLink(data),
};

export function planTokenSplit(form: string): { left: string; right: string } | null {
  const text = form.trim();
  const pipe = text.indexOf('|');
  if (pipe > 0 && pipe < text.length - 1) {
    const left = text.slice(0, pipe).trim();
    const right = text.slice(pipe + 1).trim();
    if (left.length > 0 && right.length > 0) return { left, right };
  }
  const space = text.search(/\s+/);
  if (space > 0 && space < text.length - 1) {
    const left = text.slice(0, space).trim();
    const right = text.slice(space).trim();
    if (left.length > 0 && right.length > 0) return { left, right };
  }
  return null;
}

function formLang(form: Record<string, string>): string {
  if (Object.prototype.hasOwnProperty.call(form, 'default')) return 'default';
  const keys = Object.keys(form);
  return keys[0] ?? 'default';
}

function withForm(token: UnitTokenDocType, nextForm: string, now: string): UnitTokenDocType {
  const lang = formLang(token.form);
  return {
    ...token,
    form: { ...token.form, [lang]: nextForm },
    updatedAt: now,
  };
}

function filledGloss(gloss: UnitTokenDocType['gloss']): Record<string, string> | undefined {
  if (!gloss) return undefined;
  const next: Record<string, string> = {};
  for (const [key, text] of Object.entries(gloss)) {
    if (typeof text === 'string' && text.trim().length > 0) next[key] = text;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function glossFieldsConflict(
  left: UnitTokenDocType['gloss'],
  right: UnitTokenDocType['gloss'],
): boolean {
  const a = filledGloss(left);
  const b = filledGloss(right);
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if ((a[key] ?? '') !== (b[key] ?? '')) return true;
  }
  return false;
}

function textFieldsConflict(left: string | undefined, right: string | undefined): boolean {
  const a = (left ?? '').trim();
  const b = (right ?? '').trim();
  return a.length > 0 && b.length > 0 && a !== b;
}

function adoptedText(left: string | undefined, right: string | undefined): string | undefined {
  if ((left ?? '').trim().length > 0) return left;
  const next = (right ?? '').trim();
  return next.length > 0 ? next : undefined;
}

function adoptedGloss(
  left: UnitTokenDocType['gloss'],
  right: UnitTokenDocType['gloss'],
): UnitTokenDocType['gloss'] | undefined {
  if (filledGloss(left)) return left;
  if (filledGloss(right)) return right;
  return undefined;
}

/** Index where the right surface begins in the merged form. Offsets stay JS string indices. */
function annotationMergeRightSpanShift(leftSurface: string, rightSurface: string): number {
  if (leftSurface.length === 0 || rightSurface.length === 0) return 0;
  const merged = `${leftSurface} ${rightSurface}`.trim();
  const start = merged.lastIndexOf(rightSurface);
  return start >= 0 ? start : leftSurface.length + 1;
}

function shiftSurfaceParts(
  parts: UnitMorphemeDocType['surfaceParts'],
  shift: number,
): UnitMorphemeDocType['surfaceParts'] {
  if (!parts || parts.length === 0 || shift === 0) return parts;
  return parts.map((part) => ({
    startOffset: part.startOffset + shift,
    endOffset: part.endOffset + shift,
  }));
}

export async function splitAnnotationUnitToken(
  unitId: string,
  tokenId: string,
  deps: AnnotationTokenSplitDeps = defaultDeps,
): Promise<UnitTokenDocType[]> {
  const tokens = [...(await deps.listTokensByUnitId(unitId))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const index = tokens.findIndex((token) => token.id === tokenId);
  const token = tokens[index];
  if (!token) {
    throw new Error(`readback missing token ${tokenId}`);
  }
  const planned = planTokenSplit(pickDefaultTranscriptionText(token.form));
  if (!planned) {
    throw new Error('token split requires a space or | marker');
  }
  const now = new Date().toISOString();
  const rightId = newId('tok');
  await deps.saveToken(withForm(token, planned.left, now));
  await deps.saveToken({
    id: rightId,
    textId: token.textId,
    unitId,
    form: { default: planned.right },
    tokenIndex: token.tokenIndex + 1,
    createdAt: now,
    updatedAt: now,
  });
  for (const later of tokens.slice(index + 1)) {
    await deps.saveToken({
      ...later,
      tokenIndex: later.tokenIndex + 1,
      updatedAt: now,
    });
  }
  const readback = [...(await deps.listTokensByUnitIds([unitId]))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const left = readback.find((row) => row.id === tokenId);
  const right = readback.find((row) => row.id === rightId);
  if (!left || pickDefaultTranscriptionText(left.form) !== planned.left) {
    throw new Error(`token split left readback mismatch for ${tokenId}`);
  }
  if (!right || pickDefaultTranscriptionText(right.form) !== planned.right) {
    throw new Error(`token split right readback mismatch for ${rightId}`);
  }
  return readback;
}

export async function mergeAnnotationUnitTokenWithNext(
  unitId: string,
  tokenId: string,
  deps: AnnotationTokenSplitDeps = defaultDeps,
): Promise<UnitTokenDocType[]> {
  const tokens = [...(await deps.listTokensByUnitId(unitId))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const index = tokens.findIndex((token) => token.id === tokenId);
  const left = tokens[index];
  const right = tokens[index + 1];
  if (!left || !right) {
    throw new Error('token merge requires a following token');
  }
  const now = new Date().toISOString();
  const leftSurface = pickDefaultTranscriptionText(left.form);
  const rightSurface = pickDefaultTranscriptionText(right.form);
  const mergedForm = `${leftSurface} ${rightSurface}`.trim();
  const glossClash = glossFieldsConflict(left.gloss, right.gloss);
  const posClash = textFieldsConflict(left.pos, right.pos);
  const languageClash = textFieldsConflict(left.languageId, right.languageId);
  if (glossClash || posClash || languageClash) {
    const surface = tokens
      .map((token) => pickDefaultTranscriptionText(token.form))
      .filter((form) => form.length > 0)
      .join(' ');
    await submitAnnotationTokenSnapshot({
      textId: left.textId,
      unitId,
      surface: surface.length > 0 ? surface : mergedForm,
    });
  }
  const gloss = adoptedGloss(left.gloss, right.gloss);
  const pos = adoptedText(left.pos, right.pos);
  const languageId = adoptedText(left.languageId, right.languageId);
  const [leftMorphs, rightMorphs, rightLinks] = await Promise.all([
    deps.listMorphemesByTokenIds([left.id]),
    deps.listMorphemesByTokenIds([right.id]),
    deps.listTokenLexemeLinks('token', right.id),
  ]);
  const nextMorphIndex =
    leftMorphs.reduce((max, morph) => Math.max(max, morph.morphemeIndex), -1) + 1;
  await deps.saveToken({
    ...withForm(left, mergedForm, now),
    ...(gloss ? { gloss } : {}),
    ...(pos ? { pos } : {}),
    ...(languageId ? { languageId } : {}),
  });
  const spanShift = annotationMergeRightSpanShift(leftSurface, rightSurface);
  const orderedRightMorphs = [...rightMorphs].sort((a, b) => a.morphemeIndex - b.morphemeIndex);
  for (const [offset, morph] of orderedRightMorphs.entries()) {
    const surfaceParts = shiftSurfaceParts(morph.surfaceParts, spanShift);
    await deps.saveMorpheme({
      ...morph,
      tokenId: left.id,
      morphemeIndex: nextMorphIndex + offset,
      ...(surfaceParts && surfaceParts.length > 0 ? { surfaceParts } : {}),
      updatedAt: now,
    });
  }
  for (const link of rightLinks) {
    await deps.saveTokenLexemeLink({
      ...link,
      targetId: left.id,
      updatedAt: now,
    });
  }
  await deps.removeToken(right.id);
  for (const later of tokens.slice(index + 2)) {
    await deps.saveToken({
      ...later,
      tokenIndex: later.tokenIndex - 1,
      updatedAt: now,
    });
  }
  const readback = [...(await deps.listTokensByUnitIds([unitId]))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const stored = readback.find((row) => row.id === tokenId);
  if (!stored || pickDefaultTranscriptionText(stored.form) !== mergedForm) {
    throw new Error(`token merge readback mismatch for ${tokenId}`);
  }
  if (readback.some((row) => row.id === right.id)) {
    throw new Error(`token merge readback still has ${right.id}`);
  }
  return readback;
}
