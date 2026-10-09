// @vitest-environment jsdom
/**
 * 层元信息更新走真实主库（写入校验与归属中间件都在）。JY-18：
 * 层、翻译链接、层定义一个事务；约束失败整体回滚；别名没变时名称原样保留，不写固定的「翻译 / 转写」。
 * Layer metadata update against the real main DB (write validation and ownership middleware on).
 * JY-18: layer, links and tier share one transaction; a constraint failure rolls all of it back;
 * the name is kept when the alias is unchanged and no fixed 翻译 / 转写 text is written.
 */
import 'fake-indexeddb/auto';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDb, type LayerDocType, type LayerLinkDocType } from '../db';
import { useTranscriptionLayerMetadataController } from './useTranscriptionLayerMetadataController';
import { LayerTierUnifiedService } from '../services/LayerTierUnifiedService';

const NOW = '2026-04-25T00:00:00.000Z';

function makeLayer(overrides: Partial<LayerDocType> = {}): LayerDocType {
  return {
    id: 'trc-1',
    textId: 'text-1',
    key: 'trc-1',
    layerType: 'transcription',
    name: { zho: '转写' },
    languageId: 'cmn',
    modality: 'text',
    constraint: 'independent_boundary',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as LayerDocType;
}

const transcriptionA = makeLayer({ id: 'trc-a', key: 'trc-a', name: { zho: '宿主 A' } });
const transcriptionB = makeLayer({ id: 'trc-b', key: 'trc-b', name: { zho: '宿主 B' } });
const translationLayer = makeLayer({
  id: 'trl-1',
  key: 'trl-1',
  layerType: 'translation',
  name: { zho: '翻译 · 旧名', eng: 'Old gloss' },
  constraint: 'symbolic_association',
});
const legacyLink: LayerLinkDocType = {
  id: 'legacy-link',
  transcriptionLayerKey: 'trc-a',
  hostTranscriptionLayerId: 'trc-a',
  layerId: 'trl-1',
  linkType: 'free',
  isPreferred: true,
  createdAt: NOW,
};

async function storedLayer(id: string): Promise<LayerDocType | undefined> {
  const database = await getDb();
  const doc = await database.collections.layers.findOne({ selector: { id } }).exec();
  return doc ? (doc.toJSON() as LayerDocType) : undefined;
}

function renderController(layers: LayerDocType[], layerLinks: LayerLinkDocType[]) {
  const setLayerCreateMessage = vi.fn();
  const setLayers = vi.fn();
  const setLayerLinks = vi.fn();
  const { result } = renderHook(() =>
    useTranscriptionLayerMetadataController({
      layers,
      layerLinks,
      setLayerCreateMessage,
      setLayers,
      setLayerLinks,
    }),
  );
  return { result, setLayerCreateMessage, setLayers, setLayerLinks };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  await db.texts.put({ id: 'text-1', title: { default: 't' }, createdAt: NOW, updatedAt: NOW });
  for (const layer of [transcriptionA, transcriptionB, translationLayer]) {
    await LayerTierUnifiedService.updateLayer(layer);
  }
  await db.layer_links.put(legacyLink);
});

describe('useTranscriptionLayerMetadataController', () => {
  it('writes the layer, its host links and the tier parents together', async () => {
    const { result, setLayerLinks } = renderController(
      [transcriptionA, transcriptionB, translationLayer],
      [legacyLink],
    );

    let success = false;
    await act(async () => {
      success = await result.current.updateLayerMetadata('trl-1', {
        languageId: 'eng',
        alias: '新译层',
        hostTranscriptionLayerIds: ['trc-a', 'trc-b'],
        preferredHostTranscriptionLayerId: 'trc-b',
        linkType: 'literal',
      });
    });

    expect(success).toBe(true);
    const layer = await storedLayer('trl-1');
    expect(layer?.languageId).toBe('eng');
    // 新别名写在 und，带旧别名的 zho 去掉，英文名保留 | New alias under und, old-alias zho dropped
    expect(layer?.name).toEqual({ eng: 'Old gloss', und: '新译层' });
    const links = await db.layer_links.where('layerId').equals('trl-1').toArray();
    expect(
      links.map((link) => [link.hostTranscriptionLayerId, link.isPreferred, link.linkType]).sort(),
    ).toEqual([
      ['trc-a', false, 'literal'],
      ['trc-b', true, 'literal'],
    ]);
    const tier = await db.tier_definitions.get('trl-1');
    expect(tier?.parentTierId).toBe('trc-b');
    expect(tier?.extraParentTierIds).toEqual(['trc-a']);
    expect(setLayerLinks).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing name when the alias is unchanged (no fixed 翻译 / 转写 text)', async () => {
    const named = makeLayer({ id: 'trc-a', key: 'trc-a', name: { zho: '宿主 A · 张三' } });
    const { result } = renderController([named, transcriptionB, translationLayer], [legacyLink]);

    await act(async () => {
      // 对话框把当前别名原样带回 | The dialog sends the current alias back unchanged
      await result.current.updateLayerMetadata('trc-a', {
        alias: '宿主 A · 张三',
        languageId: 'yue',
      });
    });

    const layer = await storedLayer('trc-a');
    expect(layer?.languageId).toBe('yue');
    expect(layer?.name).toEqual({ zho: '宿主 A · 张三' });
  });

  it('rolls back every write when the tier constraint check fails', async () => {
    const { result, setLayerCreateMessage, setLayers } = renderController(
      [transcriptionA, transcriptionB, translationLayer],
      [legacyLink],
    );

    let success = true;
    await act(async () => {
      success = await result.current.updateLayerMetadata('trc-a', {
        alias: '改名',
        languageId: 'eng',
        parentLayerId: 'missing-parent',
      });
    });

    expect(success).toBe(false);
    expect(setLayers).not.toHaveBeenCalled();
    expect(String(setLayerCreateMessage.mock.calls.at(-1)?.[0])).toContain('missing-parent');
    const layer = await storedLayer('trc-a');
    expect(layer?.languageId).toBe('cmn');
    expect(layer?.name).toEqual({ zho: '宿主 A' });
    expect((await db.tier_definitions.get('trc-a'))?.parentTierId).toBeUndefined();
  });

  it('rejects a translation layer without any host before writing', async () => {
    const { result, setLayerCreateMessage } = renderController(
      [transcriptionA, transcriptionB, translationLayer],
      [legacyLink],
    );
    let success = true;
    await act(async () => {
      success = await result.current.updateLayerMetadata('trl-1', {
        hostTranscriptionLayerIds: [],
      });
    });
    expect(success).toBe(false);
    expect(setLayerCreateMessage).toHaveBeenCalledWith(
      '更新层元信息失败：翻译层至少需要一个宿主转写层。',
    );
    expect(
      (await db.layer_links.where('layerId').equals('trl-1').toArray()).map((l) => l.id),
    ).toEqual(['legacy-link']);
  });
});
