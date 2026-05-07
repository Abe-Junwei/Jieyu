/**
 * P4–P5: Reflection panel 渲染 E2E（fixture，不调用真实模型）。
 */
import { expect, test } from '@playwright/test';

const CONV_ID = 'e2e_reflection_panel_conv';

async function seedReflectionFixture(page: import('@playwright/test').Page): Promise<void> {
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
    const tsUser = '2098-12-31T00:00:00.000Z';
    const tsAsst = '2098-12-31T00:00:01.000Z';
    const tsConv = '2099-01-01T00:00:00.000Z';
    await dexie.ai_messages.where('conversationId').equals(convId).delete();
    await dexie.ai_conversations.delete(convId).catch(() => undefined);
    await dexie.ai_conversations.put({
      id: convId,
      title: 'e2e reflection panel',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock-1',
      createdAt: tsConv,
      updatedAt: tsConv,
    });
    await dexie.ai_messages.put({
      id: `${convId}_usr`,
      conversationId: convId,
      role: 'user',
      content: 'analyze segment',
      status: 'done',
      createdAt: tsUser,
      updatedAt: tsUser,
    });
    await dexie.ai_messages.put({
      id: `${convId}_ast`,
      conversationId: convId,
      role: 'assistant',
      content: 'Analysis complete.',
      status: 'done',
      reflectionChecks: [
        { name: 'Evidence depth', passed: true },
        { name: 'Citation integrity', passed: false },
        { name: 'Scope relevance', passed: true },
      ],
      generationSource: 'llm',
      generationModel: 'mock-1',
      createdAt: tsAsst,
      updatedAt: tsAsst,
    });
  }, CONV_ID);
}

async function cleanupReflectionFixture(page: import('@playwright/test').Page): Promise<void> {
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

test.describe('reflection panel rendering (fixture)', () => {
  test.afterEach(async ({ page }) => {
    await cleanupReflectionFixture(page);
  });

  test('reflection panel shows passed and failed checks', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    await seedReflectionFixture(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const trigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    const panel = page.locator('.ai-chat-reflection-panel');
    await expect(panel).toBeVisible({ timeout: 20_000 });

    const checkItems = panel.locator('.ai-chat-reflection-panel__item');
    await expect(checkItems).toHaveCount(3);

    const passedCount = await page
      .locator('.ai-chat-reflection-panel__item.is-passed')
      .count();
    const failedCount = await page
      .locator('.ai-chat-reflection-panel__item.is-failed')
      .count();
    expect(passedCount).toBe(2);
    expect(failedCount).toBe(1);

    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });
});
