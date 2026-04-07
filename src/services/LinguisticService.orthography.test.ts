/**
 * 正字法与正字法桥接 CRUD 测试 | Orthography & bridge CRUD tests.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearLanguageCatalogRuntimeCache } from '../data/languageCatalogRuntimeCache';
import { db } from '../db';
import { LinguisticService } from './LinguisticService';

// ── 辅助函数 | Helpers ──────────────────────────────────────────────────────

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.orthographies.clear(),
    db.orthography_bridges.clear(),
    db.languages.clear(),
    db.language_display_names.clear(),
    db.language_aliases.clear(),
    db.language_catalog_history.clear(),
  ]);
}

async function seedOrthography(overrides: Record<string, unknown> = {}) {
  return LinguisticService.createOrthography({
    languageId: 'cmn',
    name: { zho: '拼音', eng: 'Pinyin' },
    type: 'practical',
    scriptTag: 'Latn',
    direction: 'ltr',
    ...overrides,
  });
}

// ── 测试套件 | Test suite ────────────────────────────────────────────────────

describe('LinguisticService.orthography', () => {
  beforeEach(async () => {
    await db.open();
    await clearDatabase();
    clearLanguageCatalogRuntimeCache();
  });

  // ── 正字法 CRUD | Orthography CRUD ──────────────────────────────────────

  describe('createOrthography', () => {
    it('创建并持久化正字法记录 | creates and persists an orthography record', async () => {
      const created = await seedOrthography();

      expect(created.id).toMatch(/^orth_/);
      expect(created.languageId).toBe('cmn');
      expect(created.name.eng).toBe('Pinyin');
      expect(created.type).toBe('practical');
      expect(created.createdAt).toBeTruthy();

      const saved = await db.orthographies.get(created.id);
      expect(saved?.scriptTag).toBe('Latn');
    });

    it('同语言下身份重复时抛出错误 | rejects duplicate identity within the same language', async () => {
      await seedOrthography();
      await expect(seedOrthography()).rejects.toThrow();
    });

    it('不同语言可使用相同身份 | allows same identity for different languages', async () => {
      await seedOrthography();
      const other = await seedOrthography({ languageId: 'yue' });
      expect(other.languageId).toBe('yue');
    });
  });

  describe('updateOrthography', () => {
    it('更新名称与缩写 | updates name and abbreviation', async () => {
      const created = await seedOrthography();
      const updated = await LinguisticService.updateOrthography({
        id: created.id,
        languageId: 'cmn',
        name: { zho: '汉语拼音', eng: 'Hanyu Pinyin' },
        abbreviation: 'PY',
        type: 'practical',
        scriptTag: 'Latn',
        direction: 'ltr',
      });

      expect(updated.name.zho).toBe('汉语拼音');
      expect(updated.abbreviation).toBe('PY');
      expect(updated.updatedAt).toBeTruthy();
    });

    it('更新为已存在的身份时抛出 | rejects update that creates duplicate identity', async () => {
      const a = await seedOrthography();
      const b = await seedOrthography({
        type: 'phonetic',
        name: { eng: 'IPA' },
      });

      await expect(
        LinguisticService.updateOrthography({
          id: b.id,
          languageId: 'cmn',
          name: { eng: 'IPA' },
          type: 'practical',
          scriptTag: 'Latn',
          direction: 'ltr',
        }),
      ).rejects.toThrow();

      // 保持自身身份不报错 | keeping own identity should not throw
      const selfUpdate = await LinguisticService.updateOrthography({
        id: a.id,
        languageId: 'cmn',
        name: { eng: 'Pinyin 2' },
        type: 'practical',
        scriptTag: 'Latn',
        direction: 'ltr',
      });
      expect(selfUpdate.id).toBe(a.id);
    });
  });

  describe('listOrthographies', () => {
    it('按语言过滤 | filters by languageId', async () => {
      await seedOrthography();
      await seedOrthography({ languageId: 'yue', name: { eng: 'Jyutping' } });

      const list = await LinguisticService.listOrthographies({ languageId: 'cmn' });
      expect(list.every((o) => o.languageId === 'cmn')).toBe(true);
    });
  });

  describe('cloneOrthographyToLanguage', () => {
    it('克隆到新语言 | clones orthography to a different language', async () => {
      const source = await seedOrthography();
      const cloned = await LinguisticService.cloneOrthographyToLanguage({
        sourceOrthographyId: source.id,
        targetLanguageId: 'yue',
        name: { eng: 'Cantonese Pinyin' },
      });

      expect(cloned.id).not.toBe(source.id);
      expect(cloned.languageId).toBe('yue');
      expect(cloned.scriptTag).toBe('Latn');
    });
  });

  // ── 桥接 CRUD | Bridge CRUD ────────────────────────────────────────────

  describe('orthography bridges', () => {
    async function seedBridgePair() {
      const source = await seedOrthography();
      const target = await seedOrthography({
        type: 'phonetic',
        name: { eng: 'IPA' },
      });
      return { source, target };
    }

    it('创建桥接并持久化 | creates and persists a bridge', async () => {
      const { source, target } = await seedBridgePair();
      const bridge = await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [{ from: 'a', to: 'ɑ' }] },
        status: 'active',
      });

      expect(bridge.id).toMatch(/^orthxfm_/);
      expect(bridge.sourceOrthographyId).toBe(source.id);
      expect(bridge.status).toBe('active');

      const saved = await db.orthography_bridges.get(bridge.id);
      expect(saved).toBeTruthy();
    });

    it('源与目标相同时抛出 | rejects bridge when source equals target', async () => {
      const source = await seedOrthography();
      await expect(
        LinguisticService.createOrthographyBridge({
          sourceOrthographyId: source.id,
          targetOrthographyId: source.id,
          engine: 'table-map',
          rules: { mappings: [] },
        }),
      ).rejects.toThrow();
    });

    it('激活桥接时停用同对中其他桥接 | deactivates sibling bridges on activation', async () => {
      const { source, target } = await seedBridgePair();

      const bridge1 = await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [{ from: 'a', to: 'ɑ' }] },
        status: 'active',
      });

      const bridge2 = await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [{ from: 'a', to: 'æ' }] },
        status: 'active',
      });

      // bridge1 应被停用 | bridge1 should be deactivated
      const refreshed = await db.orthography_bridges.get(bridge1.id);
      expect(refreshed?.status).not.toBe('active');

      expect(bridge2.status).toBe('active');
    });

    it('listOrthographyBridges 按源/目标过滤 | filters by source/target', async () => {
      const { source, target } = await seedBridgePair();
      await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [] },
      });

      const list = await LinguisticService.listOrthographyBridges({
        sourceOrthographyId: source.id,
      });
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every((b) => b.sourceOrthographyId === source.id)).toBe(true);
    });

    it('updateOrthographyBridge 更新规则 | updates bridge rules', async () => {
      const { source, target } = await seedBridgePair();
      const bridge = await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [{ from: 'a', to: 'ɑ' }] },
      });

      const updated = await LinguisticService.updateOrthographyBridge({
        id: bridge.id,
        rules: { mappings: [{ from: 'b', to: 'β' }] },
      });

      expect(updated.rules.mappings?.[0]?.from).toBe('b');
    });

    it('deleteOrthographyBridge 删除桥接 | deletes a bridge', async () => {
      const { source, target } = await seedBridgePair();
      const bridge = await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [] },
      });

      await LinguisticService.deleteOrthographyBridge(bridge.id);
      const deleted = await db.orthography_bridges.get(bridge.id);
      expect(deleted).toBeUndefined();
    });

    it('getActiveOrthographyBridge 返回最新激活桥接 | returns most recently active bridge', async () => {
      const { source, target } = await seedBridgePair();

      // 先创建一个 draft 桥接 | First create a draft bridge
      await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [{ from: 'x', to: 'y' }] },
        status: 'draft',
      });

      const active = await LinguisticService.getActiveOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
      });
      // 仅有 draft，应返回 null | Only draft exists, should return null
      expect(active).toBeNull();

      // 创建 active 桥接 | Create an active bridge
      const activeBridge = await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [{ from: 'a', to: 'ɑ' }] },
        status: 'active',
      });

      const found = await LinguisticService.getActiveOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
      });
      expect(found?.id).toBe(activeBridge.id);
    });

    it('applyOrthographyBridge 执行 table-map 转换 | applies table-map bridge transformation', async () => {
      const { source, target } = await seedBridgePair();
      await LinguisticService.createOrthographyBridge({
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
        engine: 'table-map',
        rules: { mappings: [{ from: 'a', to: 'ɑ' }] },
        status: 'active',
      });

      const result = await LinguisticService.applyOrthographyBridge({
        text: 'banana',
        sourceOrthographyId: source.id,
        targetOrthographyId: target.id,
      });

      expect(result.text).toBe('bɑnɑnɑ');
      expect(result.bridgeId).toBeTruthy();
    });

    it('previewOrthographyBridge 同步预览 | synchronously previews bridge text', () => {
      const result = LinguisticService.previewOrthographyBridge({
        engine: 'table-map',
        rules: { mappings: [{ from: 'a', to: 'ɑ' }, { from: 'e', to: 'ɛ' }] },
        text: 'cafe',
      });
      expect(result).toBe('cɑfɛ');
    });

    it('源/目标相同时 applyOrthographyBridge 返回原文 | returns original text when source equals target', async () => {
      const source = await seedOrthography();
      const result = await LinguisticService.applyOrthographyBridge({
        text: 'hello',
        sourceOrthographyId: source.id,
        targetOrthographyId: source.id,
      });
      expect(result.text).toBe('hello');
      expect(result.bridgeId).toBeUndefined();
    });
  });
});
