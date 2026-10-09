/**
 * 第 5 批（D4、T46）：一个项目多份标注文稿——新建、切换、导入到当前文稿、删除，以及 JYT 往返。
 * Batch 5 (D4, T46): several annotation documents per project — create, switch, import into the
 * current document, delete, and a JYT round trip.
 * 新建 / 删除走应用内对话框；删除前存一份快照，可从「从快照恢复」找回。
 * Create / delete use in-app dialogs; a delete saves a snapshot first that "Restore from a snapshot"
 * brings back.
 */
import { test, expect, type Page } from '@playwright/test';

import {
  exportArchiveFromProjectHub,
  importProjectPackageViaProjectHub,
} from './_helpers/mediaByteDiagnostics';
import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

type DocShape = {
  current: string | null;
  docs: Array<{ id: string; title: string | null; isDefault: boolean; units: number }>;
};

/** 每份文稿的单元数（按层归属；没写 documentId 的层归当前文稿）| Units per document */
async function readDocs(page: Page, textId: string): Promise<DocShape> {
  return page.evaluate(async (id) => {
    type Where = { equals: (v: string) => { toArray: () => Promise<unknown[]> } };
    type Table = { where: (k: string) => Where; get: (k: string) => Promise<unknown> };
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          texts: Table;
          annotation_documents: Table;
          tier_definitions: Table;
          layer_units: Table;
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const text = (await dexie.texts.get(id)) as { defaultDocumentId?: string } | undefined;
    const current = text?.defaultDocumentId ?? null;
    const docs = (await dexie.annotation_documents.where('textId').equals(id).toArray()) as Array<{
      id: string;
      title?: Record<string, string>;
      isDefault: boolean;
      createdAt: string;
    }>;
    const tiers = (await dexie.tier_definitions.where('textId').equals(id).toArray()) as Array<{
      id: string;
      documentId?: string;
    }>;
    const units = (await dexie.layer_units.where('textId').equals(id).toArray()) as Array<{
      layerId?: string;
      unitType?: string;
    }>;
    const owner = new Map(tiers.map((t) => [t.id, t.documentId ?? current]));
    return {
      current,
      docs: docs
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((doc) => ({
          id: doc.id,
          title: doc.title?.['und'] ?? null,
          isDefault: doc.isDefault,
          units: units.filter((u) => u.layerId !== undefined && owner.get(u.layerId) === doc.id)
            .length,
        })),
    };
  }, textId);
}

async function listTextIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          texts: { toCollection: () => { primaryKeys: () => Promise<string[]> } };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    return dexie.texts.toCollection().primaryKeys();
  });
}

/** 快照库里本项目的快照种类（新的在后）| Snapshot kinds of a project, oldest first */
async function listSnapshotKinds(
  page: Page,
  projectId: string,
): Promise<Array<{ seq: number; packageKind: string }>> {
  return page.evaluate(
    (id) =>
      new Promise<Array<{ seq: number; packageKind: string }>>((resolve, reject) => {
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
              (req.result as Array<{ seq: number; projectId: string; packageKind: string }>)
                .filter((row) => row.projectId === id)
                .sort((a, b) => a.seq - b.seq)
                .map(({ seq, packageKind }) => ({ seq, packageKind })),
            );
          };
          req.onerror = () => reject(req.error);
        };
      }),
    projectId,
  );
}

