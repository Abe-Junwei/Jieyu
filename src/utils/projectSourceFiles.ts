export interface ProjectSourceFile {
  id: string;
  name: string;
  format: string;
  mediaId?: string;
  linkedMediaFilename?: string;
}

export interface ProjectAudioFile {
  id: string;
  name: string;
  filename: string;
  durationSec?: number;
  transcriptionRate?: number | null;
  translationRate?: number | null;
  annotationRate?: number | null;
}

export interface ProjectFileView {
  id: string;
  kind: 'audio' | 'manuscript';
  format: string;
  name: string;
  mediaId?: string;
  durationSec?: number;
  linkedAudioId?: string;
  transcriptionRate?: number | null;
  translationRate?: number | null;
  annotationRate?: number | null;
}

const SOURCE_FORMATS = new Set([
  'eaf',
  'textgrid',
  'trs',
  'flextext',
  'toolbox',
  'txt',
  'jyt',
  'jym',
]);

export function sourceFormatFromName(name: string): string {
  const ext = name.trim().split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'textgrid') return 'textgrid';
  return SOURCE_FORMATS.has(ext) ? ext : 'file';
}

export function readProjectSourceFiles(
  metadata: Record<string, unknown> | undefined,
): ProjectSourceFile[] {
  const raw = metadata?.sourceFiles;
  if (!Array.isArray(raw)) return [];
  const files: ProjectSourceFile[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const format = typeof row.format === 'string' ? row.format.trim() : '';
    if (id.length === 0 || name.length === 0 || format.length === 0) continue;
    const mediaId = typeof row.mediaId === 'string' ? row.mediaId.trim() : '';
    const linkedMediaFilename =
      typeof row.linkedMediaFilename === 'string' ? row.linkedMediaFilename.trim() : '';
    files.push({
      id,
      name,
      format,
      ...(mediaId.length > 0 ? { mediaId } : {}),
      ...(linkedMediaFilename.length > 0 ? { linkedMediaFilename } : {}),
    });
  }
  return files;
}

export function upsertProjectSourceFile(
  files: readonly ProjectSourceFile[],
  next: ProjectSourceFile,
): ProjectSourceFile[] {
  return [...files.filter((file) => file.id !== next.id), next];
}

export function sourceFileId(format: string, name: string): string {
  return `src-${format}-${name.trim().toLowerCase()}`;
}

export function audioDisplayName(
  filename: string,
  details: Record<string, unknown> | undefined,
): string {
  const displayName = typeof details?.displayName === 'string' ? details.displayName.trim() : '';
  if (displayName.length > 0) return displayName;
  const trimmed = filename.trim();
  return trimmed.length > 0 ? trimmed : '';
}

export function orderProjectFiles(files: readonly ProjectFileView[]): ProjectFileView[] {
  const audio = files.filter((file) => file.kind === 'audio');
  const manuscripts = files.filter((file) => file.kind === 'manuscript');
  const used = new Set<string>();
  const ordered: ProjectFileView[] = [];
  for (const row of audio) {
    ordered.push(row);
    for (const doc of manuscripts) {
      if (doc.linkedAudioId === row.id) {
        ordered.push(doc);
        used.add(doc.id);
      }
    }
  }
  for (const doc of manuscripts) {
    if (!used.has(doc.id)) ordered.push(doc);
  }
  return ordered;
}

export function linkManuscriptsToAudio(
  audio: readonly ProjectAudioFile[],
  sources: readonly ProjectSourceFile[],
): ProjectFileView[] {
  const audioByFilename = new Map(
    audio.map((row) => [row.filename.trim().toLowerCase(), row.id] as const),
  );
  const views: ProjectFileView[] = audio.map((row) => ({
    id: row.id,
    kind: 'audio',
    format: 'audio',
    name: row.name,
    mediaId: row.id,
    ...(row.durationSec !== undefined ? { durationSec: row.durationSec } : {}),
    ...(row.transcriptionRate !== undefined ? { transcriptionRate: row.transcriptionRate } : {}),
    ...(row.translationRate !== undefined ? { translationRate: row.translationRate } : {}),
    ...(row.annotationRate !== undefined ? { annotationRate: row.annotationRate } : {}),
  }));
  for (const source of sources) {
    const linkedFromFilename =
      source.linkedMediaFilename !== undefined && source.linkedMediaFilename.length > 0
        ? audioByFilename.get(source.linkedMediaFilename.trim().toLowerCase())
        : undefined;
    const linkedFromName = source.mediaId ?? linkedFromFilename;
    views.push({
      id: source.id,
      kind: 'manuscript',
      format: source.format,
      name: source.name,
      ...(linkedFromName !== undefined
        ? { mediaId: linkedFromName, linkedAudioId: linkedFromName }
        : {}),
    });
  }
  return orderProjectFiles(views);
}
