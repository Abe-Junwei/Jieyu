import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

interface LinkRow {
  layerId: string;
  hostLayerId: string;
  linkType: string;
  isPreferred: boolean;
  sortOrder: number;
}

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-layer-hosts-'));
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
  }) as { id: string };
}

function linksOf(sessionId: string, manuscriptId: string, layerId: string): LinkRow[] {
  return (callDesktopSession(sessionId, 'layers.listLinks', { manuscriptId }) as LinkRow[]).filter(
    (link) => link.layerId === layerId,
  );
}

function hosts(
  layerId: string,
  hostLayerIds: string[],
  preferredHostLayerId: string,
  linkType: 'direct' | 'free' | 'literal' | 'pedagogical' = 'free',
) {
  return { layerId, hostLayerIds, preferredHostLayerId, linkType };
}

function seedLegacyTranscriptionLink(
  sessionId: string,
  manuscriptId: string,
  layerId: string,
  hostLayerId: string,
) {
  requireDesktopSession(sessionId)
    .db.prepare(
      `INSERT INTO layer_links (id, manuscript_id, layer_id, host_layer_id, link_type, is_preferred, sort_order, created_at)
     VALUES (?, ?, ?, ?, 'direct', 1, 0, ?)`,
    )
    .run(randomUUID(), manuscriptId, layerId, hostLayerId, new Date().toISOString());
}

