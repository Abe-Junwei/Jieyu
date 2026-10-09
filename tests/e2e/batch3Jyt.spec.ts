/**
 * 第 3 批第一个切片（JYT）浏览器端验收：T28/T29 导出与恢复为新项目、T33 覆盖当前项目、T32 旧格式。
 * Batch 3 slice 1 (JYT) browser acceptance: T28/T29 export + restore as new, T33 overwrite,
 * T32 old format.
 */
import { test, expect, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import {
  exportArchiveFromProjectHub,
  handleArchiveExportDialogs,
  importProjectPackageViaProjectHub,
  readMediaDiagnostics,
} from './_helpers/mediaByteDiagnostics';
import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

type Row = Record<string, unknown> & { id: string };

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
    // Blob 不能跨进程传，只留标记 | Blobs cannot cross the boundary
    return JSON.parse(
      JSON.stringify(rows, (_key, value: unknown) => (value instanceof Blob ? '[blob]' : value)),
    ) as Array<Record<string, unknown> & { id: string }>;
  }, table);
}

async function countOverwriteSnapshots(page: Page, projectId: string): Promise<number> {
  return page.evaluate(
    (id) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('jieyu_overwrite_snapshots');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const idb = open.result;
          if (!idb.objectStoreNames.contains('snapshots')) {
            idb.close();
            resolve(0);
            return;
          }
          const req = idb
            .transaction('snapshots', 'readonly')
            .objectStore('snapshots')
            .index('projectId')
            .count(IDBKeyRange.only(id));
          req.onsuccess = () => {
            idb.close();
            resolve(req.result);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    projectId,
  );
}

test.describe('Batch 3 JYT | 第三批 JYT', () => {
  test('T28/T29: export the current project as JYT, then restore it as a new project', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);

    const jyt = await exportArchiveFromProjectHub(page, 'JYT');
    const files = unzipSync(new Uint8Array(jyt));
    expect(strFromU8(files['mimetype']!)).toBe('application/vnd.jieyu.jyt');
    expect(Object.keys(files).sort()).toEqual([
      'META-INF/manifest.json',
      'data/project.json',
      'mimetype',
    ]);
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as {
      projects: Array<{ id: string }>;
      entities: Array<{ type: string; id: string; bytes: string; contentSize?: number }>;
    };
    expect(manifest.projects.map((p) => p.id)).toEqual([project.textId]);
    const mediaEntity = manifest.entities.find((e) => e.id === project.mediaId);
    expect(mediaEntity).toMatchObject({ type: 'media', bytes: 'omitted' });
    expect(mediaEntity?.contentSize ?? 0).toBeGreaterThan(44);

    const textsBefore = await readTable(page, 'texts');
    await importProjectPackageViaProjectHub(page, jyt, 'field.jyt', 'restore-as-new');
    await expect
      .poll(async () => (await readTable(page, 'texts')).length, { timeout: 15_000 })
      .toBe(textsBefore.length + 1);

    const texts = await readTable(page, 'texts');
    expect(texts).toHaveLength(textsBefore.length + 1);
    const restored = texts.find((t) => !textsBefore.some((b) => b.id === t.id))!;
    expect(restored.restoredFrom).toMatchObject({ projectId: project.textId, packageKind: 'jyt' });

    const restoredMedia = await readMediaDiagnostics(page, restored.id);
    expect(restoredMedia).toHaveLength(1);
    expect(restoredMedia[0]).toMatchObject({ hasBlob: false, timelineKind: 'acoustic' });
    expect(restoredMedia[0]!.id).not.toBe(project.mediaId);
    const units = await readTable(page, 'layer_units');
    const sourceUnits = units.filter((u) => u.textId === project.textId);
    const restoredUnits = units.filter((u) => u.textId === restored.id);
    expect(restoredUnits).toHaveLength(sourceUnits.length);
    expect(restoredUnits.every((u) => u.mediaId === restoredMedia[0]!.id)).toBe(true);

    // 原项目不变 | Source project untouched
    const sourceMedia = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(sourceMedia?.hasBlob).toBe(true);
  });

  test('T33(a): overwrite the never-collaborated current project after a double confirm and a snapshot', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);

    const contentsAtExport = (await readTable(page, 'layer_unit_contents')).filter(
      (c) => c.textId === project.textId,
    );
    expect(contentsAtExport.length).toBeGreaterThan(0);
    const jyt = await exportArchiveFromProjectHub(page, 'JYT');

    const edited = contentsAtExport[0]!;
    await page.evaluate(async (id) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            layer_unit_contents: {
              update: (k: string, c: Record<string, unknown>) => Promise<number>;
            };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      await dexie.layer_unit_contents.update(id, { text: 'edited after export' });
    }, edited.id);

    await importProjectPackageViaProjectHub(page, jyt, 'field.jyt', 'overwrite-current');

    const after = (await readTable(page, 'layer_unit_contents')).find((c) => c.id === edited.id);
    expect(after?.text).toBe(edited.text);
    const media = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(media).toMatchObject({ hasBlob: true, timelineKind: 'acoustic' });
    expect(await countOverwriteSnapshots(page, project.textId)).toBe(1);
    const texts = await readTable(page, 'texts');
    expect(texts.find((t) => t.id === project.textId)?.restoredFrom).toMatchObject({
      projectId: project.textId,
      packageKind: 'jyt',
    });
  });

  test('T33(b): a collaborated project offers no overwrite', async ({ page }) => {
    test.setTimeout(180_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const jyt = await exportArchiveFromProjectHub(page, 'JYT');

    await page.evaluate((id) => {
      localStorage.setItem(
        'jieyu:collab-local-projects:v1',
        JSON.stringify({
          [id]: { boundAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' },
        }),
      );
    }, project.textId);

    const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym,.jyb"]');
    await input.setInputFiles({
      name: 'field.jyt',
      mimeType: 'application/octet-stream',
      buffer: jyt,
    });
    const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId('project-import-restore-as-new')).toBeVisible();
    await expect(dialog.getByTestId('project-import-overwrite-current')).toHaveCount(0);
    await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect(dialog).toBeHidden();
  });

  test('T32: an old whole-database JYT is refused with a clear message and writes nothing', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const textsBefore = await readTable(page, 'texts');

    const legacy = zipSync({
      mimetype: [strToU8('application/x-jieyu-text'), { level: 0 }],
      'META-INF/manifest.json': strToU8(
        JSON.stringify({ formatVersion: 1, kind: 'jyt', schemaVersion: 3, dbName: 'jieyudb_v2' }),
      ),
      'data/snapshot.json': strToU8(JSON.stringify({ schemaVersion: 3, collections: {} })),
    });
    const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym,.jyb"]');
    await input.setInputFiles({
      name: 'old.jyt',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(legacy),
    });
    await expect(page.getByText(/jieyudb_v2/).first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('dialog', { name: /Project import preview|导入项目预览/i }),
    ).toHaveCount(0);
    expect(await readTable(page, 'texts')).toHaveLength(textsBefore.length);
  });
});
