import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveCards } from './deriveCards';
import { planLegacyMigration, type LegacyLibrary } from './planLegacyMigration';

type ReadyPlan = Extract<ReturnType<typeof planLegacyMigration>, { status: 'ready' }>;

const bytes = (text: string) => new TextEncoder().encode(text);
const fold = (name: string) => name.normalize('NFC').toUpperCase().toLowerCase();

function ready(library: LegacyLibrary, options?: { confirmSplit?: boolean }): ReadyPlan {
  const plan = planLegacyMigration(library, options);
  if (plan.status !== 'ready') throw new Error(`expected ready, got ${plan.status}`);
  return plan;
}

/** 经命令行写进一个新目录，返回目录和读回结果。 */
function applyViaCli(plan: ReadyPlan): { root: string; dest: string; stdout: string } {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-plan-safety-'));
  const dest = join(root, 'project');
  const planFile = join(root, 'plan.json');
  writeFileSync(
    planFile,
    JSON.stringify({
      ...plan,
      audios: plan.audios.map((audio) => ({
        ...audio,
        bytes: Buffer.from(audio.bytes).toString('base64'),
      })),
    }),
  );
  const result = spawnSync(
    process.execPath,
    ['--experimental-sqlite', join(process.cwd(), 'scripts/apply-legacy-plan.mjs'), planFile, dest],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(result.stderr);
  }
  return { root, dest, stdout: result.stdout };
}

