/**
 * 切片 2B-C（rev5 N9 / T19）浏览器端验收：删除录音字节后行仍在、原名保留、
 * 状态为 acoustic + none + missing，句段时间不变；重载后依旧如此。
 * Slice 2B-C browser acceptance: deleting recording bytes keeps the row, its original name and
 * every unit time; state is acoustic + none + missing, also after a reload.
 */
import { test, expect, type Page } from '@playwright/test';

import { readMediaDiagnostics } from './_helpers/mediaByteDiagnostics';
import {
  setupFieldProjectWithMediaAndSegments,
  waitForDexie,
} from './_helpers/transcriptionProjectFlow';

async function readUnitTimes(page: Page, mediaId: string): Promise<Array<[number, number]>> {
  return page.evaluate(async (id) => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          layer_units: {
            where: (k: string) => {
              equals: (v: string) => {
                toArray: () => Promise<Array<{ startTime: number; endTime: number }>>;
              };
            };
          };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    const rows = await dexie.layer_units.where('mediaId').equals(id).toArray();
    return rows
      .map((row) => [row.startTime, row.endTime] as [number, number])
      .sort((a, b) => a[0] - b[0]);
  }, mediaId);
}

test.describe('Slice 2B-C media state | 切片 2B-C 媒体状态', () => {
  test('T19: deleting recording bytes keeps the row, name and unit times across a reload', async ({
    page,
  }) => {
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
    expect(before).toMatchObject({
      hasBlob: true,
      timelineKind: 'acoustic',
      byteLocation: 'managed',
      availability: 'available',
    });
    expect(before?.contentSha256 ?? '').toMatch(/^[0-9a-f]{64}$/);
    const timesBefore = await readUnitTimes(page, project.mediaId);
    expect(timesBefore.length).toBeGreaterThan(0);

    const deleteButton = page.locator('.transcription-wave-toolbar-delete-audio-btn');
    await expect(deleteButton).toBeEnabled({ timeout: 20_000 });
    await deleteButton.click();
    await page.getByRole('button', { name: /^(确认删除|Confirm delete|Delete)$/ }).click();

    await expect
      .poll(
        async () =>
          (await readMediaDiagnostics(page, project.textId)).find((r) => r.id === project.mediaId)
            ?.availability,
        { timeout: 20_000 },
      )
      .toBe('missing');

    for (const phase of ['after delete', 'after reload'] as const) {
      if (phase === 'after reload') {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({
          timeout: 25_000,
        });
        await waitForDexie(page);
      }
      const rows = await readMediaDiagnostics(page, project.textId);
      expect(rows, phase).toHaveLength(1);
      expect(rows[0], phase).toMatchObject({
        id: project.mediaId,
        filename: before?.filename,
        timelineKind: 'acoustic',
        byteLocation: 'none',
        availability: 'missing',
        contentSha256: before?.contentSha256,
        hasBlob: false,
      });
      expect(await readUnitTimes(page, project.mediaId), phase).toEqual(timesBefore);
    }
  });
});
