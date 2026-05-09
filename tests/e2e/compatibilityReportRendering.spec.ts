/**
 * P5: compatibility report card 渲染 + adoption queue panel 挂载 E2E
 * IndexedDB 预置助手消息（含 compatibilityReport），不调用真实模型。
 */
import { expect, test } from '@playwright/test';

const CONV_ID = 'e2e_compat_report_conv';

async function seedCompatibilityReportFixture(page: import('@playwright/test').Page): Promise<void> {
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
      title: 'e2e compatibility report',
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
      content: 'check elan flex compatibility',
      status: 'done',
      createdAt: tsUser,
      updatedAt: tsUser,
    });
    await dexie.ai_messages.put({
      id: `${convId}_ast`,
      conversationId: convId,
      role: 'assistant',
      content: 'Compatibility analysis complete.',
      status: 'done',
      compatibilityReport: {
        reportId: 'rpt-e2e-001',
        findings: [
          {
            findingId: 'f001',
            kind: 'tier_mapping',
            severity: 'warning',
            title: 'Tier mapping mismatch',
            description: 'EAF tier does not match layer.',
            recommendedAction: 'Remap tier to layer.',
            evidenceCount: 2,
          },
        ],
        summary: '1 warning found.',
        exportTargets: ['elan', 'flex'],
      },
      generationSource: 'llm',
      generationModel: 'mock-1',
      createdAt: tsAsst,
      updatedAt: tsAsst,
    });
  }, CONV_ID);
}

async function cleanupCompatibilityReportFixture(page: import('@playwright/test').Page): Promise<void> {
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

test.describe('compatibility report rendering (fixture)', () => {
  test.afterEach(async ({ page }) => {
    await cleanupCompatibilityReportFixture(page);
  });

  test('compatibility report card is visible after history hydrate', async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      const message = err.message;
      if (browserName === 'webkit' && message.includes("Unexpected identifier 'AiStateWorkerRequest'")) {
        return;
      }
      errors.push(message);
    });

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    await seedCompatibilityReportFixture(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const trigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
    await expect(trigger).toBeVisible({ timeout: 15_000 });
    await trigger.click();

    const reportCard = page.locator('.ai-chat-compatibility-report');
    await expect(reportCard).toBeVisible({ timeout: 20_000 });

    const finding = reportCard.locator('.ai-chat-compatibility-report__finding');
    await expect(finding).toHaveCount(1);
    await expect(finding.locator('.ai-chat-compatibility-report__finding-title')).toContainText('Tier mapping mismatch');

    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });
});
