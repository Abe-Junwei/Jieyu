import type Database from 'better-sqlite3';
import { createLayer } from './layers';
import { listManuscripts, createManuscript } from './manuscripts';
import { createMedia, listActiveMedia, mediaRelpath } from './media';

type SqliteDatabase = InstanceType<typeof Database>;

export interface RecordingRegistration {
  relpath: string;
  sha256: string;
  duration: number;
  title: Record<string, string>;
  layerKey: string;
  layerName: Record<string, string>;
  tierType: string;
  contentType: string;
}

export interface RegisteredRecording {
  mediaId: string;
  manuscriptId: string;
  created: boolean;
}

/** One recording, one manuscript, and its transcription layer, or the manuscript already on that file. */
export function registerRecording(
  db: SqliteDatabase,
  folder: string,
  input: RecordingRegistration,
): RegisteredRecording {
  const relpath = mediaRelpath(folder, input.relpath);
  const write = db.transaction(() => {
    const existing = listActiveMedia(db).find(
      (item) => item.relpath === relpath && item.sha256 === input.sha256,
    );
    const media =
      existing ??
      createMedia(db, folder, { relpath, sha256: input.sha256, duration: input.duration });
    const hung = listManuscripts(db).find((item) => item.mediaId === media.id);
    if (hung) return { mediaId: media.id, manuscriptId: hung.id, created: false };
    const manuscript = createManuscript(db, { title: input.title, mediaId: media.id });
    createLayer(db, {
      manuscriptId: manuscript.id,
      key: input.layerKey,
      name: input.layerName,
      tierType: input.tierType,
      contentType: input.contentType,
    });
    return { mediaId: media.id, manuscriptId: manuscript.id, created: true };
  });
  return write();
}
