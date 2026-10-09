import { getDb, withTransaction } from '../db';
import { projectTextMetadataKey } from '../types/projectTextMetadata';
import { patchProjectMetadata } from './projectMetadataPatch';

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

/**
 * 在项目行的事务里读出名单、合并、写回（F3）；返回写入后的名单，项目不存在时返回 null。
 * Read, merge and write the roster inside the project-row transaction (F3); null without a project.
 */
async function editProjectSpeakerIds(
  textId: string,
  edit: (stored: string[] | null) => string[],
): Promise<string[] | null> {
  let roster: string[] = [];
  const result = await patchProjectMetadata(textId, (metadata) => {
    const stored = readProjectSpeakerIds(metadata);
    roster = edit(stored);
    const unchanged =
      stored !== null &&
      stored.length === roster.length &&
      stored.every((speakerId, index) => roster[index] === speakerId);
    return unchanged ? null : { ...metadata, [SPEAKER_IDS_KEY]: [...roster] };
  });
  return result.status === 'not-found' ? null : roster;
}

function mergeIds(base: readonly string[], extra: readonly string[]): string[] {
  const next = [...base];
  for (const id of extra) if (!next.includes(id)) next.push(id);
  return next;
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
  const fromUnits = await speakerIdsOnUnits(id);
  const roster = await editProjectSpeakerIds(id, (stored) => mergeIds(stored ?? [], fromUnits));
  return roster ?? fromUnits;
}

export async function attachSpeakerToProject(speakerId: string, textId: string): Promise<void> {
  const id = speakerId.trim();
  const projectId = textId.trim();
  if (!id || !projectId) return;
  const fromUnits = await speakerIdsOnUnits(projectId);
  await editProjectSpeakerIds(projectId, (stored) => mergeIds(stored ?? [], [...fromUnits, id]));
}

export async function detachSpeakerFromProjects(speakerId: string): Promise<void> {
  const id = speakerId.trim();
  if (!id) return;
  const database = await getDb();
  const texts = await database.dexie.texts.toArray();
  for (const text of texts) {
    const ids = readProjectSpeakerIds(text.metadata);
    if (ids === null || !ids.includes(id)) continue;
    await editProjectSpeakerIds(text.id, (stored) =>
      (stored ?? []).filter((speaker) => speaker !== id),
    );
  }
}
