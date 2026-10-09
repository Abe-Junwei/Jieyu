// @vitest-environment jsdom
/**
 * 用户决定（2026-10-09）：JYB 带项目 AI 记忆与历史、带用户偏好（7.5）。
 * User decisions (2026-10-09): a JYB carries project AI memory / history and user preferences (7.5).
 */
import 'fake-indexeddb/auto';
import { strFromU8, unzipSync } from 'fflate';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { listProjectOverwriteSnapshots } from '../db/projectOverwriteSnapshotStore';
import {
  LIBRARY_SNAPSHOT_KEY,
  disasterRestoreFromJyb,
  exportDatabaseToJyb,
  importJybProjectsAsNew,
  previewJybRestore,
} from './JybService';
import { exportProjectToJym, restoreJymAsNewProject } from './JymService';
import { applyUserPreferences, readPackagedUserPreferences } from './userPreferencesBackup';

vi.mock('../collaboration/cloud/projectCollaborationHistory', () => ({
  isProjectNeverCollaborated: () => true,
  listCollaboratedIds: () => [],
}));

const NOW = '2026-10-09T01:00:00.000Z';

async function seed(p: string): Promise<void> {
  await db.texts.put({ id: p, title: { default: `Project ${p}` }, createdAt: NOW, updatedAt: NOW });
  await db.layer_units.put({
    id: `${p}-unit`,
    textId: p,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.ai_conversations.put({
    id: `${p}-conv`,
    textId: p,
    title: 'chat',
    mode: 'assistant',
    providerId: 'mock',
    model: 'm',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.ai_messages.put({
    id: `${p}-msg`,
    conversationId: `${p}-conv`,
    role: 'user',
    content: `hello from ${p}`,
    status: 'done',
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
  await db.project_ai_memories.put({
    id: `${p}-mem`,
    projectId: p,
    fact: `fact ${p}`,
    confidence: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.ai_tasks.put({
    id: `${p}-task`,
    taskType: 'gloss',
    status: 'done',
    targetId: `${p}-unit`,
    createdAt: NOW,
    updatedAt: NOW,
  } as never);
}

function libraryOf(archive: Uint8Array) {
  return JSON.parse(strFromU8(unzipSync(archive)['data/library.json']!)) as {
    projects: Array<{ id: string; collections: Record<string, Array<Record<string, unknown>>> }>;
    settings?: { entries: Array<{ key: string; value: string }> };
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
  localStorage.clear();
});

describe('JYB carries project AI per project', () => {
  it('splits AI rows by project and imports them remapped by default', async () => {
    await seed('pA');
    await seed('pB');
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    const library = libraryOf(archive);
    const pA = library.projects.find((p) => p.id === 'pA')!;
    expect(pA.collections.ai_conversations?.map((r) => r.id)).toEqual(['pA-conv']);
    expect(pA.collections.ai_messages?.map((r) => r.id)).toEqual(['pA-msg']);
    expect(pA.collections.project_ai_memories?.map((r) => r.id)).toEqual(['pA-mem']);
    expect(pA.collections.ai_tasks?.map((r) => r.id)).toEqual(['pA-task']);

    const preview = await previewJybRestore(archive);
    expect(preview.projects.find((p) => p.id === 'pA')?.aiRows).toBe(4);

    const result = await importJybProjectsAsNew(archive, { projectIds: ['pA'] });
    const newId = result.projects[0]!.projectId;
    const conv = (await db.ai_conversations.where('textId').equals(newId).toArray())[0]!;
    expect(conv.id).not.toBe('pA-conv');
    const msgs = await db.ai_messages.where('conversationId').equals(conv.id).toArray();
    expect(msgs.map((m) => m.content)).toEqual(['hello from pA']);
    expect(await db.project_ai_memories.where('projectId').equals(newId).count()).toBe(1);
    const unit = (await db.layer_units.where('textId').equals(newId).toArray())[0]!;
    expect((await db.ai_tasks.toArray()).some((t) => t.targetId === unit.id)).toBe(true);
  });

  it('per-project import can leave AI out', async () => {
    await seed('pA');
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    await Promise.all(db.tables.map((table) => table.clear()));
    await importJybProjectsAsNew(archive, { includeProjectAi: false });
    expect(await db.texts.count()).toBe(1);
    expect(await db.ai_conversations.count()).toBe(0);
    expect(await db.project_ai_memories.count()).toBe(0);
  });

  it('JYM keeps dropping project AI (JY-04 unchanged for single-project packages)', async () => {
    await seed('pA');
    const restored = await restoreJymAsNewProject(await exportProjectToJym('pA'));
    expect(await db.ai_conversations.where('textId').equals(restored.projectId).count()).toBe(0);
    expect(await db.project_ai_memories.where('projectId').equals(restored.projectId).count()).toBe(
      0,
    );
  });

  it('defaults to including audio (user decision)', async () => {
    await seed('pA');
    const manifest = JSON.parse(
      strFromU8(unzipSync(await exportDatabaseToJyb())['META-INF/manifest.json']!),
    );
    expect(manifest.media).toBe('included');
  });
});

describe('JYB user preferences (settings entry)', () => {
  beforeEach(async () => {
    await seed('pA');
    localStorage.setItem('jieyu.locale', 'zh-CN');
    localStorage.setItem('jieyu-theme', 'dark');
    localStorage.setItem(
      'jieyu.aiChat.settings',
      JSON.stringify({
        providerKind: 'openai-compatible',
        model: 'gpt',
        apiKey: 'sk-LEAK',
        temperature: 0.2,
      }),
    );
    localStorage.setItem('jieyu.acoustic.external.apiKey', 'sk-NEVER');
    localStorage.setItem('jieyu.voiceAgent.commercialStt', JSON.stringify({ apiKey: 'sk-STT' }));
    localStorage.setItem('jieyu:collab-client-id:v1', 'client-1');
  });

  it('packs only allow-listed keys, scrubs secrets, previews them', async () => {
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    const text = strFromU8(unzipSync(archive)['data/library.json']!);
    for (const secret of ['sk-LEAK', 'sk-NEVER', 'sk-STT', 'client-1']) {
      expect(text).not.toContain(secret);
    }
    const keys = libraryOf(archive).settings!.entries.map((e) => e.key);
    expect(keys).toEqual(['jieyu.locale', 'jieyu-theme', 'jieyu.aiChat.settings']);
    const preview = await previewJybRestore(archive);
    expect(preview.preferences.keys).toEqual(keys);
  });

  it('per-project import never writes preferences; disaster restore only when asked', async () => {
    const archive = await exportDatabaseToJyb({ includeMedia: false });
    localStorage.setItem('jieyu.locale', 'en-US');
    localStorage.removeItem('jieyu-theme');
    // 本机 vault 里放密钥；明文键清掉（R2-5）| Local vault holds the secret; plain key cleared
    const { persistAiChatSettings, loadAiChatSettingsFromStorage } =
      await import('../ai/config/aiChatSettingsStorage');
    const { normalizeAiChatSettings } = await import('../ai/providers/providerCatalog');
    await persistAiChatSettings(
      normalizeAiChatSettings({ providerKind: 'mock', apiKey: 'sk-LOCAL', model: 'local-m' }),
    );

    await importJybProjectsAsNew(archive);
    expect(localStorage.getItem('jieyu.locale')).toBe('en-US');

    const plain = await disasterRestoreFromJyb(archive);
    expect(plain.restoredPreferenceKeys).toEqual([]);
    expect(localStorage.getItem('jieyu.locale')).toBe('en-US');

    const withPrefs = await disasterRestoreFromJyb(archive, { restorePreferences: true });
    expect(withPrefs.restoredPreferenceKeys).toHaveLength(3);
    expect(localStorage.getItem('jieyu.locale')).toBe('zh-CN');
    expect(localStorage.getItem('jieyu-theme')).toBe('dark');
    const restored = await loadAiChatSettingsFromStorage();
    expect(restored).toMatchObject({
      providerKind: 'openai-compatible',
      model: 'gpt',
      apiKey: 'sk-LOCAL',
    });
    // 旧值记在整库快照里 | Old values kept in the whole-library snapshot
    const [snapshot] = await listProjectOverwriteSnapshots(LIBRARY_SNAPSHOT_KEY);
    expect(JSON.parse(snapshot!.snapshotJson).preferences).toEqual(
      expect.arrayContaining([
        { key: 'jieyu.locale', value: 'en-US' },
        { key: 'jieyu-theme', value: null },
      ]),
    );
  });
});

describe('REV5-N2: AI chat settings pack provider/model without keys or URLs', () => {
  beforeEach(() => localStorage.clear());

  it('collects provider and model from the vault when the plain key was removed', async () => {
    const { persistAiChatSettings } = await import('../ai/config/aiChatSettingsStorage');
    const { normalizeAiChatSettings } = await import('../ai/providers/providerCatalog');
    const settings = normalizeAiChatSettings({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-SECRET',
      endpointUrl: 'https://evil.example/hook',
    });
    settings.apiKeysByProvider = {
      ...settings.apiKeysByProvider,
      [settings.providerKind]: 'sk-SECRET',
    };
    await persistAiChatSettings(settings);
    // 加密可用时明文键应已删除 | Plain key is gone when encryption is available
    expect(localStorage.getItem('jieyu.aiChat.settings')).toBeNull();

    const { collectUserPreferences } = await import('./userPreferencesBackup');
    const packed = await collectUserPreferences();
    const entry = packed.entries.find((item) => item.key === 'jieyu.aiChat.settings');
    expect(entry).toBeDefined();
    const value = JSON.parse(entry!.value) as Record<string, unknown>;
    expect(value).toMatchObject({ providerKind: settings.providerKind, model: 'gpt-4o-mini' });
    expect(value).not.toHaveProperty('apiKey');
    expect(value).not.toHaveProperty('baseUrl');
    expect(value).not.toHaveProperty('endpointUrl');
    expect(JSON.stringify(value)).not.toContain('sk-SECRET');
    expect(JSON.stringify(value)).not.toContain('evil.example');
  });
});

describe('REV5-N1: a packaged service address never receives local secrets', () => {
  beforeEach(() => localStorage.clear());

  it('never carries or applies the URL-bearing keys', async () => {
    for (const key of [
      'jieyu.embeddingProvider',
      'jieyu.voiceAgent.localWhisper',
      'jieyu.voiceAgent.sttEnhancement',
    ]) {
      localStorage.setItem(key, JSON.stringify({ baseUrl: 'https://trusted.example' }));
      const read = readPackagedUserPreferences({
        entries: [{ key, value: JSON.stringify({ baseUrl: 'https://attacker.example' }) }],
      });
      expect(read.entries).toEqual([]);
      expect(read.ignoredKeys).toEqual([key]);
      expect(
        await applyUserPreferences([{ key, value: '{"baseUrl":"https://attacker.example"}' }]),
      ).toEqual([]);
      expect(localStorage.getItem(key)).toContain('trusted.example');
    }
  });

  it('merges allow-listed AI fields into the vault and keeps local secrets and URLs (R2-5/7)', async () => {
    const { persistAiChatSettings, loadAiChatSettingsFromStorage } =
      await import('../ai/config/aiChatSettingsStorage');
    const { normalizeAiChatSettings } = await import('../ai/providers/providerCatalog');
    await persistAiChatSettings(
      normalizeAiChatSettings({
        baseUrl: 'https://api.trusted.example',
        apiKey: 'sk-LOCAL-SECRET',
        model: 'm1',
      }),
    );
    // 包里的地址字段被白名单丢掉，合进去的只有 model | Packaged URLs are dropped; only model merges in
    await applyUserPreferences([
      {
        key: 'jieyu.aiChat.settings',
        value: JSON.stringify({
          baseUrl: 'https://attacker.example',
          model: 'm2',
          apiKey: 'sk-ATTACKER',
        }),
      },
    ]);
    const loaded = await loadAiChatSettingsFromStorage();
    expect(loaded.model).toBe('m2');
    expect(loaded.apiKey).toBe('sk-LOCAL-SECRET');
    expect(loaded.baseUrl).toBe('https://api.trusted.example');
  });

  it('does not pack AI settings that equal the never-configured defaults (R2-6)', async () => {
    const { collectUserPreferences } = await import('./userPreferencesBackup');
    localStorage.setItem('jieyu.locale', 'zh-CN');
    const packed = await collectUserPreferences();
    expect(packed.entries.map((e) => e.key)).toEqual(['jieyu.locale']);
  });
});