/** 菜单「删除当前文稿」→ 应用内确认对话框 → 删除 | Menu delete → in-app confirm dialog → delete */
async function deleteCurrentDocument(page: Page): Promise<void> {
  await openDocumentsMenu(page);
  await expect(page.getByTestId('annotation-document-delete')).toBeEnabled();
  await page.getByTestId('annotation-document-delete').click();
  const dialog = page.getByRole('dialog', { name: /^(删除文稿|Delete document)$/ });
  await expect(dialog).toContainText(/从快照恢复|Restore from a snapshot/);
  await dialog.getByTestId('annotation-document-dialog-confirm').click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function openDocumentsMenu(page: Page): Promise<void> {
  await page.locator('.left-rail-project-hub-btn').click();
  await page.getByRole('menuitem', { name: /标注文稿|Annotation documents/ }).hover();
  await expect(page.getByTestId('annotation-document-create')).toBeVisible({ timeout: 15_000 });
}

function eaf(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="2026-10-09T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="e2e-field-sample.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./e2e-field-sample.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="60" />
  </TIME_ORDER>
  <TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>${value}</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;
}

test.describe('Batch 5: multiple annotation documents | 第五批：多份标注文稿', () => {
  test('T46: create, import into, switch, round-trip and delete documents', async ({ page }) => {
    test.setTimeout(300_000);
    // 文稿操作不再弹浏览器对话框；导出流程的密码提示照旧跳过 | Document actions raise no browser dialogs
    const documentBrowserDialogs: string[] = [];
    page.on('dialog', (dialog) => {
      if (/password|密码/i.test(dialog.message())) void dialog.dismiss();
      else {
        if (/文稿|document/i.test(dialog.message())) documentBrowserDialogs.push(dialog.message());
        void dialog.accept();
      }
    });
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await waitForDexie(page);

    const initial = await readDocs(page, project.textId);
    expect(initial.docs).toHaveLength(1);
    const firstId = initial.docs[0]!.id;
    const firstUnits = initial.docs[0]!.units;
    expect(firstUnits).toBeGreaterThan(0);

    // 新建：成为当前文稿，原文稿的语段不动 | Create: becomes current; the first keeps its units
    await openDocumentsMenu(page);
    await page.getByTestId('annotation-document-create').click();
    const createDialog = page.getByRole('dialog', { name: /^(新建文稿|New document)$/ });
    await createDialog.getByTestId('annotation-document-dialog-name').fill('Second');
    await createDialog.getByTestId('annotation-document-dialog-confirm').click();
    await expect.poll(async () => (await readDocs(page, project.textId)).docs.length).toBe(2);
    const created = await readDocs(page, project.textId);
    const secondId = created.docs[1]!.id;
    expect(created.current).toBe(secondId);
    expect(created.docs[1]).toMatchObject({ title: 'Second', isDefault: true, units: 0 });
    expect(created.docs[0]).toMatchObject({ id: firstId, isDefault: false, units: firstUnits });
    // 工作台换成新文稿：原文稿的转写层不再显示 | Workspace now shows the new, empty document
    const transcriptionLayers = page.locator('.transcription-side-pane-item-transcription');
    await expect(transcriptionLayers).toHaveCount(0, { timeout: 15_000 });

    // 导入标注写进当前（新）文稿，不替换第一份 | Import lands in the current (new) document only
    const input = page.locator(
      'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
    );
    await input.setInputFiles({
      name: 'Second.eaf',
      mimeType: 'application/xml',
      buffer: Buffer.from(eaf('second document')),
    });
    await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();
    await expect
      .poll(async () => (await readDocs(page, project.textId)).docs[1]?.units ?? 0, {
        timeout: 60_000,
      })
      .toBeGreaterThan(0);
    const afterImport = await readDocs(page, project.textId);
    const secondUnits = afterImport.docs[1]!.units;
    expect(afterImport.docs[0]!.units).toBe(firstUnits);

    // 切回第一份 | Switch back to the first document
    await openDocumentsMenu(page);
    await page.getByTestId('annotation-document-1').click();
    await expect.poll(async () => (await readDocs(page, project.textId)).current).toBe(firstId);
    await expect(transcriptionLayers).toHaveCount(1, { timeout: 15_000 });

    // JYT 往返：新项目里两份文稿、语段、当前文稿都在 | JYT round trip keeps both documents
    const jyt = await exportArchiveFromProjectHub(page, 'JYT');
    const textIdsBefore = await listTextIds(page);
    await importProjectPackageViaProjectHub(page, jyt, 'two-documents.jyt', 'restore-as-new');
    await expect
      .poll(async () => (await listTextIds(page)).length, { timeout: 15_000 })
      .toBe(textIdsBefore.length + 1);
    const restoredId = (await listTextIds(page)).find((id) => !textIdsBefore.includes(id))!;
    const restored = await readDocs(page, restoredId);
    expect(
      restored.docs.map((d) => ({ title: d.title, isDefault: d.isDefault, units: d.units })),
    ).toEqual([
      { title: null, isDefault: true, units: firstUnits },
      { title: 'Second', isDefault: false, units: secondUnits },
    ]);
    expect(restored.docs.map((d) => d.id)).not.toContain(firstId);
    expect(restored.current).toBe(restored.docs[0]!.id);

    // 回到原项目，删除当前（第一份）文稿 | Back in the source project, delete the current document
    await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    await deleteCurrentDocument(page);
    await expect.poll(async () => (await readDocs(page, project.textId)).docs.length).toBe(1);
    const afterDelete = await readDocs(page, project.textId);
    expect(afterDelete.current).toBe(secondId);
    expect(afterDelete.docs[0]).toMatchObject({ id: secondId, units: secondUnits });
    expect((await listSnapshotKinds(page, project.textId)).map((s) => s.packageKind)).toEqual([
      'document-delete',
    ]);
    expect(documentBrowserDialogs).toEqual([]);
  });

  test('T46: two EAF files imported "as a new document" coexist; deleting one keeps the other', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // 导入流程自己的浏览器确认照旧接受 | The import flow's own browser confirms are accepted as before
    page.on('dialog', (dialog) => void dialog.accept());
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await waitForDexie(page);
    const seeded = await readDocs(page, project.textId);
    const seededUnits = seeded.docs[0]!.units;

    const input = page.locator(
      'input.left-rail-project-hub-file-input[accept=".eaf,.textgrid,.TextGrid,.trs,.flextext,.txt,.toolbox"]',
    );
    for (const [index, name] of ['A.eaf', 'B.eaf'].entries()) {
      await input.setInputFiles({
        name,
        mimeType: 'application/xml',
        buffer: Buffer.from(eaf(`document ${name}`)),
      });
      await page.getByTestId('annotation-import-as-new-document').check();
      // 作为新文稿时不显示替换预览 | No replace preview for a new document
      await expect(page.getByTestId('annotation-import-replace-preview')).toBeHidden();
      await page.getByRole('button', { name: /开始导入标注|Start annotation import/i }).click();
      await expect
        .poll(async () => (await readDocs(page, project.textId)).docs[index + 1]?.units ?? 0, {
          timeout: 60_000,
        })
        .toBeGreaterThan(0);
    }
    const three = await readDocs(page, project.textId);
    expect(three.docs).toHaveLength(3);
    expect(three.docs[0]!.units).toBe(seededUnits);
    expect(three.current).toBe(three.docs[2]!.id);
    const [, docA, docB] = three.docs;

    // 切到 A 再删除：B 与原文稿都不受影响 | Switch to A and delete it; B and the seeded one stay
    await openDocumentsMenu(page);
    await page.getByTestId('annotation-document-2').click();
    await expect.poll(async () => (await readDocs(page, project.textId)).current).toBe(docA!.id);
    await deleteCurrentDocument(page);
    await expect.poll(async () => (await readDocs(page, project.textId)).docs.length).toBe(2);
    const after = await readDocs(page, project.textId);
    expect(after.docs.map((d) => ({ id: d.id, units: d.units }))).toEqual([
      { id: three.docs[0]!.id, units: seededUnits },
      { id: docB!.id, units: docB!.units },
    ]);

    // 删除前的快照可在「从快照恢复」里找回 A | The pre-delete snapshot brings A back
    const [snapshot] = await listSnapshotKinds(page, project.textId);
    expect(snapshot).toMatchObject({ packageKind: 'document-delete' });
    await page.locator('.left-rail-project-hub-btn').click();
    await page.getByRole('menuitem', { name: /^(导入|Import)/ }).hover();
    await page.getByRole('menuitem', { name: /从快照恢复|Restore from a snapshot/ }).click();
    const recovery = page.getByRole('dialog', { name: /^(从快照恢复|Restore from a snapshot)$/ });
    const row = recovery.getByTestId(`snapshot-restore-row-${snapshot!.seq}`);
    await expect(row).toContainText(/删除标注文稿前|Before deleting an annotation document/, {
      timeout: 15_000,
    });
    await row.getByTestId(`snapshot-restore-preview-${snapshot!.seq}`).click();
    await recovery.getByTestId('snapshot-restore-restore').click();
    await recovery.getByRole('button', { name: /确认恢复|Confirm restore/ }).click();
    await expect(recovery.getByTestId('snapshot-restore-done')).toBeVisible({ timeout: 30_000 });
    await recovery.getByTestId('snapshot-restore-reload').click();
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    const restored = await readDocs(page, project.textId);
    expect(restored.current).toBe(docA!.id);
    expect(restored.docs.map((d) => ({ id: d.id, units: d.units }))).toEqual(
      three.docs.map((d) => ({ id: d.id, units: d.units })),
    );
  });
});
