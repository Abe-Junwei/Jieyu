import { expect, test } from '@playwright/test';
import { waitForDexie } from './_helpers/transcriptionProjectFlow';

const RETURN_KEY = 'jieyu.workspace.transcriptionReturn.v1';

test('home keeps the newest project across transcription and back', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await waitForDexie(page);
  await page.evaluate(async () => {
    const dexie = (
      globalThis as unknown as {
        __jieyuDexie__: {
          open: () => Promise<unknown>;
          texts: { put: (row: Record<string, unknown>) => Promise<string> };
        };
      }
    ).__jieyuDexie__;
    await dexie.open();
    await dexie.texts.put({
      id: 'text_e2e_home_older',
      title: { und: 'home-older' },
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    await dexie.texts.put({
      id: 'zzz_e2e_home_newer',
      title: { und: 'home-newer' },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:00.000Z',
    });
    sessionStorage.removeItem('jieyu.workspace.transcriptionReturn.v1');
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'home-newer' })).toBeVisible();
  await page.getByRole('link', { name: /^转写$|^Transcription$/ }).click();
  await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => sessionStorage.getItem(key), RETURN_KEY))
    .toContain('zzz_e2e_home_newer');
  await page.getByRole('link', { name: /^首页$|^Home$/ }).click();
  await expect(page.getByRole('heading', { name: 'home-newer' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'home-older' })).toHaveCount(0);
});

test('interface language survives closing settings and a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: /Settings|设置/ }).click();
  await page.getByRole('tab', { name: /^语言$|^Language$/ }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: /关闭设置|Close settings/ }).click();
  await page.getByRole('button', { name: /Settings|设置/ }).click();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.reload();
  await page.getByRole('button', { name: /Settings|设置/ }).click();
  await page.getByRole('tab', { name: /^语言$|^Language$/ }).click();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
