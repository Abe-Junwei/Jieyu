import { UD_POS_TAGS } from '../annotation/udPosTags';
import { getDb, type TextDocType } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';
import {
  ProjectNotFoundError,
  patchProjectMetadata,
  requireProjectPatch,
} from './projectMetadataPatch';

export type AnnotationPosCategory = {
  abbreviation: string;
  name: string;
};

const METADATA_KEY = projectTextMetadataKey.annotationPosCategories;

export function buildUdPosCategorySeed(): AnnotationPosCategory[] {
  return UD_POS_TAGS.map((abbreviation) => ({ abbreviation, name: abbreviation }));
}

export function readAnnotationPosCategories(metadata: unknown): AnnotationPosCategory[] | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[METADATA_KEY];
  if (!Array.isArray(raw)) return null;
  const rows: AnnotationPosCategory[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const abbreviation = typeof record.abbreviation === 'string' ? record.abbreviation.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!abbreviation || !name) continue;
    rows.push({ abbreviation: abbreviation.toUpperCase(), name });
  }
  return rows;
}

async function readText(textId: string): Promise<TextDocType> {
  const database = await getDb();
  const existing = await database.dexie.texts.get(textId);
  if (!existing) throw new ProjectNotFoundError(textId);
  return existing;
}

/**
 * 在项目行的事务里读出当前列表、编辑、写回，避免并发编辑互相覆盖（F3）。
 * Read, edit and write the list inside the project-row transaction so concurrent edits do not
 * overwrite each other (F3).
 */
async function editCategories<R extends string>(
  textId: string,
  edit: (rows: AnnotationPosCategory[]) => AnnotationPosCategory[] | R,
): Promise<R | 'saved'> {
  let outcome: R | 'saved' = 'saved';
  requireProjectPatch(
    textId,
    await patchProjectMetadata(textId, (metadata) => {
      const current = readAnnotationPosCategories(metadata) ?? buildUdPosCategorySeed();
      const next = edit(current);
      if (typeof next === 'string') {
        outcome = next;
        return null;
      }
      return { ...metadata, [METADATA_KEY]: next };
    }),
  );
  return outcome;
}

export async function listAnnotationPosCategories(
  textId: string,
): Promise<AnnotationPosCategory[]> {
  const text = await readText(textId);
  return readAnnotationPosCategories(text.metadata) ?? buildUdPosCategorySeed();
}

export async function addAnnotationPosCategory(
  textId: string,
  abbreviation: string,
  name: string,
): Promise<'added' | 'duplicate' | 'empty'> {
  const code = abbreviation.trim().toUpperCase();
  const label = name.trim();
  if (!code || !label) return 'empty';
  const result = await editCategories(textId, (current) => {
    if (current.some((row) => row.abbreviation === code)) return 'duplicate' as const;
    return [...current, { abbreviation: code, name: label }].sort((left, right) =>
      left.abbreviation.localeCompare(right.abbreviation, 'en'),
    );
  });
  return result === 'saved' ? 'added' : result;
}

export async function renameAnnotationPosCategory(
  textId: string,
  abbreviation: string,
  name: string,
): Promise<void> {
  const label = name.trim();
  const code = abbreviation.trim().toUpperCase();
  if (!label || !code) return;
  await editCategories(textId, (current) =>
    current.map((row) => (row.abbreviation === code ? { ...row, name: label } : row)),
  );
}

export async function removeAnnotationPosCategory(
  textId: string,
  abbreviation: string,
): Promise<void> {
  const code = abbreviation.trim().toUpperCase();
  await editCategories(textId, (current) => current.filter((row) => row.abbreviation !== code));
}
