import { createDesktopClient } from '../db/desktop/client';
import type { DesktopReadHost } from './projectReadHost';

export interface ImportedRecordingFile {
  relpath: string;
  sha256: string;
  filename: string;
  url: string;
}

/** Register a copied recording on a manuscript. The layer list stays empty. */
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
  const listed = await client.listMedia(sessionId);
  const existing = listed.find(
    (item) => item.relpath === picked.relpath && item.sha256 === picked.sha256,
  );
  const registered = await client.registerRecording(sessionId, {
    relpath: picked.relpath,
    sha256: picked.sha256,
    duration: existing?.duration ?? (await recordingDuration(picked.url, input.durationOf)),
    title: { und: titleOf(picked.filename) },
  });
  input.adopt(sessionId);
  input.select(registered.manuscriptId, undefined, sessionId);
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
