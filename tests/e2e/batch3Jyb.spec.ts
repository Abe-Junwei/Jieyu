/**
 * 第 3 批第三个切片（JYB 整库备份）浏览器端验收：T53 整库备份不含凭据 / AI 表、T30 含音频与
 * 不含音频两种导出并逐项目导入为新项目、T34 整库还原要点两次且还原后数据回到备份时的样子、
 * 协作过的项目不能整库还原。
 * Batch 3 slice 3 (JYB whole-library backup) browser acceptance: T53 no credential / AI tables,
 * T30 export with and without audio and per-project import as new projects, T34 disaster restore
 * needs two clicks and brings data back to the backup, collaborated projects block disaster restore.
 */
import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';

import { handleArchiveExportDialogs } from './_helpers/mediaByteDiagnostics';
import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

type Row = Record<string, unknown> & { id: string };

type JybManifest = {
  package: string;
  kind: string;
  media: string;
  projects: Array<{ id: string }>;
  entities: Array<{
    type: string;
    id: string;
    bytes: string;
    fileRef?: string;
    contentSha256?: string;
  }>;
  excluded?: Array<{ reason: string; type?: string; count?: number }>;
};

async function openProject(page: Page, textId: string, mediaId: string): Promise<void> {
  await page.goto(`/transcription?textId=${textId}&mediaId=${mediaId}`);
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
  await waitForDexie(page);
}

async function readTable(page: Page, table: string): Promise<Row[]> {
  return page.evaluate(async (name) => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          table: (n: string) => { toArray: () => Promise<Array<Record<string, unknown>>> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const rows = await dexie.table(name).toArray();
    return JSON.parse(
      JSON.stringify(rows, (_key, value: unknown) => (value instanceof Blob ? '[blob]' : value)),
    ) as Array<Record<string, unknown> & { id: string }>;
  }, table);
}

async function exportJybFromProjectHub(page: Page, withMedia: boolean): Promise<Buffer> {
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /导出|Export/ }).hover();
  const entry = page.locator('.context-menu-submenu-export').getByRole('menuitem', {
    name: withMedia ? /JYB.*(（含音频|with audio)/i : /JYB.*(不含音频|without audio)/i,
  });
  await expect(entry).toBeVisible({ timeout: 15_000 });
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await entry.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^jieyu-library-\d{4}-\d{2}-\d{2}\.jyb$/);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('JYB download stream missing');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function openJybImportDialog(page: Page, jyb: Buffer) {
  const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym,.jyb"]');
  await input.setInputFiles({
    name: 'library.jyb',
    mimeType: 'application/octet-stream',
    buffer: jyb,
  });
  const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId('jyb-import-options')).toBeVisible();
  return dialog;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

