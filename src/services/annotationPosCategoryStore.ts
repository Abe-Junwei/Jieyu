import { UD_POS_TAGS } from '../annotation/udPosTags';
import { getDb, type TextDocType } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';

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
  const existing = await database.collections.texts.findOne({ selector: { id: textId } }).exec();
  if (!existing) throw new Error(`文本不存在: ${textId}`);
  return existing.toJSON();
}

async function writeCategories(textId: string, rows: AnnotationPosCategory[]): Promise<void> {
  const database = await getDb();
  const existing = await readText(textId);
  const metadata = (existing.metadata as Record<string, unknown> | undefined) ?? {};
  const updated: TextDocType = {
    ...existing,
    metadata: {
      ...metadata,
      [METADATA_KEY]: rows,
    },
    updatedAt: new Date().toISOString(),
  };
  await database.collections.texts.remove(textId);
  await database.collections.texts.insert(updated);
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
  const current = await listAnnotationPosCategories(textId);
  if (current.some((row) => row.abbreviation === code)) return 'duplicate';
  await writeCategories(
    textId,
    [...current, { abbreviation: code, name: label }].sort((left, right) =>
      left.abbreviation.localeCompare(right.abbreviation, 'en'),
    ),
  );
  return 'added';
}

export async function renameAnnotationPosCategory(
  textId: string,
  abbreviation: string,
  name: string,
): Promise<void> {
  const label = name.trim();
  const code = abbreviation.trim().toUpperCase();
  if (!label || !code) return;
  const current = await listAnnotationPosCategories(textId);
  await writeCategories(
    textId,
    current.map((row) => (row.abbreviation === code ? { ...row, name: label } : row)),
  );
}

export async function removeAnnotationPosCategory(
  textId: string,
  abbreviation: string,
): Promise<void> {
  const code = abbreviation.trim().toUpperCase();
  const current = await listAnnotationPosCategories(textId);
  await writeCategories(
    textId,
    current.filter((row) => row.abbreviation !== code),
  );
}