describe('layer hosts', () => {
  it('keeps orthography hosts time-aligned and unique at create and replace', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'ipa', 'transcription');
    const other = layer(sessionId, manuscriptId, 'other', 'transcription');
    const spelling = layer(sessionId, manuscriptId, 'spelling', 'transcription', {
      tierType: 'symbolic-association',
      hosts: [{ hostLayerId: host.id }],
    });
    expect(() =>
      layer(sessionId, manuscriptId, 'bad', 'translation', {
        hosts: [{ hostLayerId: spelling.id }],
      }),
    ).toThrow('layer host is not a transcription layer');
    expect(() =>
      layer(sessionId, manuscriptId, 'multi', 'transcription', {
        tierType: 'symbolic-association',
        hosts: [{ hostLayerId: host.id }, { hostLayerId: other.id }],
      }),
    ).toThrow('orthography layer requires one host');
    expect(() =>
      callDesktopSession(
        sessionId,
        'layers.setHosts',
        hosts(spelling.id, [host.id, other.id], host.id),
      ),
    ).toThrow('orthography layer requires one host');
    expect(linksOf(sessionId, manuscriptId, spelling.id).map((row) => row.hostLayerId)).toEqual([
      host.id,
    ]);
    expect(
      callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as { id: string }[],
    ).toHaveLength(3);
  });

  it('rejects host links when creating a time-aligned transcription', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    expect(() =>
      layer(sessionId, manuscriptId, 'tx-child', 'transcription', {
        hosts: [{ hostLayerId: host.id, preferred: true }],
      }),
    ).toThrow('time-aligned transcription cannot have hosts');
    expect(
      (callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as { id: string }[]).map(
        (item) => item.id,
      ),
    ).toEqual([host.id]);
  });

  it('adds a host and reads that host’s segments after reopen', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const second = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const text = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: first.id, preferred: true }],
    });
    callDesktopSession(sessionId, 'units.create', { layerId: first.id, text: '一' });
    callDesktopSession(sessionId, 'units.create', { layerId: second.id, text: '二' });
    callDesktopSession(
      sessionId,
      'layers.setHosts',
      hosts(text.id, [first.id, second.id], first.id, 'literal'),
    );
    callDesktopSession(sessionId, 'reopen', {});
    const listed = callDesktopSession(sessionId, 'units.list', { layerId: text.id }) as {
      layerId: string;
    }[];
    expect(listed.map((item) => item.layerId).sort()).toEqual([first.id, second.id].sort());
    expect(linksOf(sessionId, manuscriptId, text.id)).toEqual([
      expect.objectContaining({
        hostLayerId: first.id,
        isPreferred: true,
        linkType: 'literal',
        sortOrder: 0,
      }),
      expect.objectContaining({
        hostLayerId: second.id,
        isPreferred: false,
        linkType: 'literal',
        sortOrder: 1,
      }),
    ]);
  });

  it('writes the new link type onto every host link', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const second = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const text = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [
        { hostLayerId: first.id, preferred: true, linkType: 'free' },
        { hostLayerId: second.id, linkType: 'direct' },
      ],
    });
    callDesktopSession(
      sessionId,
      'layers.setHosts',
      hosts(text.id, [first.id, second.id], first.id, 'pedagogical'),
    );
    callDesktopSession(sessionId, 'reopen', {});
    const rows = linksOf(sessionId, manuscriptId, text.id);
    expect(rows.map((row) => row.linkType)).toEqual(['pedagogical', 'pedagogical']);
  });

  it('keeps the sort order when the preferred host stays, and appends when it changes', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const second = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const text = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: first.id, preferred: true, linkType: 'direct' }],
    });
    layer(sessionId, manuscriptId, 'tl-sibling', 'translation', {
      hosts: [{ hostLayerId: first.id, preferred: true }],
    });
    const parked = layer(sessionId, manuscriptId, 'tl-parked', 'translation', {
      hosts: [{ hostLayerId: second.id, preferred: true }],
    });
    callDesktopSession(
      sessionId,
      'layers.setHosts',
      hosts(text.id, [first.id, second.id], first.id, 'direct'),
    );
    expect(linksOf(sessionId, manuscriptId, text.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ hostLayerId: first.id, isPreferred: true, sortOrder: 0 }),
      ]),
    );
    callDesktopSession(
      sessionId,
      'layers.setHosts',
      hosts(text.id, [second.id], second.id, 'direct'),
    );
    callDesktopSession(sessionId, 'reopen', {});
    const parkedSort = linksOf(sessionId, manuscriptId, parked.id)[0]?.sortOrder;
    expect(linksOf(sessionId, manuscriptId, text.id)).toEqual([
      expect.objectContaining({
        hostLayerId: second.id,
        isPreferred: true,
        sortOrder: (parkedSort ?? 0) + 1,
      }),
    ]);
  });

  it('refuses to detach a host that still has text or a draft, and leaves the links', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const second = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const text = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: first.id, preferred: true }, { hostLayerId: second.id }],
    });
    const unit = callDesktopSession(sessionId, 'units.create', {
      layerId: first.id,
      text: '句子',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.updateText', {
      unitId: unit.id,
      textLayerId: text.id,
      text: '译文',
    });
    const before = linksOf(sessionId, manuscriptId, text.id);
    const preview = callDesktopSession(
      sessionId,
      'layers.previewHosts',
      hosts(text.id, [second.id], second.id),
    ) as { blocked: boolean; removed: { hostLayerId: string; texts: number; drafts: number }[] };
    expect(preview.blocked).toBe(true);
    expect(preview.removed).toEqual([
      expect.objectContaining({ hostLayerId: first.id, texts: 1, drafts: 0 }),
    ]);
    expect(() =>
      callDesktopSession(sessionId, 'layers.setHosts', hosts(text.id, [second.id], second.id)),
    ).toThrow('layer host still has texts');

    const draftHost = layer(sessionId, manuscriptId, 'tx3', 'transcription');
    const drafted = layer(sessionId, manuscriptId, 'tl-draft', 'translation', {
      hosts: [{ hostLayerId: draftHost.id, preferred: true }],
    });
    const draftUnit = callDesktopSession(sessionId, 'units.create', {
      layerId: draftHost.id,
      text: '底',
    }) as { id: string };
    callDesktopSession(sessionId, 'units.putTextDraft', {
      unitId: draftUnit.id,
      textLayerId: drafted.id,
      rawInput: '草稿',
      baseBody: '底',
    });
    const draftPreview = callDesktopSession(
      sessionId,
      'layers.previewHosts',
      hosts(drafted.id, [second.id], second.id),
    ) as { blocked: boolean; removed: { texts: number; drafts: number }[] };
    expect(draftPreview.blocked).toBe(true);
    expect(draftPreview.removed).toEqual([expect.objectContaining({ texts: 0, drafts: 1 })]);
    expect(() =>
      callDesktopSession(sessionId, 'layers.setHosts', hosts(drafted.id, [second.id], second.id)),
    ).toThrow('layer host still has texts');

    callDesktopSession(sessionId, 'reopen', {});
    expect(linksOf(sessionId, manuscriptId, text.id)).toEqual(before);
    expect(linksOf(sessionId, manuscriptId, drafted.id)).toEqual([
      expect.objectContaining({ hostLayerId: draftHost.id, isPreferred: true }),
    ]);
  });

  it('detaches a host that has no text', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const second = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const text = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: first.id, preferred: true }, { hostLayerId: second.id }],
    });
    callDesktopSession(sessionId, 'units.create', { layerId: first.id, text: '句子' });
    callDesktopSession(sessionId, 'layers.setHosts', hosts(text.id, [second.id], second.id));
    callDesktopSession(sessionId, 'reopen', {});
    expect(linksOf(sessionId, manuscriptId, text.id)).toEqual([
      expect.objectContaining({ hostLayerId: second.id, isPreferred: true }),
    ]);
  });

  it('rejects a descendant host, a non-transcription host, and a time-subdivision layer', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const text = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: first.id, preferred: true }],
    });
    const child = layer(sessionId, manuscriptId, 'tx-child', 'transcription', {
      parentId: text.id,
    });
    expect(() =>
      callDesktopSession(sessionId, 'layers.setHosts', hosts(text.id, [child.id], child.id)),
    ).toThrow('layer host would form a cycle');
    const other = layer(sessionId, manuscriptId, 'tl2', 'translation', {
      hosts: [{ hostLayerId: first.id, preferred: true }],
    });
    expect(() =>
      callDesktopSession(sessionId, 'layers.setHosts', hosts(text.id, [other.id], other.id)),
    ).toThrow('layer host is not a transcription layer');
    const subdivision = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'sub',
      name: { zh: '词' },
      tierType: 'time-subdivision',
      contentType: 'transcription',
      parentId: first.id,
    }) as { id: string };
    expect(() =>
      callDesktopSession(sessionId, 'layers.setHosts', hosts(subdivision.id, [first.id], first.id)),
    ).toThrow('layer cannot change hosts');
    callDesktopSession(sessionId, 'reopen', {});
    expect(linksOf(sessionId, manuscriptId, text.id)).toEqual([
      expect.objectContaining({ hostLayerId: first.id, isPreferred: true }),
    ]);
  });

  it('leaves a link to a deleted host untouched', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const gone = layer(sessionId, manuscriptId, 'tx-gone', 'transcription');
    const keep = layer(sessionId, manuscriptId, 'tx-keep', 'transcription');
    const text = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [
        { hostLayerId: gone.id, linkType: 'direct' },
        { hostLayerId: keep.id, preferred: true, linkType: 'direct' },
      ],
    });
    const original = linksOf(sessionId, manuscriptId, text.id).find(
      (link) => link.hostLayerId === gone.id,
    );
    callDesktopSession(sessionId, 'layers.delete', { id: gone.id, mode: 'soft' });
    callDesktopSession(sessionId, 'layers.restore', { id: text.id });
    callDesktopSession(sessionId, 'layers.setHosts', hosts(text.id, [keep.id], keep.id, 'literal'));
    callDesktopSession(sessionId, 'layers.restore', { id: gone.id });
    callDesktopSession(sessionId, 'reopen', {});
    const after = linksOf(sessionId, manuscriptId, text.id);
    expect(after).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hostLayerId: gone.id,
          linkType: original?.linkType,
          isPreferred: original?.isPreferred,
          sortOrder: original?.sortOrder,
        }),
        expect.objectContaining({
          hostLayerId: keep.id,
          linkType: 'literal',
          isPreferred: true,
        }),
      ]),
    );
  });

  it('rejects new transcription hosts while still reading an existing legacy link', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const child = layer(sessionId, manuscriptId, 'tx-child', 'transcription');
    const hostUnit = callDesktopSession(sessionId, 'units.create', {
      layerId: host.id,
      text: '宿主',
    }) as { id: string };
    const childUnit = callDesktopSession(sessionId, 'units.create', {
      layerId: child.id,
      text: '自己',
    }) as { id: string; startMs: number | null; endMs: number | null };
    expect(() =>
      callDesktopSession(sessionId, 'layers.setHosts', {
        ...hosts(child.id, [host.id], host.id, 'direct'),
        append: true,
      }),
    ).toThrow('layer cannot change hosts');
    seedLegacyTranscriptionLink(sessionId, manuscriptId, child.id, host.id);
    callDesktopSession(sessionId, 'reopen', {});
    const own = callDesktopSession(sessionId, 'units.list', { layerId: child.id }) as {
      id: string;
      layerId: string;
      startMs: number | null;
      endMs: number | null;
      text: string;
    }[];
    expect(own).toEqual([
      expect.objectContaining({
        id: childUnit.id,
        layerId: child.id,
        startMs: childUnit.startMs,
        endMs: childUnit.endMs,
      }),
    ]);
    const rows = callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
      id: string;
      parentId: string | null;
    }[];
    expect(rows.find((row) => row.id === child.id)?.parentId ?? null).toBeNull();
    callDesktopSession(sessionId, 'units.updateText', { unitId: childUnit.id, text: '改过' });
    const hostRows = callDesktopSession(sessionId, 'units.list', { layerId: host.id }) as {
      id: string;
      text: string;
    }[];
    expect(hostRows.find((row) => row.id === hostUnit.id)?.text).toBe('宿主');
    expect(own.length).toBe(1);
    const saved = callDesktopSession(sessionId, 'units.list', { layerId: child.id }) as {
      text: string;
    }[];
    expect(saved[0]?.text).toBe('改过');
    expect(() =>
      callDesktopSession(sessionId, 'units.updateText', {
        unitId: hostUnit.id,
        textLayerId: child.id,
        text: '写到宿主',
      }),
    ).toThrow('unit text stays on its layer');
    const after = callDesktopSession(sessionId, 'units.list', { layerId: host.id }) as {
      id: string;
      text: string;
    }[];
    expect(after.find((row) => row.id === hostUnit.id)?.text).toBe('宿主');
  });

  it('returns only a time-aligned transcription to the root, and reorders siblings in one write', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const host = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const child = layer(sessionId, manuscriptId, 'tx-child', 'transcription');
    const translation = layer(sessionId, manuscriptId, 'tl', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true, linkType: 'direct' }],
    });
    const second = layer(sessionId, manuscriptId, 'tl-2', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    const third = layer(sessionId, manuscriptId, 'tl-3', 'translation', {
      hosts: [{ hostLayerId: host.id, preferred: true }],
    });
    seedLegacyTranscriptionLink(sessionId, manuscriptId, child.id, host.id);
    const before = linksOf(sessionId, manuscriptId, translation.id);
    expect(() =>
      callDesktopSession(sessionId, 'layers.clearHosts', { layerId: translation.id, sortOrder: 0 }),
    ).toThrow('layer cannot leave its host');
    expect(linksOf(sessionId, manuscriptId, translation.id)).toEqual(before);
    callDesktopSession(sessionId, 'layers.clearHosts', { layerId: child.id, sortOrder: 0 });
    expect(linksOf(sessionId, manuscriptId, child.id)).toEqual([]);
    const rows = callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
      id: string;
      parentId: string | null;
      sortOrder: number;
    }[];
    expect(rows.find((row) => row.id === child.id)?.parentId ?? null).toBeNull();
    callDesktopSession(sessionId, 'layers.place', {
      layerId: translation.id,
      hostLayerId: host.id,
    });
    const sorts = [translation.id, second.id, third.id].map(
      (id) => linksOf(sessionId, manuscriptId, id).find((link) => link.isPreferred)?.sortOrder,
    );
    expect(sorts).toEqual([2, 0, 1]);
  });

  it('places a cleared transcription among roots and leaves a parent-linked subdivision in place', () => {
    const { sessionId, manuscriptId } = openManuscript();
    const first = layer(sessionId, manuscriptId, 'tx', 'transcription');
    const second = layer(sessionId, manuscriptId, 'tx2', 'transcription');
    const subdivision = callDesktopSession(sessionId, 'layers.create', {
      manuscriptId,
      key: 'sub',
      name: { zh: '词' },
      tierType: 'time-subdivision',
      contentType: 'transcription',
      parentId: first.id,
    }) as { id: string };
    const child = layer(sessionId, manuscriptId, 'tx-child', 'transcription');
    const listed = () =>
      callDesktopSession(sessionId, 'layers.list', { manuscriptId }) as {
        id: string;
        parentId: string | null;
        sortOrder: number;
      }[];
    const before = listed().find((row) => row.id === subdivision.id);
    seedLegacyTranscriptionLink(sessionId, manuscriptId, child.id, first.id);
    const linked = () =>
      new Set(
        (
          callDesktopSession(sessionId, 'layers.listLinks', { manuscriptId }) as {
            layerId: string;
          }[]
        ).map((link) => link.layerId),
      );
    const byRoot = (rows: { id: string; parentId: string | null; sortOrder: number }[]) => {
      const hosts = linked();
      return rows
        .filter((row) => row.parentId === null && !hosts.has(row.id))
        .sort((a, b) =>
          a.sortOrder === b.sortOrder ? a.id.localeCompare(b.id) : a.sortOrder - b.sortOrder,
        )
        .map((row) => row.id);
    };
    const roots = byRoot(listed());
    expect(roots).toHaveLength(2);
    expect(roots).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(roots).not.toContain(subdivision.id);
    const expected = [...roots];
    expected.splice(1, 0, child.id);
    callDesktopSession(sessionId, 'layers.clearHosts', { layerId: child.id, sortOrder: 1 });
    const rows = listed();
    expect(rows.find((row) => row.id === subdivision.id)).toEqual(
      expect.objectContaining({
        parentId: first.id,
        sortOrder: before?.sortOrder,
      }),
    );
    expect(byRoot(rows)).toEqual(expected);
  });
});
