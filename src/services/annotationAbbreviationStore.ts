import { listStandardLeipzigAbbreviations } from '../ai/LeipzigValidator';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE } from '../annotation/structuralRuleProfile';
import { getDb, type TextDocType } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';

export type AnnotationAbbreviation = {
  abbreviation: string;
  name: string;
  leipzig: boolean;
};

const METADATA_KEY = projectTextMetadataKey.annotationAbbreviations;

function leipzigSeedCodes(): string[] {
  return [
    ...new Set([
      ...listStandardLeipzigAbbreviations(),
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.zeroMarkers,
      ...DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.reduplicationMarkers,
    ]),
  ];
}

export function buildLeipzigAbbreviationSeed(): AnnotationAbbreviation[] {
  return leipzigSeedCodes()
    .map((abbreviation) => ({
      abbreviation,
      name: abbreviation,
      leipzig: true,
    }))
    .sort((left, right) => left.abbreviation.localeCompare(right.abbreviation, 'en'));
}

export function readAnnotationAbbreviations(metadata: unknown): AnnotationAbbreviation[] | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[METADATA_KEY];
  if (!Array.isArray(raw)) return null;
  const rows: AnnotationAbbreviation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const abbreviation = typeof record.abbreviation === 'string' ? record.abbreviation.trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!abbreviation || !name) continue;
    rows.push({
      abbreviation: abbreviation.toUpperCase(),
      name,
      leipzig: record.leipzig === true,
    });
  }
  return rows;
}

async function readText(textId: string): Promise<TextDocType> {
  const database = await getDb();
  const existing = await database.collections.texts.findOne({ selector: { id: textId } }).exec();
  if (!existing) throw new Error(`文本不存在: ${textId}`);
  return existing.toJSON();
}

async function writeAbbreviations(textId: string, rows: AnnotationAbbreviation[]): Promise<void> {
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

export async function listAnnotationAbbreviations(
  textId: string,
): Promise<AnnotationAbbreviation[]> {
  const text = await readText(textId);
  return readAnnotationAbbreviations(text.metadata) ?? buildLeipzigAbbreviationSeed();
}

async function saveEditedList(
  textId: string,
  edit: (rows: AnnotationAbbreviation[]) => AnnotationAbbreviation[] | 'duplicate' | 'empty',
): Promise<'added' | 'duplicate' | 'empty' | 'saved'> {
  const current = await listAnnotationAbbreviations(textId);
  const next = edit(current);
  if (next === 'duplicate') return 'duplicate';
  if (next === 'empty') return 'empty';
  await writeAbbreviations(textId, next);
  return 'saved';
}

export async function addAnnotationAbbreviation(
  textId: string,
  abbreviation: string,
  name: string,
): Promise<'added' | 'duplicate' | 'empty'> {
  const code = abbreviation.trim().toUpperCase();
  const label = name.trim();
  if (!code || !label) return 'empty';
  const result = await saveEditedList(textId, (rows) => {
    if (rows.some((row) => row.abbreviation === code)) return 'duplicate';
    return [...rows, { abbreviation: code, name: label, leipzig: false }].sort((left, right) =>
      left.abbreviation.localeCompare(right.abbreviation, 'en'),
    );
  });
  return result === 'saved' ? 'added' : result;
}

export async function renameAnnotationAbbreviation(
  textId: string,
  abbreviation: string,
  name: string,
): Promise<void> {
  const label = name.trim();
  const code = abbreviation.trim().toUpperCase();
  if (!label || !code) return;
  await saveEditedList(textId, (rows) =>
    rows.map((row) => (row.abbreviation === code ? { ...row, name: label } : row)),
  );
}

export async function removeAnnotationAbbreviation(
  textId: string,
  abbreviation: string,
): Promise<void> {
  const code = abbreviation.trim().toUpperCase();
  await saveEditedList(textId, (rows) => rows.filter((row) => row.abbreviation !== code));
}
