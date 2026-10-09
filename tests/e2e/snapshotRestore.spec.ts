/**
 * 从快照恢复（用户决定 2026-10-09）浏览器端验收：覆盖当前项目后，从项目中心的“从快照恢复”列出快照、
 * 预览、二次确认恢复、读回核对；本机字节保留；会丢本机字节时拒绝。
 * Snapshot restore (user decision 2026-10-09) browser acceptance: after overwriting the current
 * project, the project hub lists the snapshot, previews it, restores after a double confirm and
 * verifies; local bytes are kept; a restore that would lose local bytes is refused.
 */
import { test, expect, type Page } from '@playwright/test';

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

async function readContents(page: Page, textId: string): Promise<Row[]> {
  return page.evaluate(async (id) => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          table: (n: string) => { toArray: () => Promise<Array<Record<string, unknown>>> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const rows = await dexie.table('layer_unit_contents').toArray();
    return rows.filter((row) => row.textId === id) as Array<
      Record<string, unknown> & { id: string }
    >;
  }, textId);
}

async function editContent(page: Page, id: string, text: string): Promise<void> {
  await page.evaluate(
    async ([contentId, value]) => {
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
      await dexie.layer_unit_contents.update(contentId!, { text: value });
    },
    [id, text] as const,
  );
}

/** 快照库里的 (seq, projectId, packageKind) | (seq, projectId, packageKind) in the snapshot store */
async function listSnapshotRows(
  page: Page,
): Promise<Array<{ seq: number; projectId: string; packageKind: string }>> {
  return page.evaluate(
    () =>
      new Promise<Array<{ seq: number; projectId: string; packageKind: string }>>(
        (resolve, reject) => {
          const open = indexedDB.open('jieyu_overwrite_snapshots');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const idb = open.result;
            if (!idb.objectStoreNames.contains('snapshots')) {
              idb.close();
              resolve([]);
              return;
            }
            const req = idb.transaction('snapshots', 'readonly').objectStore('snapshots').getAll();
            req.onsuccess = () => {
              idb.close();
              resolve(
                (req.result as Array<{ seq: number; projectId: string; packageKind: string }>).map(
                  ({ seq, projectId, packageKind }) => ({ seq, projectId, packageKind }),
                ),
              );
            };
            req.onerror = () => reject(req.error);
          };
        },
      ),
  );
}

async function openRecoveryDialog(page: Page) {
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /^(导入|Import)/ }).hover();
  await page.getByRole('menuitem', { name: /从快照恢复|Restore from a snapshot/ }).click();
  const dialog = page.getByRole('dialog', { name: /^(从快照恢复|Restore from a snapshot)$/ });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}

/** 导出 JYT → 改一条内容 → 用 JYT 覆盖当前项目；返回被改的内容行 | Export, edit, overwrite */
async function overwriteAfterEdit(page: Page, textId: string): Promise<Row> {
  const contents = await readContents(page, textId);
  expect(contents.length).toBeGreaterThan(0);
  const jyt = await exportArchiveFromProjectHub(page, 'JYT');
  const edited = contents[0]!;
  await editContent(page, edited.id, 'edited before overwrite');
  await importProjectPackageViaProjectHub(page, jyt, 'field.jyt', 'overwrite-current');
  await expect
    .poll(async () => (await readContents(page, textId)).find((c) => c.id === edited.id)?.text)
    .toBe(edited.text);
  return edited;
}

test.describe('Recovery snapshots | 从快照恢复', () => {
  test('restores the pre-overwrite snapshot after a preview and a double confirm; bytes kept', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const edited = await overwriteAfterEdit(page, project.textId);

    const [snapshot] = (await listSnapshotRows(page)).filter((s) => s.projectId === project.textId);
    expect(snapshot).toMatchObject({ packageKind: 'jyt' });
    const dialog = await openRecoveryDialog(page);
    const row = dialog.getByTestId(`snapshot-restore-row-${snapshot!.seq}`);
    await expect(row).toContainText(/JYT/);
    await expect(row).toContainText(/(KiB|B) · \d+/);

    await row.getByTestId(`snapshot-restore-preview-${snapshot!.seq}`).click();
    await expect(dialog.getByTestId('snapshot-restore-preview')).toContainText(
      'layer_unit_contents',
    );
    await dialog.getByTestId('snapshot-restore-restore').click();
    await expect(dialog.getByTestId('snapshot-restore-warning')).toBeVisible();
    // 第一次点击不写入 | The first click writes nothing
    expect((await readContents(page, project.textId)).find((c) => c.id === edited.id)?.text).toBe(
      edited.text,
    );
    await dialog.getByRole('button', { name: /确认恢复|Confirm restore/ }).click();
    await expect(dialog.getByTestId('snapshot-restore-done')).toBeVisible({ timeout: 30_000 });

    await dialog.getByTestId('snapshot-restore-reload').click();
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    expect((await readContents(page, project.textId)).find((c) => c.id === edited.id)?.text).toBe(
      'edited before overwrite',
    );
    const media = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(media).toMatchObject({ hasBlob: true, timelineKind: 'acoustic' });
    // 恢复前的状态另存了一份 | The state before the restore is kept as another snapshot
    const kinds = (await listSnapshotRows(page))
      .filter((s) => s.projectId === project.textId)
      .map((s) => s.packageKind)
      .sort();
    expect(kinds).toEqual(['jyt', 'snapshot-restore']);
  });

  test('refuses a restore that would lose local bytes and writes nothing', async ({ page }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const edited = await overwriteAfterEdit(page, project.textId);

    // 覆盖之后又录了一段（快照里没有）| A new recording after the overwrite (not in the snapshot)
    await page.evaluate(async (textId) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            media_items: { put: (row: Record<string, unknown>) => Promise<unknown> };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      const blob = new Blob([new Uint8Array(64)], { type: 'audio/wav' });
      await dexie.media_items.put({
        id: 'recovery-e2e-new-media',
        textId,
        filename: 'new.wav',
        duration: 1,
        details: { audioBlob: blob },
        isOfflineCached: true,
        timelineKind: 'acoustic',
        byteLocation: 'managed',
        availability: 'available',
        contentSize: blob.size,
        createdAt: new Date().toISOString(),
      });
    }, project.textId);

    const [snapshot] = (await listSnapshotRows(page)).filter((s) => s.projectId === project.textId);
    const dialog = await openRecoveryDialog(page);
    await dialog.getByTestId(`snapshot-restore-preview-${snapshot!.seq}`).click();
    await expect(dialog.getByTestId('snapshot-restore-blocked')).toBeVisible();
    await expect(dialog.getByTestId('snapshot-restore-restore')).toBeDisabled();
    await dialog
      .getByRole('button', { name: /^(Cancel|取消)$/ })
      .first()
      .click();
    await expect(dialog).toBeHidden();

    expect((await readContents(page, project.textId)).find((c) => c.id === edited.id)?.text).toBe(
      edited.text,
    );
    const media = await readMediaDiagnostics(page, project.textId);
    expect(media.find((r) => r.id === 'recovery-e2e-new-media')?.hasBlob).toBe(true);
    expect(
      (await listSnapshotRows(page)).filter((s) => s.projectId === project.textId),
    ).toHaveLength(1);
  });
});
