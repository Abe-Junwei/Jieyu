/**
 * P1: segment_qa 证据卡「跳转」壳 E2E（IndexedDB 预置助手消息 + 内联引用，不调用真实模型）。
 */
import { expect, test } from '@playwright/test';

const CONV_ID = 'e2e_segment_qa_evidence_conv';

async function seedSegmentQaEvidenceFixture(page: import('@playwright/test').Page): Promise<void> {
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
      title: 'e2e segment qa evidence',
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
      content: 'segment qa probe',
      status: 'done',
      createdAt: tsUser,
      updatedAt: tsUser,
    });
    await dexie.ai_messages.put({
      id: `${convId}_ast`,
      conversationId: convId,
      role: 'assistant',
      content: 'Answer with citation [1].',
      status: 'done',
      citations: [{ type: 'unit', refId: 'e2e-unit-1', snippet: 'fixture quote' }],
      generationSource: 'llm',
      generationModel: 'mock-1',
      createdAt: tsAsst,
      updatedAt: tsAsst,
    });
  }, CONV_ID);
}

async function cleanupSegmentQaEvidenceFixture(page: import('@playwright/test').Page): Promise<void> {
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

test.describe('segment_qa evidence jump (fixture)', () => {
  test.afterEach(async ({ page }) => {
    await cleanupSegmentQaEvidenceFixture(page);
  });

  test('evidence jump control is enabled and clickable after history hydrate', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    await seedSegmentQaEvidenceFixture(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const trigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    const jump = page.getByTestId('ai-chat-evidence-jump-0');
    await expect(jump).toBeVisible({ timeout: 20_000 });
    await expect(jump).toBeEnabled();
    await jump.click();

    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });
});
