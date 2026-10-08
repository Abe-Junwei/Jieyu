import { getDb, withTransaction } from '../db';
import { isAuxiliaryRecordingMediaRow, isMediaItemPlaceholderRow } from '../utils/mediaItemState';
import {
  audioDisplayName,
  linkManuscriptsToAudio,
  readProjectSourceFiles,
  sourceFileId,
  upsertProjectSourceFile,
  type ProjectAudioFile,
  type ProjectFileView,
  type ProjectSourceFile,
} from '../utils/projectSourceFiles';

async function readTextMetadata(textId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const text = await db.dexie.texts.get(textId);
  const metadata = text?.metadata;
  return metadata && typeof metadata === 'object' ? { ...metadata } : {};
}

export async function listProjectSourceFiles(textId: string): Promise<ProjectSourceFile[]> {
  return readProjectSourceFiles(await readTextMetadata(textId));
}

export async function listProjectAudioFiles(textId: string): Promise<ProjectAudioFile[]> {
  const db = await getDb();
  const rows = await db.dexie.media_items.where('textId').equals(textId).toArray();
  return rows
    .filter((row) => !isMediaItemPlaceholderRow(row) && !isAuxiliaryRecordingMediaRow(row))
    .map((row) => {
      const details =
        row.details && typeof row.details === 'object'
          ? (row.details as Record<string, unknown>)
          : {};
      const duration =
        typeof row.duration === 'number' && Number.isFinite(row.duration)
          ? row.duration
          : undefined;
      return {
        id: row.id,
        filename: row.filename,
        name: audioDisplayName(row.filename, details) || row.id,
        ...(duration !== undefined ? { durationSec: duration } : {}),
      };
    });
}

export async function listProjectFileViews(textId: string): Promise<ProjectFileView[]> {
  const [audio, stored] = await Promise.all([
    listProjectAudioFiles(textId),
    listProjectSourceFiles(textId),
  ]);
  let sources = stored;
  if (sources.length === 0) {
    const db = await getDb();
    const unitCount = await withTransaction(
      db,
      'r',
      [db.dexie.layer_units],
      async () => db.dexie.layer_units.where('textId').equals(textId).count(),
      { label: 'projectFileOps.unitCount' },
    );
    if (unitCount > 0) {
      const only = audio.length === 1 ? audio[0] : undefined;
      sources = [
        {
          id: `src-manuscript-${textId}`,
          name: '',
          format: 'file',
          ...(only ? { mediaId: only.id, linkedMediaFilename: only.filename } : {}),
        },
      ];
    }
  }
  return linkManuscriptsToAudio(audio, sources);
}

export async function rememberImportedSourceFile(input: {
  textId: string;
  name: string;
  format: string;
  mediaId?: string;
  linkedMediaFilename?: string;
}): Promise<void> {
  const name = input.name.trim();
  if (name.length === 0) return;
  const db = await getDb();
  const text = await db.dexie.texts.get(input.textId);
  if (!text) return;
  const metadata = text.metadata && typeof text.metadata === 'object' ? { ...text.metadata } : {};
  const next = upsertProjectSourceFile(readProjectSourceFiles(metadata), {
    id: sourceFileId(input.format, name),
    name,
    format: input.format,
    ...(input.mediaId && input.mediaId.trim().length > 0 ? { mediaId: input.mediaId.trim() } : {}),
    ...(input.linkedMediaFilename && input.linkedMediaFilename.trim().length > 0
      ? { linkedMediaFilename: input.linkedMediaFilename.trim() }
      : {}),
  });
  await db.dexie.texts.put({
    ...text,
    metadata: { ...metadata, sourceFiles: next },
    updatedAt: new Date().toISOString(),
  });
}

export async function renameProjectAudio(mediaId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const db = await getDb();
  const row = await db.dexie.media_items.get(mediaId);
  if (!row) return;
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  await db.dexie.media_items.put({
    ...row,
    details: { ...details, displayName: trimmed },
  });
}

export async function renameProjectSourceFile(
  textId: string,
  fileId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const db = await getDb();
  const text = await db.dexie.texts.get(textId);
  if (!text) return;
  const metadata = text.metadata && typeof text.metadata === 'object' ? { ...text.metadata } : {};
  const files = readProjectSourceFiles(metadata).map((file) =>
    file.id === fileId ? { ...file, name: trimmed } : file,
  );
  await db.dexie.texts.put({
    ...text,
    metadata: { ...metadata, sourceFiles: files },
    updatedAt: new Date().toISOString(),
  });
}
