import { getDb } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';
import { patchProjectMetadata } from './projectMetadataPatch';

const METADATA_KEY = projectTextMetadataKey.characterVariantLines;

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
  await patchProjectMetadata(id, (metadata) => ({ ...metadata, [METADATA_KEY]: lines }));
}
