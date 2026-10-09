/**
 * 第 3 批第二个切片（JYM）浏览器端验收：T28/T37 JYM 带真实录音字节导出并恢复为新项目、
 * 同字节覆盖当前项目、本机字节不同则不能覆盖、T32 旧整库 JYM 被拒绝。
 * Batch 3 slice 2 (JYM) browser acceptance: T28/T37 JYM with real recording bytes exported and
 * restored as a new project, overwrite with identical bytes, overwrite blocked when local bytes
 * differ, T32 old whole-database JYM refused.
 */
import { createHash } from 'node:crypto';
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
    return JSON.parse(
      JSON.stringify(rows, (_key, value: unknown) => (value instanceof Blob ? '[blob]' : value)),
    ) as Array<Record<string, unknown> & { id: string }>;
  }, table);
}

/** 读本机录音字节的 sha256 | sha256 of the local recording bytes */
async function readLocalMediaSha(page: Page, mediaId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          media_items: { get: (k: string) => Promise<{ details?: { audioBlob?: unknown } }> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const blob = (await dexie.media_items.get(id))?.details?.audioBlob;
    if (!(blob instanceof Blob)) return null;
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }, mediaId);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

test.describe('Batch 3 JYM | 第三批 JYM', () => {
  test('T28/T37: a JYM carries the real recording bytes and restores them into a new project', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const localSha = await readLocalMediaSha(page, project.mediaId);
    expect(localSha).toMatch(/^[0-9a-f]{64}$/);

    const jym = await exportArchiveFromProjectHub(page, 'JYM');
    const files = unzipSync(new Uint8Array(jym));
    expect(strFromU8(files['mimetype']!)).toBe('application/vnd.jieyu.jym');
    const manifest = JSON.parse(strFromU8(files['META-INF/manifest.json']!)) as {
      package: string;
      media: string;
      projects: Array<{ id: string }>;
      entities: Array<{
        type: string;
        id: string;
        bytes: string;
        fileRef?: string;
        contentSha256?: string;
        contentSize?: number;
      }>;
    };
    expect(manifest).toMatchObject({ package: 'jym', media: 'included' });
    expect(manifest.projects.map((p) => p.id)).toEqual([project.textId]);
    const entity = manifest.entities.find((e) => e.id === project.mediaId);
    expect(entity).toMatchObject({ type: 'media', bytes: 'included', contentSha256: localSha });
    const byteFile = files[entity!.fileRef!];
    expect(byteFile).toBeDefined();
    expect(sha256(byteFile!)).toBe(localSha);
    expect(byteFile!.byteLength).toBe(entity!.contentSize);

    const textsBefore = await readTable(page, 'texts');
    const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym"]');
    await input.setInputFiles({ name: 'field.jym', mimeType: 'application/octet-stream', buffer: jym });
    const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId('project-import-bytes-included')).toBeVisible();
    await dialog.getByRole('button', { name: /Restore as new project|恢复为新项目/i }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });

    await expect
      .poll(async () => (await readTable(page, 'texts')).length, { timeout: 15_000 })
      .toBe(textsBefore.length + 1);
    const restored = (await readTable(page, 'texts')).find(
      (t) => !textsBefore.some((b) => b.id === t.id),
    )!;
    expect(restored.restoredFrom).toMatchObject({ projectId: project.textId, packageKind: 'jym' });

    const restoredMedia = await readMediaDiagnostics(page, restored.id);
    expect(restoredMedia).toHaveLength(1);
    expect(restoredMedia[0]!.id).not.toBe(project.mediaId);
    expect(restoredMedia[0]).toMatchObject({
      hasBlob: true,
      byteSize: entity!.contentSize,
      byteLocation: 'managed',
      availability: 'available',
      contentSha256: localSha,
      audioExportOmitted: false,
    });
    expect(await readLocalMediaSha(page, restoredMedia[0]!.id)).toBe(localSha);

    // 原项目不变 | Source project untouched
    expect(await readLocalMediaSha(page, project.mediaId)).toBe(localSha);
  });

  test('overwrite: identical bytes are allowed; different local bytes block the overwrite', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const localSha = await readLocalMediaSha(page, project.mediaId);
    const jym = await exportArchiveFromProjectHub(page, 'JYM');

    // 同样的字节：可以覆盖，字节不变 | Same bytes: overwrite goes through, bytes unchanged
    await importProjectPackageViaProjectHub(page, jym, 'field.jym', 'overwrite-current');
    expect(await readLocalMediaSha(page, project.mediaId)).toBe(localSha);
    const texts = await readTable(page, 'texts');
    expect(texts.find((t) => t.id === project.textId)?.restoredFrom).toMatchObject({
      packageKind: 'jym',
    });

    // 本机录音换成别的字节：覆盖会丢本机字节，所以不能覆盖 | Different local bytes: overwrite blocked
    await page.evaluate(async (id) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            media_items: {
              get: (k: string) => Promise<Record<string, unknown>>;
              put: (row: Record<string, unknown>) => Promise<unknown>;
            };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      const row = await dexie.media_items.get(id);
      const blob = new Blob([new Uint8Array(64).fill(7)], { type: 'audio/wav' });
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const sha = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      await dexie.media_items.put({
        ...row,
        details: { ...(row.details as Record<string, unknown>), audioBlob: blob },
        contentSize: blob.size,
        contentSha256: sha,
      });
    }, project.mediaId);
    const changedSha = await readLocalMediaSha(page, project.mediaId);
    expect(changedSha).not.toBe(localSha);

    const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym"]');
    await input.setInputFiles({ name: 'field.jym', mimeType: 'application/octet-stream', buffer: jym });
    const dialog = page.getByRole('dialog', { name: /Project import preview|导入项目预览/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId('project-import-overwrite-blocked')).toBeVisible();
    await expect(dialog.getByTestId('project-import-overwrite-current')).toBeDisabled();
    await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
    await expect(dialog).toBeHidden();
    expect(await readLocalMediaSha(page, project.mediaId)).toBe(changedSha);
  });

  test('T32: an old whole-database JYM is refused with a clear message and writes nothing', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await openProject(page, project.textId, project.mediaId);
    const textsBefore = await readTable(page, 'texts');

    const legacy = zipSync({
      mimetype: [strToU8('application/x-jieyu-media'), { level: 0 }],
      'META-INF/manifest.json': strToU8(
        JSON.stringify({ formatVersion: 1, kind: 'jym', schemaVersion: 3, dbName: 'jieyudb_v2' }),
      ),
      'data/snapshot.json': strToU8(JSON.stringify({ schemaVersion: 3, collections: {} })),
    });
    const input = page.locator('input.left-rail-project-hub-file-input[accept=".jyt,.jym"]');
    await input.setInputFiles({
      name: 'old.jym',
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
