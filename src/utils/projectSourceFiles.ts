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
  audioFormat?: string;
  sentenceCount?: number;
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
  audioFormat?: string;
  sentenceCount?: number;
  linkedAudioId?: string;
  /** 文件名唯一匹配到的录音，只作提示，不算关联（rev5 4.2-4）| Unique filename match; a hint, not a link */
  suggestedAudioId?: string;
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

const SYNTHETIC_MANUSCRIPT_PREFIX = 'synthetic:annotation-document:';

/**
 * 没有来源记录但有语段时显示的“合成文稿”行 id（N11）。来源 id 一律是 UUID，这个带命名空间的 id 不会和它们撞车。
 * Id of the synthetic manuscript row shown when a project has units but no source record (N11). Source
 * ids are UUIDs, so this namespaced id cannot collide with them.
 */
export function syntheticManuscriptId(textId: string): string {
  return `${SYNTHETIC_MANUSCRIPT_PREFIX}${textId}`;
}

export function isSyntheticManuscriptId(id: string): boolean {
  return id.startsWith(SYNTHETIC_MANUSCRIPT_PREFIX);
}

/** 来源记录 → 文件列表用的来源视图 | Source record → file-list source view */
export function sourceFileFromRecord(record: {
  id: string;
  displayName: string;
  format: string;
  mediaId?: string;
  linkedMediaFilename?: string;
}): ProjectSourceFile {
  return {
    id: record.id,
    name: record.displayName,
    format: record.format,
    ...(record.mediaId !== undefined && record.mediaId.length > 0
      ? { mediaId: record.mediaId }
      : {}),
    ...(record.linkedMediaFilename !== undefined && record.linkedMediaFilename.length > 0
      ? { linkedMediaFilename: record.linkedMediaFilename }
      : {}),
  };
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

/**
 * 关联只认显式 mediaId（rev5 4.2-4）。原件里写的录音文件名只在恰好匹配一条录音时给出提示；
 * 同名录音有多条时不提示，更不自动关联。
 * Only an explicit mediaId links (rev5 4.2-4). A recording file name written in the source only yields a
 * hint when exactly one recording matches; duplicates yield nothing and never auto-link.
 */
export function linkManuscriptsToAudio(
  audio: readonly ProjectAudioFile[],
  sources: readonly ProjectSourceFile[],
): ProjectFileView[] {
  const audioIds = new Set(audio.map((row) => row.id));
  const audioByFilename = new Map<string, string[]>();
  for (const row of audio) {
    const key = row.filename.trim().toLowerCase();
    audioByFilename.set(key, [...(audioByFilename.get(key) ?? []), row.id]);
  }
  const views: ProjectFileView[] = audio.map((row) => ({
    id: row.id,
    kind: 'audio',
    format: 'audio',
    name: row.name,
    mediaId: row.id,
    ...(row.durationSec !== undefined ? { durationSec: row.durationSec } : {}),
    ...(row.audioFormat !== undefined ? { audioFormat: row.audioFormat } : {}),
    ...(row.sentenceCount !== undefined ? { sentenceCount: row.sentenceCount } : {}),
    ...(row.transcriptionRate !== undefined ? { transcriptionRate: row.transcriptionRate } : {}),
    ...(row.translationRate !== undefined ? { translationRate: row.translationRate } : {}),
    ...(row.annotationRate !== undefined ? { annotationRate: row.annotationRate } : {}),
  }));
  for (const source of sources) {
    const linked =
      source.mediaId !== undefined && audioIds.has(source.mediaId) ? source.mediaId : undefined;
    const candidates =
      linked === undefined &&
      source.linkedMediaFilename !== undefined &&
      source.linkedMediaFilename.trim().length > 0
        ? (audioByFilename.get(source.linkedMediaFilename.trim().toLowerCase()) ?? [])
        : [];
    const suggested = candidates.length === 1 ? candidates[0] : undefined;
    views.push({
      id: source.id,
      kind: 'manuscript',
      format: source.format,
      name: source.name,
      ...(linked !== undefined ? { mediaId: linked, linkedAudioId: linked } : {}),
      ...(suggested !== undefined ? { suggestedAudioId: suggested } : {}),
    });
  }
  return orderProjectFiles(views);
}
