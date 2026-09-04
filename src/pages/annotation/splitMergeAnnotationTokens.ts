import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { UnitTokenDocType } from '../../types/jieyuDbDocTypes';
import { newId, pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';

export type AnnotationTokenSplitDeps = {
  listTokensByUnitId: (unitId: string) => Promise<UnitTokenDocType[]>;
  saveToken: (data: UnitTokenDocType) => Promise<string>;
  removeToken: (tokenId: string) => Promise<void>;
  listTokensByUnitIds: (unitIds: readonly string[]) => Promise<UnitTokenDocType[]>;
};

const defaultDeps: AnnotationTokenSplitDeps = {
  listTokensByUnitId: (unitId) => LinguisticService.units.listTokensByUnitId(unitId),
  saveToken: (data) => LinguisticService.units.saveToken(data),
  removeToken: (tokenId) => LinguisticService.units.removeToken(tokenId),
  listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
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
  const mergedForm =
    `${pickDefaultTranscriptionText(left.form)} ${pickDefaultTranscriptionText(right.form)}`.trim();
  await deps.saveToken(withForm(left, mergedForm, now));
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
