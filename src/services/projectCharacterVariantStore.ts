import { getDb, type TextDocType } from '../db';

const METADATA_KEY = 'characterVariantLines';

export function readCharacterVariantLines(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const raw = (metadata as Record<string, unknown>)[METADATA_KEY];
  return typeof raw === 'string' ? raw : '';
}

export async function loadCharacterVariantLines(textId: string): Promise<string> {
  const id = textId.trim();
  if (!id) return '';
  const database = await getDb();
  const existing = await database.collections.texts.findOne({ selector: { id } }).exec();
  if (!existing) return '';
  return readCharacterVariantLines(existing.toJSON().metadata);
}

export async function saveCharacterVariantLines(textId: string, lines: string): Promise<void> {
  const id = textId.trim();
  if (!id) return;
  const database = await getDb();
  const existingDoc = await database.collections.texts.findOne({ selector: { id } }).exec();
  if (!existingDoc) return;
  const existing = existingDoc.toJSON();
  const metadata = (existing.metadata as Record<string, unknown> | undefined) ?? {};
  const updated: TextDocType = {
    ...existing,
    metadata: {
      ...metadata,
      [METADATA_KEY]: lines,
    },
    updatedAt: new Date().toISOString(),
  };
  await database.collections.texts.remove(id);
  await database.collections.texts.insert(updated);
}
