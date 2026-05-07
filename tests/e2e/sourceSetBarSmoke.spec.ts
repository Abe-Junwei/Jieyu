/**
 * P5: Source set bar 挂载烟测（空状态 + 选择状态，无真实模型调用）。
 */
import { expect, test } from '@playwright/test';

const CONV_ID = 'e2e_source_set_bar_conv';

async function seedSourceSetBarFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as { __jieyuDexie__?: { open: () => Promise<unknown> } }).__jieyuDexie__),
    { timeout: 25_000 },
  );
  await page.evaluate(async (convId) => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__: {
        open: () => Promise<unknown>;
        ai_conversations: { put: (row: Record<string, unknown>) => Promise<string>; delete: (k: string) => Promise<void> };
        ai_messages: {
          where: (idx: string) => { equals: (v: string) => { delete: () => Promise<number> } };
          put: (row: Record<string, unknown>) => Promise<string>;
        };
      };
    }).__jieyuDexie__;
    await dexie.open();
    const tsConv = '2099-01-01T00:00:00.000Z';
    await dexie.ai_messages.where('conversationId').equals(convId).delete();
    await dexie.ai_conversations.delete(convId).catch(() => undefined);
    await dexie.ai_conversations.put({
      id: convId,
      title: 'e2e source set bar',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock-1',
      createdAt: tsConv,
      updatedAt: tsConv,
    });
  }, CONV_ID);
}

async function cleanupSourceSetBarFixture(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async (convId) => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__?: {
        open: () => Promise<unknown>;
        ai_conversations: { delete: (k: string) => Promise<void> };
        ai_messages: { where: (idx: string) => { equals: (v: string) => { delete: () => Promise<number> } } };
      };
    }).__jieyuDexie__;
    if (!dexie) return;
    await dexie.open();
    await dexie.ai_messages.where('conversationId').equals(convId).delete();
    await dexie.ai_conversations.delete(convId).catch(() => undefined);
  }, CONV_ID);
}

test.describe('source set bar smoke', () => {
  test.afterEach(async ({ page }) => {
    await cleanupSourceSetBarFixture(page);
  });

  test('empty source set bar renders with project scope label', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    await seedSourceSetBarFixture(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const trigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    const bar = page.locator('.ai-source-set-bar');
    await expect(bar).toBeVisible({ timeout: 20_000 });

    const label = bar.locator('.ai-source-set-bar__label');
    await expect(label).toContainText(/Project Scope|项目范围/);

    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });
});
