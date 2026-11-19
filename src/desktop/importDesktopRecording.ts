import { createDesktopClient } from '../db/desktop/client';
import type { Media } from '../db/desktop/media';
import type { DesktopReadHost } from './projectReadHost';

export interface ImportedRecordingFile {
  relpath: string;
  sha256: string;
  filename: string;
  url: string;
}

/** Register a copied recording on a manuscript and a time-aligned transcription layer. */
export async function registerImportedRecording(input: {
  host: DesktopReadHost;
  sessionId: string | null;
  adopt: (sessionId: string) => void;
  select: (manuscriptId: string, layerId: string | undefined, sessionId: string) => void;
  durationOf: (url: string) => Promise<number>;
}): Promise<void> {
  const picked = await input.host.importRecording?.(input.sessionId);
  if (picked === undefined || 'cancelled' in picked) return;
  const sessionId = picked.sessionId;
  const client = createDesktopClient({ desktopCall: input.host.desktopCall });
  const listed = (await input.host.desktopCall(sessionId, 'media.list', {})) as Media[];
  const existing = listed.find(
    (item) => item.relpath === picked.relpath && item.sha256 === picked.sha256,
  );
  const media =
    existing ??
    (await client.createMedia(sessionId, {
      relpath: picked.relpath,
      sha256: picked.sha256,
      duration: await recordingDuration(picked.url, input.durationOf),
    }));
  const hung = (await client.listManuscripts(sessionId)).find((item) => item.mediaId === media.id);
  if (hung) {
    input.adopt(sessionId);
    input.select(hung.id, undefined, sessionId);
    return;
  }
  const manuscript = await client.createManuscript(sessionId, {
    title: { und: titleOf(picked.filename) },
    mediaId: media.id,
  });
  await client.createLayer(sessionId, {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  });
  input.adopt(sessionId);
  input.select(manuscript.id, undefined, sessionId);
}

async function recordingDuration(
  url: string,
  durationOf: (url: string) => Promise<number>,
): Promise<number> {
  const duration = await durationOf(url);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('media duration is missing');
  return duration;
}

function titleOf(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base.length > 0 ? base : filename;
}
