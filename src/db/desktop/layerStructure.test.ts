import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-layer-structure-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function openManuscript() {
  const root = folder();
  const session = openDesktopSession(root, [root]);
  const manuscript = callDesktopSession(session.sessionId, 'manuscripts.create', {
    title: { zh: '稿' },
  }) as { id: string };
  return { sessionId: session.sessionId, manuscriptId: manuscript.id };
}

function layer(
  sessionId: string,
  manuscriptId: string,
  key: string,
  contentType: string,
  extra: Record<string, unknown> = {},
) {
  return callDesktopSession(sessionId, 'layers.create', {
    manuscriptId,
    key,
    name: { zh: key },
    tierType: contentType === 'translation' ? 'symbolic-association' : 'time-aligned',
    contentType,
    ...extra,
  }) as { id: string; sortOrder: number; laneHeight: number | null; name: Record<string, string> };
}

describe('layer structure', () => {
  it('renames, reorders, and stores a lane height across reopen', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription', { sortOrder: 0 });
    const second = layer(sessionId, manuscriptId, 'tx2', 'transcription', { sortOrder: 1 });
    const renamed = callDesktopSession(sessionId, 'layers.rename', {
      id: first.id,
      name: { zh: '口语' },
    }) as { name: Record<string, string> };
    expect(renamed.name).toEqual({ zh: '口语' });
    expect(() =>
      callDesktopSession(sessionId, 'layers.rename', { id: first.id, name: { zh: '  ' } }),
    ).toThrow('layer name is empty');
    callDesktopSession(sessionId, 'layers.move', { id: second.id, direction: 'up' });
    const raised = callDesktopSession(sessionId, 'layers.setHeight', {
      id: second.id,
      laneHeight: 80,
    }) as { laneHeight: number };
    expect(raised.laneHeight).toBe(80);
    callDesktopSession(sessionId, 'reopen', {});
    const listed = callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
      id: string;
      name: Record<string, string>;
      sortOrder: number;
      laneHeight: number | null;
    }[];
    expect(listed.map((item) => [item.id, item.sortOrder, item.laneHeight])).toEqual([
      [second.id, 0, 80],
      [first.id, 1, null],
    ]);
    expect(listed[1]?.name).toEqual({ zh: '口语' });
  });

  it('moves layers that share a sort order, at the root and under one host', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const other = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const hosts = { hosts: [{ hostLayerId: host.id, preferred: true }] };
    const a = layer(sessionId, manuscriptId, 'tl', 'translation', hosts);
    const b = layer(sessionId, manuscriptId, 'tl2', 'translation', hosts);
    const childOrder = () =>
      (
        callDesktopSession(sessionId, 'layers.listLinks', { manuscriptId }) as {
          layerId: string;
          sortOrder: number;
        }[]
      )
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map((link) => link.layerId);
    expect(childOrder()).toEqual([a.id, b.id]);
    callDesktopSession(sessionId, 'layers.move', { id: b.id, direction: 'up' });
    const rootOrder = () =>
      (
        callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
          id: string;
          contentType: string;
        }[]
      )
        .filter((item) => item.contentType === 'transcription')
        .map((item) => item.id);
    const before = rootOrder();
    callDesktopSession(sessionId, 'layers.move', { id: before[1], direction: 'up' });
    callDesktopSession(sessionId, 'reopen', {});
    expect(childOrder()).toEqual([b.id, a.id]);
    expect(rootOrder()).toEqual([before[1], before[0]]);
    expect(new Set(before)).toEqual(new Set([host.id, other.id]));
    const roots = rootOrder();
    const children = childOrder();
    expect(() =>
      callDesktopSession(sessionId, 'layers.move', { id: roots[0], direction: 'up' }),
    ).toThrow('layer is already first');
    expect(() =>
      callDesktopSession(sessionId, 'layers.move', { id: roots[1], direction: 'down' }),
    ).toThrow('layer is already last');
    expect(() =>
      callDesktopSession(sessionId, 'layers.move', { id: children[0], direction: 'up' }),
    ).toThrow('layer is already first');
    expect(() =>
      callDesktopSession(sessionId, 'layers.move', { id: children[1], direction: 'down' }),
    ).toThrow('layer is already last');
  });

  it('soft-deletes a layer and its child, then restores the child only after the host', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const child = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    callDesktopSession(sessionId, 'layers.delete', { id: host.id, mode: 'soft' });
    expect(callDesktopSession(sessionId, 'layers.list', { manuscriptId })).toEqual([]);
    const deleted = callDesktopSession(sessionId, 'layers.listDeleted', {}) as { id: string }[];
    expect(deleted.map((item) => item.id).sort()).toEqual([child.id, host.id].sort());
    expect(() => callDesktopSession(sessionId, 'layers.restore', { id: child.id })).toThrow(
      'layer host is deleted',
    );
    callDesktopSession(sessionId, 'layers.restore', { id: host.id });
    callDesktopSession(sessionId, 'reopen', {});
    const listed = callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
      id: string;
    }[];
    expect(listed.map((item) => item.id).sort()).toEqual([child.id, host.id].sort());
    expect(callDesktopSession(sessionId, 'layers.listDeleted', {})).toEqual([]);
  });

  it('purges a layer with its child layer, units and text, and leaves nothing to restore', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const child = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    const keep = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    callDesktopSession(sessionId, 'units.create', { layerId: host.id, text: '句子' });
    callDesktopSession(sessionId, 'layers.delete', { id: host.id, mode: 'purge' });
    callDesktopSession(sessionId, 'reopen', {});
    const listed = callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
      id: string;
    }[];
    expect(listed.map((item) => item.id)).toEqual([keep.id]);
    expect(callDesktopSession(sessionId, 'layers.listDeleted', {})).toEqual([]);
    expect(child.id).not.toEqual(keep.id);
  });

  it('moves translation text onto a compatible layer and refuses a row that already exists', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const from = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    const target = layer(sessionId, manuscriptId, 'tl2', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    const unit = callDesktopSession(sessionId, 'units.create', {
      layerId: host.id,
      text: '句子',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: from.id,
      text: '译文',
    });
    callDesktopSession(sessionId, 'layers.delete', {
      id: from.id,
      mode: 'migrate',
      targetLayerId: target.id,
    });
    callDesktopSession(sessionId, 'reopen', {});
    const moved = callDesktopSession(sessionId, 'units.list', { layerId: target.id }) as {
      id: string;
      text: string;
    }[];
    expect(moved).toEqual([expect.objectContaining({ id: unit.id, text: '译文' })]);
    expect(callDesktopSession(sessionId, 'layers.list', { manuscriptId })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: target.id })]),
    );
    expect(
      (callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as { id: string }[]).some(
        (item) => item.id === from.id,
      ),
    ).toBe(false);

    const again = layer(sessionId, manuscriptId, 'tl3', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: again.id,
      text: '另一译文',
    });
    expect(() =>
      callDesktopSession(sessionId, 'layers.delete', {
        id: again.id,
        mode: 'migrate',
        targetLayerId: target.id,
      }),
    ).toThrow('layer text conflicts');
    expect(
      (callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as { id: string }[]).some(
        (item) => item.id === again.id,
      ),
    ).toBe(true);
  });

  it('moves a transcription layer’s units, text, and draft onto another transcription layer', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const source = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const target = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const unit = callDesktopSession(sessionId, 'units.create', {
      layerId: source.id,
      text: '句子',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: unit.id,
      rawInput: '句子改',
      baseBody: '句子',
    });
    callDesktopSession(sessionId, 'layers.delete', {
      id: source.id,
      mode: 'migrate',
      targetLayerId: target.id,
    });
    const moved = callDesktopSession(sessionId, 'units.list', { layerId: target.id }) as {
      id: string;
      text: string;
    }[];
    expect(moved).toEqual([expect.objectContaining({ id: unit.id, text: '句子' })]);
    expect(callDesktopSession(sessionId, 'units.readTextDraft', { unitId: unit.id })).toEqual(
      expect.objectContaining({ textLayerId: target.id, rawInput: '句子改' }),
    );
    expect(callDesktopSession(sessionId, 'units.list', { layerId: source.id })).toEqual([]);
  });

  it('refuses a transcription migrate onto a translation layer or a different host', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const source = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const other = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const translation = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: source.id, preferred: true }],
    });
    const elsewhere = layer(sessionId, manuscriptId, 'tl2', 'translation', {
      hosts: [{ hostLayerId: other.id, preferred: true }],
    });
    const unit = callDesktopSession(sessionId, 'units.create', {
      layerId: source.id,
      text: '句子',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: translation.id,
      text: '译文',
    });
    expect(() =>
      callDesktopSession(sessionId, 'layers.delete', {
        id: source.id,
        mode: 'migrate',
        targetLayerId: translation.id,
      }),
    ).toThrow('layer target is incompatible');
    expect(() =>
      callDesktopSession(sessionId, 'layers.delete', {
        id: translation.id,
        mode: 'migrate',
        targetLayerId: elsewhere.id,
      }),
    ).toThrow('layer target is incompatible');
    expect(callDesktopSession(sessionId, 'units.list', { layerId: translation.id })).toEqual([
      expect.objectContaining({ id: unit.id, text: '译文' }),
    ]);
  });

  it('hides a deleted layer from links, search, and text writes', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const child = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    const unit = callDesktopSession(sessionId, 'units.create', {
      layerId: host.id,
      text: '句子',
    }) as { id: string };
    expect(callDesktopSession(sessionId, 'layers.listLinks', { manuscriptId })).toEqual([
      expect.objectContaining({ layerId: child.id, hostLayerId: host.id }),
    ]);
    callDesktopSession(sessionId, 'layers.delete', { id: host.id, mode: 'soft' });
    expect(callDesktopSession(sessionId, 'layers.listLinks', { manuscriptId })).toEqual([]);
    expect(callDesktopSession(sessionId, 'units.list', { layerId: host.id })).toEqual([]);
    expect(() =>
      callDesktopSession(sessionId, 'units.updateText', { unitId: unit.id, text: '改' }),
    ).toThrow('layer is deleted');
    const found = callDesktopSession(sessionId, 'corpus.query', {
      manuscriptId,
      text: '句子',
      limit: 10,
    }) as { items: unknown[] };
    expect(found.items).toEqual([]);
  });

  it('leaves an earlier-deleted child deleted when its host is restored', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const child = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    callDesktopSession(sessionId, 'layers.delete', { id: child.id, mode: 'soft' });
    callDesktopSession(sessionId, 'layers.delete', { id: host.id, mode: 'soft' });
    callDesktopSession(sessionId, 'layers.restore', { id: host.id });
    const listed = callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
      id: string;
    }[];
    expect(listed.map((item) => item.id)).toEqual([host.id]);
  });

  it('stores style, couples height, and rejects an orthography from another language', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const language = callDesktopSession(sessionId, 'catalog.ensureProjectDefinition', {
      name: { zh: '甲' },
      sourceType: 'user-custom',
      iso6393: 'eng',
    }) as { id: string };
    const other = callDesktopSession(sessionId, 'catalog.ensureProjectDefinition', {
      name: { zh: '乙' },
      sourceType: 'user-custom',
      iso6393: 'fra',
    }) as { id: string };
    const orthography = callDesktopSession(sessionId, 'orthographies.create', {
      languageId: language.id,
      name: { zh: '拉丁' },
      scriptTag: 'Latn',
      sourceType: 'user-custom',
    }) as { id: string };
    const foreign = callDesktopSession(sessionId, 'orthographies.create', {
      languageId: other.id,
      name: { zh: '另一套' },
      scriptTag: 'Latn',
      sourceType: 'user-custom',
    }) as { id: string };
    const owned = layer(sessionId, manuscriptId, 'tx', 'transcription', {
      languageId: language.id,
    });
    const bare = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const styled = callDesktopSession(sessionId, 'layers.setStyle', {
      id: owned.id,
      orthographyId: orthography.id,
      displayFont: '"Charis SIL", serif',
      displayFontSize: 18,
      displayBold: true,
      displayItalic: true,
    }) as {
      orthographyId: string | null;
      displayFont: string | null;
      displayFontSize: number | null;
      displayBold: boolean;
      displayItalic: boolean;
      laneHeight: number | null;
    };
    expect(styled).toMatchObject({
      orthographyId: orthography.id,
      displayFont: '"Charis SIL", serif',
      displayFontSize: 18,
      displayBold: true,
      displayItalic: true,
      laneHeight: 75,
    });
    expect('color' in styled).toBe(false);
    const dragged = callDesktopSession(sessionId, 'layers.setHeight', {
      id: owned.id,
      laneHeight: 80,
    }) as { laneHeight: number | null; displayFontSize: number | null };
    expect(dragged.laneHeight).toBe(80);
    expect(dragged.displayFontSize).toBe(19);
    expect(() =>
      callDesktopSession(sessionId, 'layers.setStyle', {
        id: owned.id,
        orthographyId: foreign.id,
        displayFont: null,
        displayFontSize: 18,
        displayBold: true,
        displayItalic: true,
      }),
    ).toThrow('orthography language does not match');
    const kept = (
      callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
        id: string;
        orthographyId: string | null;
        displayFont: string | null;
        displayFontSize: number | null;
        laneHeight: number | null;
      }[]
    ).find((item) => item.id === owned.id);
    expect(kept).toMatchObject({
      orthographyId: orthography.id,
      displayFont: '"Charis SIL", serif',
      displayFontSize: 19,
      laneHeight: 80,
    });
    expect(() =>
      callDesktopSession(sessionId, 'layers.setStyle', {
        id: bare.id,
        orthographyId: orthography.id,
        displayFont: null,
        displayFontSize: null,
        displayBold: false,
        displayItalic: false,
      }),
    ).toThrow('layer language is missing');
    const fontOnly = callDesktopSession(sessionId, 'layers.setStyle', {
      id: bare.id,
      orthographyId: null,
      displayFont: 'Noto Sans SC',
      displayFontSize: null,
      displayBold: false,
      displayItalic: false,
    }) as { displayFont: string | null; orthographyId: string | null; laneHeight: number | null };
    expect(fontOnly.displayFont).toBe('Noto Sans SC');
    expect(fontOnly.orthographyId).toBeNull();
    expect(fontOnly.laneHeight).toBe(54);
    callDesktopSession(sessionId, 'layers.setStyle', {
      id: owned.id,
      orthographyId: orthography.id,
      displayFont: '"Charis SIL", serif',
      displayFontSize: 18,
      displayBold: true,
      displayItalic: true,
      reset: true,
    });
    callDesktopSession(sessionId, 'reopen', {});
    const listed = callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
      id: string;
      orthographyId: string | null;
      displayFont: string | null;
      displayFontSize: number | null;
      displayBold: boolean;
      displayItalic: boolean;
      laneHeight: number | null;
    }[];
    const again = listed.find((item) => item.id === owned.id);
    expect(again).toMatchObject({
      orthographyId: null,
      displayFont: null,
      displayFontSize: null,
      displayBold: false,
      displayItalic: false,
      laneHeight: 54,
    });
    expect(() =>
      callDesktopSession(sessionId, 'layers.setStyle', {
        id: owned.id,
        orthographyId: null,
        displayFont: null,
        displayFontSize: null,
        displayBold: false,
        displayItalic: false,
        color: '#111111',
      }),
    ).toThrow('color is not supported');
  });
});
