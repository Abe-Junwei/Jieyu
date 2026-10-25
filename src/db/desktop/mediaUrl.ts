import path from 'node:path';
import { grantDesktopMedia } from '../../desktop/skeleton/desktopMediaGrant';
import { getMedia, mediaRelpath } from './media';
import { desktopSessionFolder, requireDesktopSession } from './projectSession';

export function desktopMediaPlayUrl(sessionId: string, mediaId: string): { url: string } {
  const project = requireDesktopSession(sessionId);
  const media = getMedia(project.db, mediaId);
  if (!media) throw new Error('media file is missing');
  const relative = mediaRelpath(desktopSessionFolder(sessionId), media.relpath);
  const absolute = path.resolve(desktopSessionFolder(sessionId), relative);
  const token = grantDesktopMedia(sessionId, absolute);
  return { url: `jieyu-media://local/${token}` };
}
