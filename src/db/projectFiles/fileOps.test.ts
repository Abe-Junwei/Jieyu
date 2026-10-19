import { describe, expect, it } from 'vitest';
import {
  classifyPresence,
  commitPair,
  hideFile,
  importFiles,
  rebindByHash,
  rebindByManuscriptId,
  renameFile,
  splitManuscript,
  trashNext,
  HIDDEN_DIRECTORY,
  type FileProject,
  type TrackedFile,
} from './fileOps';

function empty(): FileProject {
  return { files: [], ops: [] };
}

function file(id: string, relPath: string): TrackedFile {
  return {
    id,
    kind: relPath.endsWith('.jyd') ? 'manuscript' : 'audio',
    relPath,
    sha256: null,
    presence: 'present',
    audioId: null,
  };
}

describe('fileOps', () => {
  it('reuses the same ids when an import is repeated', () => {
    const first = importFiles(empty(), {
      opId: 'op-1',
      audioId: 'audio-1',
      manuscriptId: 'doc-1',
      audioName: '录音01.wav',
      manuscriptName: '录音01.jyd',
      sha256: 'abc',
    });
    const second = importFiles(first.project, {
      opId: 'op-1',
      audioId: 'audio-2',
      manuscriptId: 'doc-2',
      audioName: '录音01.wav',
      manuscriptName: '录音01.jyd',
      sha256: 'abc',
    });
    expect(second.audioId).toBe('audio-1');
    expect(second.manuscriptId).toBe('doc-1');
    expect(second.project.files.map((file) => file.id)).toEqual(['audio-1', 'doc-1']);
  });

  it('stops a two-file delete halfway and continues the same operation', () => {
    const imported = importFiles(empty(), {
      opId: 'op-import',
      audioId: 'audio-1',
      manuscriptId: 'doc-1',
      audioName: '录音01.wav',
      manuscriptName: '录音01.jyd',
      sha256: 'abc',
    });
    const halfway = trashNext(imported.project, {
      opId: 'op-trash',
      paths: ['录音01.wav', '录音01.jyd'],
    });
    expect(halfway.status).toBe('incomplete');
    expect(halfway.project.files.map((file) => file.presence)).toEqual(['trashed', 'present']);
    const done = trashNext(halfway.project, {
      opId: 'op-trash',
      paths: ['别的.wav', '别的.jyd'],
    });
    expect(done.status).toBe('complete');
    expect(done.project.files.map((file) => file.presence)).toEqual(['trashed', 'trashed']);
    expect(done.project.files).toHaveLength(2);
  });

  it('rebinds one trashed hash and asks when two match', () => {
    const files = [
      {
        id: 'audio-1',
        kind: 'audio' as const,
        relPath: 'a.wav',
        sha256: 'same',
        presence: 'trashed' as const,
        audioId: null,
      },
      {
        id: 'audio-2',
        kind: 'audio' as const,
        relPath: 'b.wav',
        sha256: 'same',
        presence: 'missing' as const,
        audioId: null,
      },
    ];
    expect(rebindByHash([files[0]!], 'same')).toEqual({ kind: 'rebind', id: 'audio-1' });
    expect(rebindByHash(files, 'same')).toEqual({ kind: 'ask' });
  });

  it('asks when a manuscript id is already present or duplicated', () => {
    const trashed = {
      id: 'doc-1',
      kind: 'manuscript' as const,
      relPath: '录音01.jyd',
      sha256: null,
      presence: 'trashed' as const,
      audioId: null,
    };
    expect(rebindByManuscriptId([trashed], 'doc-1')).toEqual({ kind: 'rebind', id: 'doc-1' });
    expect(rebindByManuscriptId([{ ...trashed, presence: 'present' }], 'doc-1')).toEqual({
      kind: 'ask',
    });
    expect(rebindByManuscriptId([trashed, { ...trashed, relPath: '副本.jyd' }], 'doc-1')).toEqual({
      kind: 'ask',
    });
  });

  it('does not pair a unique name that only exists in the hidden folder', () => {
    const project: FileProject = {
      files: [
        {
          id: 'audio-1',
          kind: 'audio',
          relPath: '已隐藏/录音01.wav',
          sha256: 'abc',
          presence: 'present',
          audioId: null,
        },
        {
          id: 'doc-1',
          kind: 'manuscript',
          relPath: '录音01.jyd',
          sha256: null,
          presence: 'present',
          audioId: null,
        },
      ],
      ops: [],
    };
    expect(commitPair(project, { opId: 'op-pair', stem: '录音01' }).status).toBe('needs-choice');
    expect(project.files[1]?.audioId).toBeNull();
  });

  it('hides, renames, and splits without a second file', () => {
    const imported = importFiles(empty(), {
      opId: 'op-import',
      audioId: 'audio-1',
      manuscriptId: 'doc-1',
      audioName: '录音01.wav',
      manuscriptName: '录音01.jyd',
      sha256: 'abc',
    });
    const hidden = hideFile(imported.project, { opId: 'op-hide', relPath: '录音01.wav' });
    expect(hidden.relPath).toBe('已隐藏/录音01.wav');
    const renamed = renameFile(hidden.project, {
      opId: 'op-rename',
      from: '录音01.jyd',
      to: '笔记.jyd',
    });
    expect(renamed.status).toBe('complete');
    const blocked = renameFile(renamed.project, {
      opId: 'op-rename-2',
      from: '笔记.jyd',
      to: '录音01.jyd',
    });
    expect(blocked.status).toBe('needs-choice');
    const split = splitManuscript(renamed.project, { opId: 'op-split', manuscriptId: 'doc-1' });
    expect(split.project.files.find((file) => file.id === 'doc-1')?.audioId).toBeNull();
    expect(split.project.files).toHaveLength(2);
  });

  it('asks instead of hiding onto a file that is already hidden', () => {
    const project: FileProject = {
      files: [
        { ...file('audio-1', `a/rec01.wav`), presence: 'present' },
        { ...file('audio-2', `${HIDDEN_DIRECTORY}/REC01.wav`), presence: 'present' },
      ],
      ops: [],
    };
    const result = hideFile(project, { opId: 'op-hide', relPath: 'a/rec01.wav' });
    expect(result.status).toBe('needs-choice');
    expect(result.relPath).toBeNull();
    expect(result.project.files).toEqual(project.files);
  });

  it('reports a missing or absent file instead of hiding or renaming it', () => {
    const project: FileProject = {
      files: [{ ...file('audio-1', 'gone.wav'), presence: 'trashed' }],
      ops: [],
    };
    const hidden = hideFile(project, { opId: 'op-hide', relPath: 'gone.wav' });
    expect(hidden.status).toBe('not-found');
    expect(hidden.project).toBe(project);
    expect(hideFile(project, { opId: 'op-hide-2', relPath: 'nope.wav' }).status).toBe('not-found');
    const renamed = renameFile(project, { opId: 'op-rename', from: 'nope.wav', to: 'x.wav' });
    expect(renamed.status).toBe('not-found');
    expect(renamed.project).toBe(project);
    expect(renameFile(project, { opId: 'op-r2', from: 'gone.wav', to: 'x.wav' }).status).toBe(
      'not-found',
    );
  });

  it('compares visible names by case-folded stem, like hidden ones', () => {
    const project: FileProject = {
      files: [
        { ...file('audio-1', 'Rec01.wav'), presence: 'present' },
        { ...file('doc-2', 'notes.jyd'), presence: 'present' },
      ],
      ops: [],
    };
    expect(renameFile(project, { opId: 'op-1', from: 'notes.jyd', to: 'rec01.jyd' }).status).toBe(
      'needs-choice',
    );
    expect(renameFile(project, { opId: 'op-2', from: 'Rec01.wav', to: 'REC01.flac' }).status).toBe(
      'complete',
    );
    const imported = importFiles(project, {
      opId: 'op-3',
      audioId: 'audio-3',
      manuscriptId: 'doc-3',
      audioName: 'REC01.mp3',
      manuscriptName: 'other.jyd',
      sha256: 'x',
    });
    expect(imported.status).toBe('needs-choice');
    expect(imported.project.files).toEqual(project.files);
  });

  it('distinguishes trashed, missing, and bytes that are not on this machine', () => {
    expect(classifyPresence({ record: 'trashed', pathExists: false, bytesLocal: false })).toBe(
      'trashed',
    );
    expect(classifyPresence({ record: 'active', pathExists: false, bytesLocal: false })).toBe(
      'missing',
    );
    expect(classifyPresence({ record: 'active', pathExists: true, bytesLocal: false })).toBe(
      'bytes-elsewhere',
    );
    expect(classifyPresence({ record: 'trashed', pathExists: true, bytesLocal: true })).toBe(
      'present',
    );
  });
});
