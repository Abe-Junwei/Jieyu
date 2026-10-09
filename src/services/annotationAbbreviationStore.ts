import { listStandardLeipzigAbbreviations } from '../ai/LeipzigValidator';
import { DEFAULT_LEIPZIG_STRUCTURAL_PROFILE } from '../annotation/structuralRuleProfile';
import { getDb, type TextDocType } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';
import {
  ProjectNotFoundError,
  patchProjectMetadata,
  requireProjectPatch,
} from './projectMetadataPatch';

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
  const existing = await database.dexie.texts.get(textId);
  if (!existing) throw new ProjectNotFoundError(textId);
  return existing;
}

export async function listAnnotationAbbreviations(
  textId: string,
): Promise<AnnotationAbbreviation[]> {
  const text = await readText(textId);
  return readAnnotationAbbreviations(text.metadata) ?? buildLeipzigAbbreviationSeed();
}

/**
 * 在项目行的事务里读出当前列表、编辑、写回，避免并发编辑互相覆盖（F3）。
 * Read, edit and write the list inside the project-row transaction (F3).
 */
async function saveEditedList(
  textId: string,
  edit: (rows: AnnotationAbbreviation[]) => AnnotationAbbreviation[] | 'duplicate' | 'empty',
): Promise<'added' | 'duplicate' | 'empty' | 'saved'> {
  let outcome: 'duplicate' | 'empty' | 'saved' = 'saved';
  requireProjectPatch(
    textId,
    await patchProjectMetadata(textId, (metadata) => {
      const current = readAnnotationAbbreviations(metadata) ?? buildLeipzigAbbreviationSeed();
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
