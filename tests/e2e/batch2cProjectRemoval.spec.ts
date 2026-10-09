/**
 * 第 2C 批（rev5 9.1）浏览器端验收：协作过的项目只从本机移除，进入“已从本机移除的云端项目”列表；
 * 从未协作的项目照常删除。
 * Batch 2C browser acceptance: a collaborated project is only removed from this device and listed
 * for manual re-download; a never-collaborated project is deleted as before.
 */
import { test, expect, type Page } from '@playwright/test';

import { waitForDexie } from './_helpers/transcriptionProjectFlow';

const NOW = '2099-10-09T00:00:00.000Z';
const SHARED_ID = 'e2e-2c-shared';
const LOCAL_ID = 'e2e-2c-local';
const REGISTRY_KEY = 'jieyu:collab-local-projects:v1';
const JOBS_KEY = 'jieyu:project-cleanup-jobs:v1';

async function textExists(page: Page, id: string): Promise<boolean> {
  return page.evaluate(async (textId) => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          texts: { get: (id: string) => Promise<unknown> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    return (await dexie.texts.get(textId)) !== undefined;
  }, id);
}

async function deleteFromHome(page: Page, title: string): Promise<string[]> {
  const dialogs: string[] = [];
  const onDialog = (dialog: { message: () => string; accept: () => Promise<void> }) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  };
  page.on('dialog', onDialog);
  const row = page.locator('.home-project-row', {
    has: page.getByRole('button', { name: title, exact: true }),
  });
  await row.getByRole('button', { name: /Project actions|项目操作/ }).click();
  await page.getByText(/Delete current project|删除当前项目/).click();
  await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0, {
    timeout: 15_000,
  });
  page.off('dialog', onDialog);
  return dialogs;
}

test.describe('Batch 2C local removal | 第 2C 批仅从本机移除', () => {
  test('collaborated project is removed locally and listed; local-only project is deleted', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/transcription');
    await waitForDexie(page);
    await page.evaluate(
      async ({ ids, now, registryKey }) => {
        const dexie = (
          globalThis as unknown as {
            __jieyuDexie__: {
              open: () => Promise<unknown>;
              texts: { put: (row: unknown) => Promise<unknown> };
            };
          }
        ).__jieyuDexie__;
        await dexie.open();
        await dexie.texts.put({
          id: ids.shared,
          title: { default: 'Shared 2C' },
          createdAt: now,
          updatedAt: now,
        });
        await dexie.texts.put({
          id: ids.local,
          title: { default: 'Local 2C' },
          createdAt: now,
          updatedAt: now,
        });
        // 本机曾确认云端有这个项目（协作绑定，D6）| This device once saw the cloud project (binding)
        localStorage.setItem(
          registryKey,
          JSON.stringify({ [ids.shared]: { boundAt: now, updatedAt: now } }),
        );
      },
      { ids: { shared: SHARED_ID, local: LOCAL_ID }, now: NOW, registryKey: REGISTRY_KEY },
    );

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Shared 2C', exact: true })).toBeVisible({
      timeout: 25_000,
    });
    await waitForDexie(page);

    // 协作过：确认文字是“只从本机移除” | Collaborated: the prompt says local-only removal
    const sharedDialogs = await deleteFromHome(page, 'Shared 2C');
    expect(sharedDialogs).toHaveLength(1);
    expect(sharedDialogs[0]).toMatch(/only be removed from this device|只会从本机移除/);
    await expect.poll(() => textExists(page, SHARED_ID), { timeout: 15_000 }).toBe(false);

    const removedList = page.getByTestId('removed-cloud-projects');
    await expect(removedList).toBeVisible();
    await expect(removedList.getByText('Shared 2C')).toBeVisible();

    // 从未协作：照常删除，不进列表 | Never collaborated: plain delete, not listed
    const localDialogs = await deleteFromHome(page, 'Local 2C');
    expect(localDialogs).toHaveLength(1);
    expect(localDialogs[0]).not.toMatch(/only be removed from this device|只会从本机移除/);
    await expect.poll(() => textExists(page, LOCAL_ID), { timeout: 15_000 }).toBe(false);
    await expect(removedList.getByText('Local 2C')).toHaveCount(0);

    // 记录持久保存，清理任务已完成 | The record persists; no cleanup job left
    await page.reload();
    await expect(page.getByTestId('removed-cloud-projects').getByText('Shared 2C')).toBeVisible({
      timeout: 25_000,
    });
    const storage = await page.evaluate(
      ({ registryKey, jobsKey }) => ({
        registry: JSON.parse(localStorage.getItem(registryKey) ?? '{}') as Record<
          string,
          { removedLocallyAt?: string }
        >,
        jobs: localStorage.getItem(jobsKey),
      }),
      { registryKey: REGISTRY_KEY, jobsKey: JOBS_KEY },
    );
    expect(storage.registry[SHARED_ID]?.removedLocallyAt).toBeTruthy();
    expect(storage.registry[LOCAL_ID]).toBeUndefined();
    expect(storage.jobs).toBeNull();

    // 只能手动重新下载；本环境没有云端，给出明确原因 | Manual re-download; no cloud here, clear reason
    await page
      .getByTestId('removed-cloud-projects')
      .getByRole('button', { name: /Download again|重新下载/ })
      .click();
    await expect(page.getByTestId('removed-cloud-projects').getByRole('alert')).toContainText(
      /not configured|没有配置云端/,
    );
    expect(await textExists(page, SHARED_ID)).toBe(false);
  });
});
