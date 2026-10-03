import { getDb, withTransaction, type TextDocType } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';

const SPEAKER_IDS_KEY = projectTextMetadataKey.projectSpeakerIds;

function readIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (id.length > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function readProjectSpeakerIds(metadata: unknown): string[] | null {
  if (!metadata || typeof metadata !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(metadata, SPEAKER_IDS_KEY)) return null;
  return readIdList((metadata as Record<string, unknown>)[SPEAKER_IDS_KEY]) ?? [];
}

async function readText(textId: string): Promise<TextDocType | undefined> {
  const database = await getDb();
  const existing = await database.collections.texts.findOne({ selector: { id: textId } }).exec();
  return existing?.toJSON();
}

async function writeProjectSpeakerIds(
  textId: string,
  speakerIds: readonly string[],
): Promise<void> {
  const database = await getDb();
  const existing = await readText(textId);
  if (!existing) return;
  const metadata = (existing.metadata as Record<string, unknown> | undefined) ?? {};
  const updated: TextDocType = {
    ...existing,
    metadata: {
      ...metadata,
      [SPEAKER_IDS_KEY]: [...speakerIds],
    },
    updatedAt: new Date().toISOString(),
  };
  await database.collections.texts.remove(textId);
  await database.collections.texts.insert(updated);
}

async function speakerIdsOnUnits(textId: string): Promise<string[]> {
  const database = await getDb();
  const units = await withTransaction(
    database,
    'r',
    [database.dexie.layer_units],
    async () => database.dexie.layer_units.where('textId').equals(textId).toArray(),
    { label: 'speakerProjectMembership.speakerIdsOnUnits' },
  );
  const ids: string[] = [];
  for (const unit of units) {
    const speakerId = unit.speakerId?.trim() ?? '';
    if (speakerId.length > 0 && !ids.includes(speakerId)) ids.push(speakerId);
  }
  return ids;
}

/** Roster for this text, including speakers already assigned on its units. */
export async function ensureProjectSpeakerIds(textId: string): Promise<string[]> {
  const id = textId.trim();
  if (!id) return [];
  const text = await readText(id);
  const fromUnits = await speakerIdsOnUnits(id);
  const stored = text ? readProjectSpeakerIds(text.metadata) : null;
  const next = stored === null ? fromUnits : [...stored];
  for (const speakerId of fromUnits) {
    if (!next.includes(speakerId)) next.push(speakerId);
  }
  if (text && (stored === null || next.length !== stored.length)) {
    await writeProjectSpeakerIds(id, next);
  }
  return next;
}

export async function attachSpeakerToProject(speakerId: string, textId: string): Promise<void> {
  const id = speakerId.trim();
  const projectId = textId.trim();
  if (!id || !projectId) return;
  const current = await ensureProjectSpeakerIds(projectId);
  if (current.includes(id)) return;
  await writeProjectSpeakerIds(projectId, [...current, id]);
}

export async function detachSpeakerFromProjects(speakerId: string): Promise<void> {
  const id = speakerId.trim();
  if (!id) return;
  const database = await getDb();
  const docs = await database.collections.texts.find().exec();
  for (const doc of docs) {
    const text = doc.toJSON();
    const ids = readProjectSpeakerIds(text.metadata);
    if (ids === null || !ids.includes(id)) continue;
    await writeProjectSpeakerIds(
      text.id,
      ids.filter((speaker) => speaker !== id),
    );
  }
}
