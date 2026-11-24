import { layerCreateParams } from './desktopTranscriptionLayerCommands';
import { describe, expect, it } from 'vitest';
import { layerCommandItems, nextLayerName } from './desktopTranscriptionLayerCommands';

const layers = [
  {
    id: 'tx',
    name: { zh: '木雅语' },
    contentType: 'transcription',
    tierType: 'time-aligned',
  },
  {
    id: 'tr',
    name: { zh: '汉语' },
    contentType: 'translation',
    tierType: 'symbolic-association',
  },
];

const drag = {
  attachReason: () => null as null,
  returnReason: () => 'app.desktopTranscription.layerAlreadyRoot' as const,
  showReturn: (id: string) => id === 'tx',
};

describe('layerCommandItems', () => {
  it('keeps return-to-root on the transcription layer and hosts on the symbolic layer', () => {
    const home = layerCommandItems({
      locale: 'zh-CN',
      layerId: 'tx',
      layers,
      links: [{ layerId: 'tr', hostLayerId: 'tx', isPreferred: true }],
      currentId: 'tx',
      drag,
      hosts: true,
    }).map((item) => item.id);
    const guest = layerCommandItems({
      locale: 'zh-CN',
      layerId: 'tr',
      layers,
      links: [{ layerId: 'tr', hostLayerId: 'tx', isPreferred: true }],
      currentId: 'tx',
      drag,
      hosts: true,
    });
    expect(home).toContain('return');
    expect(home).not.toContain('attach');
    expect(home).not.toContain('hosts');
    expect(guest.map((item) => item.id)).not.toContain('return');
    expect(guest.find((item) => item.id === 'attach')?.label).toBe('挂到「木雅语」');
    expect(guest.map((item) => item.id)).toContain('hosts');
    expect(
      layerCommandItems({
        locale: 'zh-CN',
        layerId: 'tx',
        layers,
        links: [{ layerId: 'tr', hostLayerId: 'tx', isPreferred: true }],
        currentId: 'tx',
        drag,
        hosts: true,
      }).find((item) => item.id === 'return')?.disabledReason,
    ).toBe('已经在顶层');
  });

  it('numbers a copy when the base name is taken', () => {
    const layers = [{ id: 'tx', name: { zh: '转写' } }];
    expect(nextLayerName('转写', layers, 'zh-CN')).toBe('转写 2');
    expect(nextLayerName('译文', layers, 'zh-CN')).toBe('译文');
  });
});

it('creates an orthography only on the requested time owner and never falls back to the first layer', () => {
  const a = { id: 'a', contentType: 'transcription', tierType: 'time-aligned' };
  const b = { ...a, id: 'b' };
  const spelling = { id: 's', contentType: 'transcription', tierType: 'symbolic-association' };
  const base = {
    kind: 'orthography' as const,
    label: '拼音',
    manuscriptId: 'm',
    layers: [a, b, spelling],
    links: [{ layerId: 's', hostLayerId: 'b', isPreferred: true }],
    deletedKeys: [],
  };
  expect(layerCreateParams({ ...base, currentLayerId: 's' })).toMatchObject({
    tierType: 'symbolic-association',
    contentType: 'transcription',
    hosts: [{ hostLayerId: 'b', preferred: true }],
  });
  expect(() => layerCreateParams({ ...base, currentLayerId: null })).toThrow(
    'layer host is not a transcription layer',
  );
});

it('explains the anchor deletion block and does not offer translation relations on an orthography', () => {
  const layers = [
    { id: 'ipa', name: { zh: 'IPA' }, contentType: 'transcription', tierType: 'time-aligned' },
    {
      id: 'spelling',
      name: { zh: '拼音' },
      contentType: 'transcription',
      tierType: 'symbolic-association',
    },
  ];
  const input = {
    locale: 'zh-CN' as const,
    layers,
    links: [{ layerId: 'spelling', hostLayerId: 'ipa', isPreferred: true }],
    currentId: 'ipa',
    hosts: true,
  };
  expect(
    layerCommandItems({ ...input, layerId: 'ipa' }).find((row) => row.id === 'delete')
      ?.disabledReason,
  ).toContain('请先删除');
  expect(
    layerCommandItems({ ...input, layerId: 'spelling' }).some((row) => row.id === 'hosts'),
  ).toBe(false);
});
