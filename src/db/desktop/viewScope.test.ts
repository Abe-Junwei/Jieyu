import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { closeDesktopSession, openDesktopSession, resetDesktopSessions } from './projectSession';
import { clearSessionEdit } from './sessionEdit';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-view-scope-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function seed(sessionId: string) {
  const media = callDesktopSession(sessionId, 'media.create', {
    relpath: 'a.wav',
    sha256: 'aa',
    duration: 4,
  }) as { id: string };
  const manuscript = callDesktopSession(sessionId, 'manuscripts.create', {
    title: { zh: '文稿' },
    mediaId: media.id,
  }) as { id: string };
  const layer = callDesktopSession(sessionId, 'layers.create', {
    manuscriptId: manuscript.id,
    key: 'tx',
    name: { zh: '转写' },
    tierType: 'time-aligned',
    contentType: 'transcription',
  }) as { id: string };
  const left = (
    callDesktopSession(sessionId, 'units.create', {
      layerId: layer.id,
      startMs: 0,
      endMs: 1,
      text: '甲',
    }) as { id: string }
  ).id;
  const right = (
    callDesktopSession(sessionId, 'units.create', {
      layerId: layer.id,
      startMs: 1,
      endMs: 2,
      text: '乙',
    }) as { id: string }
  ).id;
  return { manuscriptId: manuscript.id, layerId: layer.id, left, right };
}

describe('viewScope write guards', () => {
  it('rejects assign on a unit hidden by the speakers filter', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, left, right } = seed(session.sessionId);
    const ada = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    const bai = callDesktopSession(session.sessionId, 'speakers.create', { name: '白玛' }) as {
      id: string;
    };
    clearSessionEdit(session.sessionId);
    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: ada.id,
      unitIds: [left],
    });
    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: bai.id,
      unitIds: [right],
    });
    clearSessionEdit(session.sessionId);
    expect(() =>
      callDesktopSession(session.sessionId, 'speakers.assign', {
        speakerId: ada.id,
        unitIds: [right],
        viewScope: {
          manuscriptId,
          kind: 'speakers',
          speakerIds: [ada.id],
          includeUnassigned: false,
        },
        expectedAffectedUnitIds: [right],
      }),
    ).toThrow('unit is outside view scope');
    expect(
      (callDesktopSession(session.sessionId, 'units.get', { id: right }) as { speakerId: string })
        .speakerId,
    ).toBe(bai.id);
  });

  it('allows assign when the target is in scope and forbids create/retime while filtered', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, layerId, left } = seed(session.sessionId);
    const ada = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    clearSessionEdit(session.sessionId);
    const scope = {
      manuscriptId,
      kind: 'speakers' as const,
      speakerIds: [] as string[],
      includeUnassigned: true,
    };
    expect(
      callDesktopSession(session.sessionId, 'speakers.assign', {
        speakerId: ada.id,
        unitIds: [left],
        viewScope: scope,
        expectedAffectedUnitIds: [left],
      }),
    ).toEqual([expect.objectContaining({ id: left, speakerId: ada.id })]);
    expect(() =>
      callDesktopSession(session.sessionId, 'units.create', {
        layerId,
        startMs: 2,
        endMs: 3,
        text: '丙',
        viewScope: scope,
        expectedAffectedUnitIds: [],
      }),
    ).toThrow('view scope forbids this write');
    expect(() =>
      callDesktopSession(session.sessionId, 'manuscripts.retime', {
        manuscriptId,
        offsetMs: 10,
        scale: 1,
        viewScope: scope,
        expectedAffectedUnitIds: [],
      }),
    ).toThrow('view scope forbids this write');
    closeDesktopSession(session.sessionId);
  });

  it('rejects mismatched expectedAffectedUnitIds and keeps legacy calls unscoped', () => {
    const dir = folder();
    const session = openDesktopSession(dir, [dir]);
    const { manuscriptId, left, right } = seed(session.sessionId);
    const ada = callDesktopSession(session.sessionId, 'speakers.create', { name: '阿达' }) as {
      id: string;
    };
    clearSessionEdit(session.sessionId);
    expect(() =>
      callDesktopSession(session.sessionId, 'speakers.assign', {
        speakerId: ada.id,
        unitIds: [left],
        viewScope: { manuscriptId, kind: 'all' },
        expectedAffectedUnitIds: [left, right],
      }),
    ).toThrow('affected units mismatch');
    callDesktopSession(session.sessionId, 'speakers.assign', {
      speakerId: ada.id,
      unitIds: [left],
    });
    expect(
      (callDesktopSession(session.sessionId, 'units.get', { id: left }) as { speakerId: string })
        .speakerId,
    ).toBe(ada.id);
  });
});
