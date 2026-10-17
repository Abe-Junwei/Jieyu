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
  type FileProject,
} from './fileOps';

function empty(): FileProject {
  return { files: [], ops: [] };
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
