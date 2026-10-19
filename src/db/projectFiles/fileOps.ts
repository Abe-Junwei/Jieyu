/**
 * 导入、配对、拆开、改名、隐藏、删除的纯操作。
 * 同一个操作 id 再进来，沿用已经分配的 id，不另造一份文件。
 * 不调用系统垃圾箱，也不写数据库。
 */

export const HIDDEN_DIRECTORY = '已隐藏';

export type Presence = 'present' | 'trashed' | 'missing' | 'bytes-elsewhere';

export interface TrackedFile {
  id: string;
  kind: 'audio' | 'manuscript';
  relPath: string;
  sha256: string | null;
  presence: Presence;
  /** 文稿引用的音频。音频文件自身为空。 */
  audioId: string | null;
}

export interface FileOp {
  opId: string;
  action: 'import' | 'pair' | 'split' | 'rename' | 'hide' | 'trash';
  allocatedIds: string[];
  paths: string[];
  donePaths: string[];
  status: 'complete' | 'incomplete' | 'needs-choice';
}

export interface FileProject {
  files: TrackedFile[];
  ops: FileOp[];
}

export type OpStatus = FileOp['status'];

function stemOf(relPath: string): string {
  const base = relPath.split(/[/\\]/).pop() ?? relPath;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function foldName(name: string): string {
  return name.normalize('NFC').toUpperCase().toLowerCase();
}

/** 同名按主名比较，不分大小写，隐藏文件也算。 */
function stemTaken(
  files: readonly TrackedFile[],
  names: readonly string[],
  except: (file: TrackedFile) => boolean = () => false,
): boolean {
  const stems = new Set(names.map((name) => foldName(stemOf(name))));
  return files.some(
    (file) =>
      file.presence === 'present' && !except(file) && stems.has(foldName(stemOf(file.relPath))),
  );
}

function isHidden(relPath: string): boolean {
  return relPath.split(/[/\\]/).includes(HIDDEN_DIRECTORY);
}

function findOp(project: FileProject, opId: string): FileOp | undefined {
  return project.ops.find((op) => op.opId === opId);
}

function withOp(project: FileProject, op: FileOp): FileProject {
  const existing = findOp(project, op.opId);
  const ops = existing
    ? project.ops.map((item) => (item.opId === op.opId ? op : item))
    : [...project.ops, op];
  return { ...project, ops };
}

export function classifyPresence(input: {
  record: 'active' | 'trashed';
  pathExists: boolean;
  bytesLocal: boolean;
}): Presence {
  if (input.pathExists && !input.bytesLocal) return 'bytes-elsewhere';
  if (!input.pathExists && input.record === 'trashed') return 'trashed';
  if (!input.pathExists) return 'missing';
  return 'present';
}

export function rebindByHash(
  files: readonly TrackedFile[],
  sha256: string,
): { kind: 'rebind'; id: string } | { kind: 'ask' } | { kind: 'unknown' } {
  const hits = files.filter(
    (file) =>
      file.kind === 'audio' &&
      file.sha256 === sha256 &&
      (file.presence === 'trashed' || file.presence === 'missing'),
  );
  if (hits.length === 1 && hits[0]) return { kind: 'rebind', id: hits[0].id };
  if (hits.length > 1) return { kind: 'ask' };
  return { kind: 'unknown' };
}

export function rebindByManuscriptId(
  files: readonly TrackedFile[],
  id: string,
): { kind: 'rebind'; id: string } | { kind: 'ask' } | { kind: 'unknown' } {
  const hits = files.filter((file) => file.kind === 'manuscript' && file.id === id);
  if (hits.length > 1) return { kind: 'ask' };
  const hit = hits[0];
  if (!hit) return { kind: 'unknown' };
  if (hit.presence === 'present') return { kind: 'ask' };
  return { kind: 'rebind', id: hit.id };
}

/** 同名判断把隐藏文件算进去。唯一候选在隐藏里时不自动配对。 */
export function pairByName(
  files: readonly TrackedFile[],
  stem: string,
):
  | { kind: 'pair'; audioId: string; manuscriptId: string }
  | { kind: 'needs-choice' }
  | { kind: 'none' } {
  const matches = files.filter(
    (file) => stemOf(file.relPath) === stem && file.presence === 'present',
  );
  const audios = matches.filter((file) => file.kind === 'audio');
  const manuscripts = matches.filter((file) => file.kind === 'manuscript');
  if (audios.length !== 1 || manuscripts.length !== 1) {
    return matches.length === 0 ? { kind: 'none' } : { kind: 'needs-choice' };
  }
  const audio = audios[0];
  const manuscript = manuscripts[0];
  if (!audio || !manuscript) return { kind: 'none' };
  if (isHidden(audio.relPath) || isHidden(manuscript.relPath)) return { kind: 'needs-choice' };
  return { kind: 'pair', audioId: audio.id, manuscriptId: manuscript.id };
}

export function importFiles(
  project: FileProject,
  input: {
    opId: string;
    audioId: string;
    manuscriptId: string;
    audioName: string;
    manuscriptName: string;
    sha256: string;
  },
): { project: FileProject; status: OpStatus; audioId: string | null; manuscriptId: string | null } {
  const existing = findOp(project, input.opId);
  if (existing) {
    return {
      project,
      status: existing.status,
      audioId: existing.allocatedIds[0] ?? null,
      manuscriptId: existing.allocatedIds[1] ?? null,
    };
  }
  if (stemTaken(project.files, [input.audioName, input.manuscriptName])) {
    const op: FileOp = {
      opId: input.opId,
      action: 'import',
      allocatedIds: [],
      paths: [],
      donePaths: [],
      status: 'needs-choice',
    };
    return {
      project: withOp(project, op),
      status: 'needs-choice',
      audioId: null,
      manuscriptId: null,
    };
  }
  const files: TrackedFile[] = [
    ...project.files,
    {
      id: input.audioId,
      kind: 'audio',
      relPath: input.audioName,
      sha256: input.sha256,
      presence: 'present',
      audioId: null,
    },
    {
      id: input.manuscriptId,
      kind: 'manuscript',
      relPath: input.manuscriptName,
      sha256: null,
      presence: 'present',
      audioId: input.audioId,
    },
  ];
  const op: FileOp = {
    opId: input.opId,
    action: 'import',
    allocatedIds: [input.audioId, input.manuscriptId],
    paths: [input.audioName, input.manuscriptName],
    donePaths: [input.audioName, input.manuscriptName],
    status: 'complete',
  };
  return {
    project: { files, ops: [...project.ops, op] },
    status: 'complete',
    audioId: input.audioId,
    manuscriptId: input.manuscriptId,
  };
}

/** 一次只送走一个路径。没送完就是未完成，再次调用沿用同一个操作。 */
export function trashNext(
  project: FileProject,
  input: { opId: string; paths: readonly string[] },
): { project: FileProject; status: 'complete' | 'incomplete' } {
  const existing = findOp(project, input.opId);
  const op: FileOp = existing ?? {
    opId: input.opId,
    action: 'trash',
    allocatedIds: [],
    paths: [...input.paths],
    donePaths: [],
    status: 'incomplete',
  };
  if (op.status === 'complete') return { project, status: 'complete' };
  const next = op.paths.find((relPath) => !op.donePaths.includes(relPath));
  if (next === undefined) {
    const done = { ...op, status: 'complete' as const };
    return { project: withOp(project, done), status: 'complete' };
  }
  const files = project.files.map((file) =>
    file.relPath === next ? { ...file, presence: 'trashed' as const } : file,
  );
  const donePaths = [...op.donePaths, next];
  const status = donePaths.length === op.paths.length ? 'complete' : 'incomplete';
  return {
    project: withOp({ ...project, files }, { ...op, donePaths, status }),
    status,
  };
}

export function commitPair(
  project: FileProject,
  input: { opId: string; stem: string },
): { project: FileProject; status: 'complete' | 'needs-choice' | 'none' } {
  const existing = findOp(project, input.opId);
  if (existing) {
    return {
      project,
      status: existing.status === 'complete' ? 'complete' : 'needs-choice',
    };
  }
  const choice = pairByName(project.files, input.stem);
  if (choice.kind === 'none') return { project, status: 'none' };
  if (choice.kind === 'needs-choice') {
    const op: FileOp = {
      opId: input.opId,
      action: 'pair',
      allocatedIds: [],
      paths: [],
      donePaths: [],
      status: 'needs-choice',
    };
    return { project: withOp(project, op), status: 'needs-choice' };
  }
  const files = project.files.map((file) =>
    file.id === choice.manuscriptId ? { ...file, audioId: choice.audioId } : file,
  );
  const op: FileOp = {
    opId: input.opId,
    action: 'pair',
    allocatedIds: [choice.manuscriptId],
    paths: [],
    donePaths: [],
    status: 'complete',
  };
  return { project: withOp({ ...project, files }, op), status: 'complete' };
}

export function hideFile(
  project: FileProject,
  input: { opId: string; relPath: string },
): {
  project: FileProject;
  status: 'complete' | 'needs-choice' | 'not-found';
  relPath: string | null;
} {
  const existing = findOp(project, input.opId);
  if (existing?.status === 'complete') {
    return { project, status: 'complete', relPath: existing.paths[0] ?? null };
  }
  const file = project.files.find(
    (item) => item.relPath === input.relPath && item.presence === 'present',
  );
  if (!file) return { project, status: 'not-found', relPath: null };
  const base = input.relPath.split(/[/\\]/).pop() ?? input.relPath;
  const hiddenPath = `${HIDDEN_DIRECTORY}/${base}`;
  const collides = project.files.some(
    (item) =>
      item !== file &&
      item.presence === 'present' &&
      foldName(item.relPath) === foldName(hiddenPath),
  );
  if (collides) {
    const op: FileOp = {
      opId: input.opId,
      action: 'hide',
      allocatedIds: [],
      paths: [input.relPath],
      donePaths: [],
      status: 'needs-choice',
    };
    return { project: withOp(project, op), status: 'needs-choice', relPath: null };
  }
  const files = project.files.map((item) =>
    item === file ? { ...item, relPath: hiddenPath } : item,
  );
  const op: FileOp = {
    opId: input.opId,
    action: 'hide',
    allocatedIds: [],
    paths: [hiddenPath],
    donePaths: [hiddenPath],
    status: 'complete',
  };
  return { project: withOp({ ...project, files }, op), status: 'complete', relPath: hiddenPath };
}

export function renameFile(
  project: FileProject,
  input: { opId: string; from: string; to: string },
): { project: FileProject; status: 'complete' | 'needs-choice' | 'not-found' } {
  const existing = findOp(project, input.opId);
  if (existing)
    return { project, status: existing.status === 'needs-choice' ? 'needs-choice' : 'complete' };
  const source = project.files.find(
    (file) => file.relPath === input.from && file.presence === 'present',
  );
  if (!source) return { project, status: 'not-found' };
  if (stemTaken(project.files, [input.to], (file) => file === source)) {
    const op: FileOp = {
      opId: input.opId,
      action: 'rename',
      allocatedIds: [],
      paths: [input.from],
      donePaths: [],
      status: 'needs-choice',
    };
    return { project: withOp(project, op), status: 'needs-choice' };
  }
  const files = project.files.map((file) =>
    file === source ? { ...file, relPath: input.to } : file,
  );
  const op: FileOp = {
    opId: input.opId,
    action: 'rename',
    allocatedIds: [],
    paths: [input.to],
    donePaths: [input.to],
    status: 'complete',
  };
  return { project: withOp({ ...project, files }, op), status: 'complete' };
}

export function splitManuscript(
  project: FileProject,
  input: { opId: string; manuscriptId: string },
): { project: FileProject; status: 'complete' } {
  const existing = findOp(project, input.opId);
  if (existing?.status === 'complete') return { project, status: 'complete' };
  const files = project.files.map((file) =>
    file.kind === 'manuscript' && file.id === input.manuscriptId
      ? { ...file, audioId: null }
      : file,
  );
  const op: FileOp = {
    opId: input.opId,
    action: 'split',
    allocatedIds: [input.manuscriptId],
    paths: [],
    donePaths: [],
    status: 'complete',
  };
  return { project: withOp({ ...project, files }, op), status: 'complete' };
}
