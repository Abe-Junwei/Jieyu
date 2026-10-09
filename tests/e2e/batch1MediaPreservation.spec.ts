/**
 * Batch 1（rev5 N2/N4）浏览器端验收：真实 WAV 的字节在 JYT/JYM 再导入、崩溃恢复后不丢；
 * 多条占位轴时只晋升选中那一条。
 * Batch 1 browser acceptance: real WAV bytes survive JYT/JYM re-import and crash recovery;
 * with several placeholder timelines only the selected one is promoted.
 */
import { test, expect } from '@playwright/test';

import {
  exportArchiveFromProjectHub,
  handleArchiveExportDialogs,
  importArchiveViaProjectHub,
  importJytViaProjectHub,
  readMediaDiagnostics,
} from './_helpers/mediaByteDiagnostics';
import { buildMinimalWavBytes, buildMinimalWavFile } from './_helpers/minimalWav';
import {
  readSegmentText,
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

const NO_PLAYABLE = '.timeline-axis-status-strip__no-playable-media';

test.describe('Batch 1 media byte preservation | 第一批媒体字节保护', () => {
  test('real audio bytes survive JYT overwrite / restore-as-new and JYM re-import (replace-all)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    handleArchiveExportDialogs(page);

    const project = await setupFieldProjectWithMediaAndSegments(page);
    await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);

    const before = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(before?.hasBlob).toBe(true);
    expect(before?.byteSize ?? 0).toBeGreaterThan(44);
    await expect(page.locator(NO_PLAYABLE)).toHaveCount(0);

    const jyt = await exportArchiveFromProjectHub(page, 'JYT');
    expect(jyt.byteLength).toBeGreaterThan(100);

    // 第 3 批：JYT 只能恢复为新项目或覆盖当前项目；两种都不能动本机字节 | Batch 3 JYT modes
    for (const mode of ['restore-as-new', 'overwrite-current'] as const) {
      await importJytViaProjectHub(page, jyt, 'roundtrip.jyt', mode);
      const after = (await readMediaDiagnostics(page, project.textId)).find(
        (r) => r.id === project.mediaId,
      );
      expect(after, `JYT ${mode}`).toMatchObject({
        hasBlob: true,
        byteSize: before?.byteSize,
        mimeType: before?.mimeType,
        timelineKind: 'acoustic',
        audioExportOmitted: false,
      });
    }

    const jym = await exportArchiveFromProjectHub(page, 'JYM');
    await importArchiveViaProjectHub(page, jym, 'roundtrip.jym', 'replace-all');
    const afterJym = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(afterJym).toMatchObject({ hasBlob: true, byteSize: before?.byteSize });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await page.waitForTimeout(1500);
    await expect(page.locator(NO_PLAYABLE)).toHaveCount(0);
  });

  test('workbench audio import adds a recording next to byte-missing ones and the overview count updates', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);

    // 模拟 JYT 导入后的状态：3 条声学录音都缺字节（audioExportOmitted）| Mimic three byte-missing recordings.
    await page.evaluate(async ({ textId, mediaId }) => {
      type Row = { id: string; details?: Record<string, unknown> } & Record<string, unknown>;
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            media_items: {
              get: (id: string) => Promise<Row | undefined>;
              put: (row: Row) => Promise<string>;
            };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      const real = await dexie.media_items.get(mediaId);
      if (!real) throw new Error('media missing');
      const { audioBlob: _drop, ...rest } = real.details ?? {};
      await dexie.media_items.put({
        ...real,
        byteLocation: 'none',
        availability: 'missing',
        details: { ...rest, audioExportOmitted: true },
      });
      for (const n of [2, 3]) {
        await dexie.media_items.put({
          id: `media_missing_${n}`,
          textId,
          filename: `missing-${n}.wav`,
          duration: 3,
          isOfflineCached: false,
          timelineKind: 'acoustic',
          byteLocation: 'none',
          availability: 'missing',
          createdAt: '2099-06-10T00:00:00.000Z',
          details: { audioExportOmitted: true },
        });
      }
    }, project);

    await page.goto('/');
    const audioCount = page.locator('.project-overview-recordings dd').first();
    await expect(audioCount).toHaveText('3', { timeout: 25_000 });

    await page
      .locator('input.home-file-input[accept^=".mp3"]')
      .setInputFiles(buildMinimalWavFile('workbench-new.wav'));

    await expect
      .poll(async () => (await readMediaDiagnostics(page, project.textId)).length, {
        timeout: 20_000,
      })
      .toBe(4);
    const rows = await readMediaDiagnostics(page, project.textId);
    const added = rows.find((r) => r.filename === 'workbench-new.wav');
    expect(added).toMatchObject({ hasBlob: true, timelineKind: 'acoustic' });
    // 缺字节的录音原样保留，不被晋升或合并 | Byte-missing recordings stay as they were.
    for (const id of [project.mediaId, 'media_missing_2', 'media_missing_3']) {
      expect(rows.find((r) => r.id === id)).toMatchObject({
        hasBlob: false,
        timelineKind: 'acoustic',
      });
    }
    await expect(
      page.locator('.project-file-name', { hasText: 'workbench-new.wav' }),
    ).toBeVisible();
    await expect(audioCount).toHaveText('4');
  });

  test('with two placeholder timelines, importing audio promotes only the selected one', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);

    // 把唯一的真实录音改成占位轴 A，再加占位轴 B（各自带语段）| Turn the media into placeholder A, add placeholder B.
    await page.evaluate(async ({ textId, mediaId, layerId }) => {
      type Row = { id: string; details?: Record<string, unknown> } & Record<string, unknown>;
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            media_items: {
              get: (id: string) => Promise<Row | undefined>;
              put: (row: Row) => Promise<string>;
            };
            layer_units: { put: (row: Record<string, unknown>) => Promise<string> };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      const real = await dexie.media_items.get(mediaId);
      if (!real) throw new Error('media missing');
      const placeholderDetails = { timelineMode: 'document' };
      const { contentSize: _size, contentSha256: _sha, ...realWithoutContent } = real;
      await dexie.media_items.put({
        ...realWithoutContent,
        filename: 'document-placeholder.track',
        timelineKind: 'placeholder',
        byteLocation: 'none',
        availability: 'missing',
        details: placeholderDetails,
      });
      const createdAt = '2099-06-10T00:00:00.000Z';
      await dexie.media_items.put({
        id: 'media_ph_b',
        textId,
        filename: 'document-placeholder.track',
        duration: 1800,
        isOfflineCached: true,
        timelineKind: 'placeholder',
        byteLocation: 'none',
        availability: 'missing',
        createdAt,
        details: placeholderDetails,
      });
      await dexie.layer_units.put({
        id: 'utt_ph_b',
        textId,
        mediaId: 'media_ph_b',
        layerId,
        unitType: 'unit',
        startTime: 10,
        endTime: 12,
        createdAt,
        updatedAt: createdAt,
      });
    }, project);

    await page.goto(`/transcription?textId=${project.textId}&mediaId=media_ph_b`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    const before = await readMediaDiagnostics(page, project.textId);
    const unitsOnA = before.find((r) => r.id === project.mediaId)?.unitCount ?? 0;
    expect(unitsOnA).toBeGreaterThan(0);

    // 20 秒，长于逻辑轴（12 秒）：导入框会要求勾选确认（时长读出后才出现勾选框）。
    // 20 s, longer than the 12 s logical axis: the dialog asks for an acknowledgement once duration loads.
    await page.locator('input.transcription-media-file-input').setInputFiles({
      name: 'ph-b.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from(buildMinimalWavBytes(20)),
    });
    const importDialog = page.getByRole('dialog', { name: /Import audio|导入音频/i });
    await expect(importDialog).toBeVisible({ timeout: 15_000 });
    await importDialog.getByRole('checkbox').check();
    await importDialog.getByRole('button', { name: /^(Import|导入)$/ }).click();

    await expect
      .poll(
        async () =>
          (await readMediaDiagnostics(page, project.textId)).find((r) => r.id === 'media_ph_b')
            ?.hasBlob,
        {
          timeout: 20_000,
        },
      )
      .toBe(true);
    const after = await readMediaDiagnostics(page, project.textId);
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.id === 'media_ph_b')).toMatchObject({
      filename: 'ph-b.wav',
      timelineKind: 'acoustic',
      hasBlob: true,
      unitCount: 1,
    });
    // 未选中的占位轴 A 及其语段原样保留 | Unselected placeholder A and its units stay untouched.
    expect(after.find((r) => r.id === project.mediaId)).toMatchObject({
      timelineKind: 'placeholder',
      hasBlob: false,
      unitCount: unitsOnA,
    });
  });

  test('crash-recovery restore keeps real audio bytes', async ({ page }) => {
    test.setTimeout(180_000);
    const project = await setupFieldProjectWithMediaAndSegments(page);
    await page.goto(`/transcription?textId=${project.textId}&mediaId=${project.mediaId}`);
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);
    const before = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(before?.hasBlob).toBe(true);

    // 按 exportRecoveryDatabaseAsJson 的形状写一份恢复快照：音频字节省略，只带省略标记与指纹；
    // 一条语段文字改成 recovered，时间戳晚于库内数据，使刷新后出现恢复横幅。
    // Write a recovery snapshot shaped like exportRecoveryDatabaseAsJson (bytes omitted with markers).
    await page.evaluate(
      async ({ dbName }) => {
        type Row = { id: string; details?: Record<string, unknown> } & Record<string, unknown>;
        const dexie = (
          globalThis as unknown as {
            __jieyuDexie__: {
              open: () => Promise<unknown>;
              media_items: { toArray: () => Promise<Row[]> };
              layer_units: { toArray: () => Promise<Row[]> };
              layer_unit_contents: { toArray: () => Promise<Row[]> };
            };
          }
        ).__jieyuDexie__;
        await dexie.open();
        const media = (await dexie.media_items.toArray()).map((row) => {
          const details = { ...(row.details ?? {}) };
          const blob = details['audioBlob'];
          if (blob instanceof Blob) {
            delete details['audioBlob'];
            details['audioExportOmitted'] = true;
            details['audioExportOmittedByteSize'] = blob.size;
            if (blob.type) details['audioExportOmittedMimeType'] = blob.type;
          }
          return { ...row, details };
        });
        const contents = (await dexie.layer_unit_contents.toArray()).map((row) =>
          row['unitId'] === 'seg_e2e_c' ? { ...row, text: 'gamma-recovered' } : row,
        );
        const snapshot = {
          schemaVersion: 5,
          exportedAt: new Date().toISOString(),
          dbName,
          collections: {
            media_items: media,
            layer_units: await dexie.layer_units.toArray(),
            layer_unit_contents: contents,
          },
        };
        const row = {
          dbName,
          schemaVersion: 2,
          timestamp: Date.now() + 60_000,
          snapshotJson: JSON.stringify(snapshot),
        };
        await new Promise<void>((resolve, reject) => {
          const writeRow = (db: IDBDatabase) => {
            const tx = db.transaction('snapshots', 'readwrite');
            tx.objectStore('snapshots').put(row);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          const probe = indexedDB.open('jieyu_recovery');
          probe.onerror = () => reject(probe.error);
          probe.onsuccess = () => {
            const db = probe.result;
            if (db.objectStoreNames.contains('snapshots')) {
              writeRow(db);
              return;
            }
            const nextVersion = Math.max(db.version + 1, 10);
            db.close();
            const upgrade = indexedDB.open('jieyu_recovery', nextVersion);
            upgrade.onupgradeneeded = () =>
              upgrade.result.createObjectStore('snapshots', { keyPath: 'dbName' });
            upgrade.onerror = () => reject(upgrade.error);
            upgrade.onsuccess = () => writeRow(upgrade.result);
          };
        });
      },
      { dbName: 'jieyu' },
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
      timeout: 25_000,
    });
    const apply = page.locator('.app-recovery-banner__button--apply');
    await expect(apply).toBeVisible({ timeout: 20_000 });
    await apply.click();
    await expect(page.locator('.app-recovery-banner')).toBeHidden({ timeout: 20_000 });

    await expect
      .poll(() => readSegmentText(page, 'seg_e2e_c', project.layerId))
      .toBe('gamma-recovered');
    const after = (await readMediaDiagnostics(page, project.textId)).find(
      (r) => r.id === project.mediaId,
    );
    expect(after).toMatchObject({
      hasBlob: true,
      byteSize: before?.byteSize,
      mimeType: before?.mimeType,
      audioExportOmitted: false,
    });
  });
});