const SAFE_SEGMENT = /^[^<>:"/\\|?*\u0000-\u001f\u007f]+$/u;
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;

describe('planLegacyMigration file names', () => {
  const hostileTitles = [
    '../escaped',
    'a/b',
    'a\\b',
    '..',
    '.',
    '',
    '   ',
    'CON',
    'con.txt',
    'Lpt9',
    'a:b',
    'q?*"<>|',
    'tab\there',
    'trailing. ',
    'Doc',
    'doc',
    'e\u0301',
    '\u00e9',
    'x'.repeat(400),
    '项目'.repeat(200),
  ];
  const hostileAudios = [
    'project.sqlite',
    'PROJECT.SQLITE',
    'x.jyd',
    'X.JYD',
    'doc.jyd',
    '已隐藏',
    'rec.wav-journal',
    'Rec.wav',
    'rec.wav',
    '../../up.wav',
    'C:\\Users\\a\\aux.wav',
  ];

  function hostileLibrary(): LegacyLibrary {
    return {
      documents: hostileTitles.map((name, index) => ({ id: `d${index}`, name })),
      layers: hostileTitles.map((_, index) => ({ id: `l${index}`, documentId: `d${index}` })),
      units: hostileTitles.map((_, index) => ({
        id: `u${index}`,
        layerId: `l${index}`,
        mediaId: `a${index % hostileAudios.length}`,
      })),
      audios: hostileAudios.map((filename, index) => ({
        id: `a${index}`,
        filename,
        bytes: bytes(`audio-${index}`),
      })),
    };
  }

  it('makes every name a single safe segment, unique across audio and .jyd under case folding', () => {
    const plan = ready(hostileLibrary());
    const names = [
      ...plan.audios.map((audio) => audio.fileName),
      ...plan.manuscripts.map((manuscript) => manuscript.fileName),
    ];
    expect(plan.manuscripts).toHaveLength(hostileTitles.length);
    expect(plan.audios).toHaveLength(hostileAudios.length);
    for (const name of names) {
      expect(name, name).toMatch(SAFE_SEGMENT);
      expect(name).not.toMatch(/^[. ]|[. ]$/u);
      expect(DEVICE.test((name.split('.')[0] ?? '').trimEnd()), name).toBe(false);
      expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
    }
    const keys = [...names, 'project.sqlite', '已隐藏'].map(fold);
    expect(new Set(keys).size).toBe(keys.length);
    for (const audio of plan.audios) {
      expect(fold(audio.fileName)).not.toMatch(/\.jyd$|-(journal|wal|shm)$/u);
    }
    expect(plan.manuscripts.map((manuscript) => manuscript.fileName).slice(0, 3)).toEqual([
      '_escaped.jyd',
      'a_b.jyd',
      'a_b (2).jyd',
    ]);
    expect(plan.manuscripts.find((manuscript) => manuscript.id === 'd7')?.fileName).toBe(
      'CON_.jyd',
    );
    expect(plan.manuscripts.find((manuscript) => manuscript.id === 'd15')?.fileName).toBe(
      'doc (2).jyd',
    );
    expect(plan.manuscripts.find((manuscript) => manuscript.id === 'd17')?.fileName).toBe(
      '\u00e9 (2).jyd',
    );
    expect(plan.audios.find((audio) => audio.audioId === 'a0')?.fileName).toBe('project.sqlite_');
    expect(plan.audios.find((audio) => audio.audioId === 'a8')?.fileName).toBe('rec (2).wav');
  });

  it('writes every planned file inside the destination', () => {
    const plan = ready(hostileLibrary());
    const { root, dest } = applyViaCli(plan);
    try {
      const realDest = realpathSync(dest);
      const onDisk = readdirSync(dest);
      expect(readdirSync(root).sort()).toEqual(['plan.json', 'project']);
      expect(onDisk).toHaveLength(plan.audios.length + plan.manuscripts.length + 1);
      for (const name of onDisk) {
        const full = realpathSync(resolve(dest, name));
        expect(full.startsWith(realDest + sep)).toBe(true);
        expect(dirname(full)).toBe(realDest);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('planLegacyMigration audio without segments', () => {
  it('keeps an unreferenced audio as a recording card, writes it, and reads it back', () => {
    const plan = ready({
      documents: [{ id: 'd1', name: 'doc' }],
      layers: [{ id: 'l1', documentId: 'd1' }],
      units: [{ id: 'u1', layerId: 'l1', mediaId: 'a1' }],
      audios: [
        { id: 'a1', filename: 'used.wav', bytes: bytes('A') },
        { id: 'a2', filename: 'orphan.wav', bytes: bytes('B') },
      ],
    });
    expect(plan.audios.map((audio) => [audio.audioId, audio.fileName])).toEqual([
      ['a1', 'used.wav'],
      ['a2', 'orphan.wav'],
    ]);
    const { root, dest, stdout } = applyViaCli(plan);
    try {
      expect(readdirSync(dest).sort()).toEqual([
        'doc.jyd',
        'orphan.wav',
        'project.sqlite',
        'used.wav',
      ]);
      const back = JSON.parse(stdout) as {
        audios: { id: string; relPath: string; sha256: string }[];
        manuscripts: { id: string; fileName: string; audioId: string | null }[];
      };
      expect(back.audios.map((audio) => [audio.id, audio.relPath])).toEqual([
        ['a1', 'used.wav'],
        ['a2', 'orphan.wav'],
      ]);
      const cards = deriveCards(
        back.manuscripts.map((manuscript) => ({
          id: manuscript.id,
          relPath: manuscript.fileName,
          audioId: manuscript.audioId,
        })),
        back.audios,
      );
      expect(cards).toEqual({
        cards: [
          { manuscriptId: 'd1', audioId: 'a1', hidden: false },
          { manuscriptId: null, audioId: 'a2', hidden: false },
        ],
        issues: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('planLegacyMigration split and audio references', () => {
  function twoAudioDocument(): LegacyLibrary {
    return {
      documents: [{ id: 'd1', name: 'doc' }],
      layers: [
        { id: 'l1', documentId: 'd1' },
        { id: 'l2', documentId: 'd1' },
      ],
      units: [
        { id: 'u1', layerId: 'l1', mediaId: 'a1' },
        { id: 'u2', layerId: 'l1', mediaId: ' a2 ' },
        { id: 'u3', layerId: 'l1', mediaId: ' a1' },
        { id: 'child', layerId: 'l2', parentUnitId: 'u1' },
        { id: 'grandchild', layerId: 'l2', parentUnitId: 'child', mediaId: '  ' },
        { id: 'cross', layerId: 'l2', parentUnitId: 'u1', mediaId: 'a2' },
        { id: 'note', layerId: 'l2' },
      ],
      audios: [
        { id: 'a1', filename: 'a.wav', bytes: bytes('A') },
        { id: 'a2', filename: 'b.wav', bytes: bytes('B') },
      ],
    };
  }

  it('lists what a split would drop before the user confirms it', () => {
    expect(planLegacyMigration(twoAudioDocument())).toEqual({
      status: 'needs-confirm',
      documents: [
        {
          documentId: 'd1',
          audioIds: ['a1', 'a2'],
          droppedUnits: [{ id: 'note', reason: 'no-audio' }],
          droppedLinks: [{ unitId: 'cross', parentUnitId: 'u1' }],
        },
      ],
    });
  });

  it('puts units without a mediaId with their parent and records text-only units with a reason', () => {
    const plan = ready(twoAudioDocument(), { confirmSplit: true });
    const unitsOf = (audioId: string) =>
      plan.manuscripts
        .find((manuscript) => manuscript.audioId === audioId)
        ?.units.map((unit) => [unit.id, unit.mediaId ?? null, unit.parentUnitId ?? null]);
    expect(unitsOf('a1')).toEqual([
      ['u1', 'a1', null],
      ['u3', 'a1', null],
      ['child', null, 'u1'],
      ['grandchild', null, 'child'],
    ]);
    expect(unitsOf('a2')).toEqual([
      ['u2', 'a2', null],
      ['cross', 'a2', null],
    ]);
    expect(plan.droppedUnits).toEqual([{ id: 'note', layerId: 'l2', reason: 'no-audio-in-split' }]);
    expect(plan.droppedLinks).toEqual([{ unitId: 'cross', parentUnitId: 'u1' }]);
  });

  it('records a manuscript whose audio id is not in the library', () => {
    const plan = ready({
      documents: [{ id: 'd1', name: 'doc' }],
      layers: [{ id: 'l1', documentId: 'd1' }],
      units: [{ id: 'u1', layerId: 'l1', mediaId: 'ghost' }],
      audios: [],
    });
    expect(plan.manuscripts.map((manuscript) => manuscript.audioId)).toEqual(['ghost']);
    expect(plan.missingAudios).toEqual([{ manuscriptId: 'd1', audioId: 'ghost' }]);
  });
});

describe('planLegacyMigration records and ids across manuscripts', () => {
  it('records a document source that is linked to another audio', () => {
    const plan = ready({
      project: { id: 'p1', name: 'P' },
      documents: [{ id: 'd1', name: 'doc', sourceIds: ['s-other'] }],
      layers: [{ id: 'l1', documentId: 'd1' }],
      units: [{ id: 'u1', layerId: 'l1', mediaId: 'a1' }],
      audios: [{ id: 'a1', filename: 'a.wav', bytes: bytes('A') }],
      sourceRecords: [
        {
          id: 's-other',
          textId: 'p1',
          originalName: 'x',
          displayName: 'x',
          format: 'eaf',
          mediaId: 'a9',
        },
      ],
    });
    expect(plan.manuscripts[0]?.sourceIds).toEqual([]);
    expect(plan.droppedSourceRefs).toEqual([
      { documentId: 'd1', sourceId: 's-other', mediaId: 'a9', reason: 'other-audio' },
    ]);
  });

  it('gives each copy of an anchor, track or layer link its own id and records the mapping', () => {
    const plan = ready(
      {
        documents: [
          { id: 'd1', name: 'one' },
          { id: 'd2', name: 'two' },
        ],
        layers: [
          { id: 'l1', documentId: 'd1' },
          { id: 'l1b', documentId: 'd1' },
          { id: 'l2', documentId: 'd2' },
        ],
        units: [
          { id: 'u1', layerId: 'l1', mediaId: 'a1', startAnchorId: 'an1', endAnchorId: 'an2' },
          { id: 'u1b', layerId: 'l1b', mediaId: 'a2' },
          { id: 'u2', layerId: 'l2', mediaId: 'a1', startAnchorId: 'an1' },
        ],
        audios: [
          { id: 'a1', filename: 'a.wav', bytes: bytes('A') },
          { id: 'a2', filename: 'b.wav', bytes: bytes('B') },
        ],
        anchors: [
          { id: 'an1', mediaId: 'a1', time: 0 },
          { id: 'an2', mediaId: 'a1', time: 1 },
        ],
        tracks: [{ id: 't1', mediaId: 'a1', mode: 'single' }],
        layerLinks: [
          { id: 'll1', hostLayerId: 'l1', layerId: 'l1b', linkType: 'free', isPreferred: true },
        ],
      },
      { confirmSplit: true },
    );
    const byId = new Map(plan.manuscripts.map((manuscript) => [manuscript.id, manuscript]));
    expect(byId.get('d1--a1')?.anchors.map((anchor) => anchor.id)).toEqual(['an1', 'an2']);
    expect(byId.get('d2')?.anchors.map((anchor) => anchor.id)).toEqual(['an1--d2', 'an2--d2']);
    expect(byId.get('d2')?.units[0]).toMatchObject({ id: 'u2', startAnchorId: 'an1--d2' });
    expect(byId.get('d2')?.tracks.map((track) => track.id)).toEqual(['t1--d2']);
    for (const kind of ['anchors', 'tracks', 'layerLinks'] as const) {
      const ids = plan.manuscripts.flatMap((manuscript) => manuscript[kind].map((row) => row.id));
      expect(new Set(ids).size, kind).toBe(ids.length);
    }
    expect(plan.copiedIds).toEqual([
      { manuscriptId: 'd2', kind: 'anchor', fromId: 'an1', toId: 'an1--d2' },
      { manuscriptId: 'd2', kind: 'anchor', fromId: 'an2', toId: 'an2--d2' },
      { manuscriptId: 'd2', kind: 'track', fromId: 't1', toId: 't1--d2' },
    ]);
    const { root, stdout } = applyViaCli(plan);
    try {
      const back = JSON.parse(stdout) as {
        manuscripts: {
          id: string;
          anchors: { id: string }[];
          units: { id: string; startAnchorId?: string }[];
        }[];
      };
      const anchorIds = back.manuscripts.flatMap((manuscript) =>
        manuscript.anchors.map((a) => a.id),
      );
      expect(new Set(anchorIds).size).toBe(anchorIds.length);
      expect(
        back.manuscripts.find((manuscript) => manuscript.id === 'd2')?.units[0]?.startAnchorId,
      ).toBe('an1--d2');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
