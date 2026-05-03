/**
 * T1-c：IndexedDB 中存在可续跑 agent_loop 行、local session 为空时，刷新后打开 AI 浮窗应出现 handoff alerts。
 *
 * 依赖 `vite preview` 与当前 `dist` 一致；本地若只改 TS 未 build，请先 `npm run build` 再跑本文件。
 */
import { test, expect } from '@playwright/test';

const E2E_TASK_ID = 'e2e_t1c_agent_loop_handoff';

async function seedPendingAgentLoopTask(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as { __jieyuDexie__?: { open: () => Promise<unknown> } }).__jieyuDexie__),
    { timeout: 25_000 },
  );
  await page.evaluate(async (taskId) => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__: {
        open: () => Promise<unknown>;
        ai_tasks: { delete: (k: string) => Promise<unknown>; put: (row: Record<string, unknown>) => Promise<string> };
      };
    }).__jieyuDexie__;
    await dexie.open();
    await dexie.ai_tasks.delete(taskId).catch(() => undefined);
    const ts = new Date().toISOString();
    const checkpointJson = JSON.stringify({
      kind: 'agent_loop_token_budget_warning',
      data: {
        originalUserText: 'e2e-agent-loop-seed',
        continuationInput: '__LOCAL_TOOL_RESULT__',
        step: 1,
        createdAt: ts,
      },
      at: ts,
    });
    await dexie.ai_tasks.put({
      id: taskId,
      taskType: 'agent_loop',
      status: 'pending',
      targetId: 'e2e-target',
      targetType: 'ai_chat_agent_loop',
      attempt: 0,
      maxAttempts: 1,
      checkpointJson,
      lastHeartbeatAt: ts,
      resumable: true,
      handoffReason: 'token_budget_warning',
      createdAt: ts,
      updatedAt: ts,
    });
    window.localStorage.removeItem('jieyu.aiChat.sessionMemory');
    window.localStorage.removeItem('jieyu.aiChatWindow.v1');
  }, E2E_TASK_ID);
}

async function cleanupE2ETask(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async (taskId) => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__?: { open: () => Promise<unknown>; ai_tasks: { delete: (k: string) => Promise<unknown> } };
    }).__jieyuDexie__;
    if (!dexie) return;
    await dexie.open();
    await dexie.ai_tasks.delete(taskId).catch(() => undefined);
  }, E2E_TASK_ID);
}

test.describe('T1-c AI agent loop handoff after reload', () => {
  test('shows handoff alerts region after reload when durable task exists and session was empty', async ({ page }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    await seedPendingAgentLoopTask(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await page.waitForFunction(
      () => {
        try {
          const raw = window.localStorage.getItem('jieyu.aiChat.sessionMemory');
          if (!raw) return false;
          return Boolean((JSON.parse(raw) as { pendingAgentLoopCheckpoint?: { taskId?: string } }).pendingAgentLoopCheckpoint?.taskId);
        } catch {
          return false;
        }
      },
      { timeout: 25_000 },
    );

    const chatTrigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
    await expect(chatTrigger).toBeVisible({ timeout: 15_000 });
    await chatTrigger.click();

    const alerts = page.getByTestId('ai-chat-alerts-region');
    await expect(alerts).toBeVisible({ timeout: 15_000 });
    await expect(alerts).toContainText(/Agent Loop|交接|Handoff/i);

    await cleanupE2ETask(page);
  });

  test('second tab reload also sees handoff after shared IndexedDB seed', async ({ page, context }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await seedPendingAgentLoopTask(page);

    const pageB = await context.newPage();
    try {
      await pageB.goto('/transcription');
      await expect(pageB.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
      await pageB.reload({ waitUntil: 'domcontentloaded' });
      await expect(pageB.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
      await pageB.waitForFunction(
        () => {
          try {
            const raw = window.localStorage.getItem('jieyu.aiChat.sessionMemory');
            if (!raw) return false;
            return Boolean((JSON.parse(raw) as { pendingAgentLoopCheckpoint?: { taskId?: string } }).pendingAgentLoopCheckpoint?.taskId);
          } catch {
            return false;
          }
        },
        { timeout: 25_000 },
      );

      const chatTriggerB = pageB.locator('.transcription-chat-window-trigger:not(.is-hidden)');
      await expect(chatTriggerB).toBeVisible({ timeout: 15_000 });
      await chatTriggerB.click();

      const alertsB = pageB.getByTestId('ai-chat-alerts-region');
      await expect(alertsB).toBeVisible({ timeout: 15_000 });
      await expect(alertsB).toContainText(/Agent Loop|交接|Handoff/i);
    } finally {
      await pageB.close();
    }

    await cleanupE2ETask(page);
  });
});