test.describe('Batch 3 JYB | 第三批 JYB 整库备份', () => {
  test('T53/T30: JYB with audio carries the bytes, no secrets, and imports per project as new', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);

    const jyb = await exportJybFromProjectHub(page, true);
    const files = unzipSync(new Uint8Array(jyb));
    expect(strFromU8(files['mimetype']!)).toBe('application/vnd.jieyu.jyb');
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as JybManifest;
    expect(manifest).toMatchObject({ package: 'jyb', media: 'included' });
    expect(manifest.projects.map((p) => p.id)).toContain(project.textId);
    const entity = manifest.entities.find((e) => e.id === project.mediaId);
    expect(entity).toMatchObject({ type: 'media', bytes: 'included' });
    expect(sha256(files[entity!.fileRef!]!)).toBe(entity!.contentSha256);

    // T53：数据里没有凭据 / AI / 审计表 | T53: no credential / AI / audit tables in the data
    const data = JSON.parse(strFromU8(files['data/library.json']!)) as {
      projects: Array<{ id: string; collections: Record<string, unknown[]> }>;
    };
    const tables = new Set(data.projects.flatMap((p) => Object.keys(p.collections)));
    for (const forbidden of [
      'ai_conversations',
      'ai_messages',
      'ai_session_memories',
      'project_ai_memories',
      'ai_tasks',
      'ai_task_snapshots',
      'agent_artifacts',
      'ai_source_sets',
      'audit_logs',
      'mcp_tool_call_audits',
      'external_mcp_trust',
    ]) {
      expect(tables.has(forbidden)).toBe(false);
    }
    expect(tables.has('texts')).toBe(true);
    expect(tables.has('layer_units')).toBe(true);

    const textsBefore = await readTable(page, 'texts');
    const dialog = await openJybImportDialog(page, jyb);
    await expect(dialog.getByTestId('jyb-media-chip')).toBeVisible();
    await expect(dialog.getByTestId('jyb-mode-projects')).toBeChecked();
    const box = dialog.getByTestId(`jyb-project-${project.textId}`);
    await expect(box).toBeChecked();
    await dialog
      .getByRole('button', { name: /^(Import selected projects|导入所选项目)$/i })
      .click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    await expect
      .poll(async () => (await readTable(page, 'texts')).length, { timeout: 15_000 })
      .toBe(textsBefore.length + manifest.projects.length);
    const restored = (await readTable(page, 'texts')).filter(
      (t) => !textsBefore.some((b) => b.id === t.id),
    );
    const fromSource = restored.find(
      (t) => (t.restoredFrom as { projectId?: string } | undefined)?.projectId === project.textId,
    );
    expect(fromSource?.restoredFrom).toMatchObject({ packageKind: 'jyb' });
    // 原项目不变 | Source project still there
    expect((await readTable(page, 'texts')).some((t) => t.id === project.textId)).toBe(true);
  });

  test('T30: JYB without audio states it and keeps the recording out of the package', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);

    const jyb = await exportJybFromProjectHub(page, false);
    const files = unzipSync(new Uint8Array(jyb));
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as JybManifest;
    expect(manifest).toMatchObject({ package: 'jyb', media: 'excluded' });
    const entity = manifest.entities.find((e) => e.id === project.mediaId);
    expect(entity?.bytes).not.toBe('included');
    expect(Object.keys(files).filter((name) => name.startsWith('media/'))).toHaveLength(0);

    const dialog = await openJybImportDialog(page, jyb);
    await expect(dialog.getByTestId('jyb-media-chip')).toContainText(/不含音频|without audio/i);
    await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect(dialog).toBeHidden();
  });

  test('T34: disaster restore needs two clicks and brings the library back to the backup', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const jyb = await exportJybFromProjectHub(page, true);
    const unitsAtBackup = (await readTable(page, 'layer_units')).map((r) => r.id).sort();

    // 备份之后又多了一条记录 | One more row added after the backup
    await page.evaluate(async (ids) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            layer_units: { put: (row: Record<string, unknown>) => Promise<string> };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      const now = new Date().toISOString();
      await dexie.layer_units.put({
        id: 'utt_e2e_after_backup',
        textId: ids.textId,
        mediaId: ids.mediaId,
        startTime: 3,
        endTime: 4,
        createdAt: now,
        updatedAt: now,
      });
    }, project);
    expect(
      (await readTable(page, 'layer_units')).some((r) => r.id === 'utt_e2e_after_backup'),
    ).toBe(true);

    const dialog = await openJybImportDialog(page, jyb);
    const disaster = dialog.getByTestId('jyb-mode-disaster');
    await expect(disaster).toBeEnabled();
    await disaster.check();
    await expect(dialog.getByTestId('jyb-disaster-warning')).toBeVisible();
    await dialog.getByRole('button', { name: /^(Restore whole library|整库还原)$/i }).click();
    // 第一次点击只换成确认按钮，不写库 | First click only arms the confirm button
    expect(
      (await readTable(page, 'layer_units')).some((r) => r.id === 'utt_e2e_after_backup'),
    ).toBe(true);
    await dialog
      .getByRole('button', { name: /^(Confirm whole-library restore|确认整库还原)$/i })
      .click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    await expect
      .poll(async () => (await readTable(page, 'layer_units')).map((r) => r.id).sort(), {
        timeout: 15_000,
      })
      .toEqual(unitsAtBackup);
    // 原 id 保留 | Original ids kept
    expect((await readTable(page, 'texts')).some((t) => t.id === project.textId)).toBe(true);
  });

  test('T34: a collaborated project blocks disaster restore; per-project import stays available', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const jyb = await exportJybFromProjectHub(page, false);

    await page.evaluate((id) => {
      localStorage.setItem(
        'jieyu:collab-local-projects:v1',
        JSON.stringify({
          [id]: { boundAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' },
        }),
      );
    }, project.textId);

    const dialog = await openJybImportDialog(page, jyb);
    await expect(dialog.getByTestId('jyb-mode-disaster')).toBeDisabled();
    await expect(dialog.getByTestId('jyb-disaster-blocked')).toBeVisible();
    await expect(dialog.getByTestId('jyb-mode-projects')).toBeChecked();
    await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect(dialog).toBeHidden();
  });
});
