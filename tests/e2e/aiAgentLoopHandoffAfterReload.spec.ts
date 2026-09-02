/**
 * T1-c：IndexedDB 中存在可续跑 agent_loop 行、local session 为空时，刷新后打开 AI 浮窗应出现 handoff alerts。
 *
 * 依赖 `vite preview` 与当前 `dist` 一致；本地若只改 TS 未 build，请先 `npm run build` 再跑本文件。
 */
import { test, expect } from '@playwright/test';

const E2E_TASK_ID = 'e2e_t1c_agent_loop_handoff';
const E2E_CONVERSATION_ID = 'e2e_t1c_agent_loop_conversation';
const E2E_ASSISTANT_MESSAGE_ID = 'e2e_t1c_agent_loop_assistant';

async function waitForPendingCheckpointHydrated(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    async ({ conversationId, taskId }) => {
      try {
        const dexie = (
          globalThis as unknown as {
            __jieyuDexie__?: {
              ai_session_memories: {
                get: (
                  k: string,
                ) => Promise<{ payload?: { pendingAgentLoopCheckpoint?: { taskId?: string } } } | undefined>;
              };
            };
          }
        ).__jieyuDexie__;
        if (!dexie) return false;
        const row = await dexie.ai_session_memories.get(conversationId);
        return row?.payload?.pendingAgentLoopCheckpoint?.taskId === taskId;
      } catch {
        return false;
      }
    },
    { conversationId: E2E_CONVERSATION_ID, taskId: E2E_TASK_ID },
    { timeout: 25_000 },
  );
}

async function seedPendingAgentLoopTask(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((globalThis as unknown as { __jieyuDexie__?: { open: () => Promise<unknown> } }).__jieyuDexie__),
    { timeout: 25_000 },
  );
  await page.evaluate(
    async ({ taskId, conversationId, assistantMessageId }) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__: {
            open: () => Promise<unknown>;
            ai_tasks: { delete: (k: string) => Promise<unknown>; put: (row: Record<string, unknown>) => Promise<string> };
            ai_conversations: {
              delete: (k: string) => Promise<unknown>;
              put: (row: Record<string, unknown>) => Promise<string>;
              toArray: () => Promise<Array<{ textId?: string }>>;
            };
            ai_messages: { delete: (k: string) => Promise<unknown>; put: (row: Record<string, unknown>) => Promise<unknown> };
            ai_session_memories: { delete: (k: string) => Promise<unknown> };
          };
        }
      ).__jieyuDexie__;
      await dexie.open();
      await dexie.ai_tasks.delete(taskId).catch(() => undefined);
      await dexie.ai_conversations.delete(conversationId).catch(() => undefined);
      await dexie.ai_messages.delete(assistantMessageId).catch(() => undefined);
      await dexie.ai_session_memories.delete(conversationId).catch(() => undefined);
      const existing = await dexie.ai_conversations.toArray();
      const scopedTextId = existing.find((row) => typeof row.textId === 'string' && row.textId.length > 0)?.textId;
      const ts = new Date(Date.now() + 60_000).toISOString();
      await dexie.ai_conversations.put({
        id: conversationId,
        title: 'E2E agent loop handoff',
        mode: 'assistant',
        providerId: 'mock',
        model: 'mock',
        ...(scopedTextId ? { textId: scopedTextId } : {}),
        createdAt: ts,
        updatedAt: ts,
      });
      await dexie.ai_messages.put({
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: 'e2e-agent-loop-seed',
        status: 'done',
        generationSource: 'local',
        createdAt: ts,
        updatedAt: ts,
      });
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
        targetId: assistantMessageId,
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
      window.localStorage.removeItem('jieyu.aiChat.sessionMemory.migrated.v1');
      window.localStorage.removeItem('jieyu.aiChatWindow.v1');
    },
    {
      taskId: E2E_TASK_ID,
      conversationId: E2E_CONVERSATION_ID,
      assistantMessageId: E2E_ASSISTANT_MESSAGE_ID,
    },
  );
}

async function cleanupE2ETask(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(
    async ({ taskId, conversationId, assistantMessageId }) => {
      const dexie = (
        globalThis as unknown as {
          __jieyuDexie__?: {
            open: () => Promise<unknown>;
            ai_tasks: { delete: (k: string) => Promise<unknown> };
            ai_conversations: { delete: (k: string) => Promise<unknown> };
            ai_messages: { delete: (k: string) => Promise<unknown> };
            ai_session_memories: { delete: (k: string) => Promise<unknown> };
          };
        }
      ).__jieyuDexie__;
      if (!dexie) return;
      await dexie.open();
      await dexie.ai_tasks.delete(taskId).catch(() => undefined);
      await dexie.ai_messages.delete(assistantMessageId).catch(() => undefined);
      await dexie.ai_session_memories.delete(conversationId).catch(() => undefined);
      await dexie.ai_conversations.delete(conversationId).catch(() => undefined);
    },
    {
      taskId: E2E_TASK_ID,
      conversationId: E2E_CONVERSATION_ID,
      assistantMessageId: E2E_ASSISTANT_MESSAGE_ID,
    },
  );
}

test.describe('T1-c AI agent loop handoff after reload', () => {
  test('shows handoff alerts region after reload when durable task exists and session was empty', async ({ page }) => {
    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    await seedPendingAgentLoopTask(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await waitForPendingCheckpointHydrated(page);

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
      await waitForPendingCheckpointHydrated(pageB);

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

  test('shows search-no-results clarify copy from aiChatCardMessages in the transcript', async ({
    page,
  }) => {
    const clarifyZh = '未找到匹配的句段';
    const clarifyEn = 'No matching units were found';
    const conversationId = 'e2e_a4_clarify_conversation';
    const messageId = 'e2e_a4_clarify_search_zero';

    await page.goto('/transcription');
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });
    await page.waitForFunction(
      () =>
        Boolean(
          (globalThis as unknown as { __jieyuDexie__?: { open: () => Promise<unknown> } })
            .__jieyuDexie__,
        ),
      { timeout: 25_000 },
    );

    await page.evaluate(
      async ({ conversationId: convId, messageId: msgId, clarifyText }) => {
        const dexie = (
          globalThis as unknown as {
            __jieyuDexie__: {
              open: () => Promise<unknown>;
              ai_conversations: {
                delete: (k: string) => Promise<unknown>;
                put: (row: Record<string, unknown>) => Promise<unknown>;
                toArray: () => Promise<Array<{ textId?: string }>>;
              };
              ai_messages: {
                delete: (k: string) => Promise<unknown>;
                put: (row: Record<string, unknown>) => Promise<unknown>;
              };
            };
          }
        ).__jieyuDexie__;
        await dexie.open();
        await dexie.ai_conversations.delete(convId).catch(() => undefined);
        await dexie.ai_messages.delete(msgId).catch(() => undefined);
        const existing = (await dexie.ai_conversations.toArray()) as Array<{ textId?: string }>;
        const scopedTextId = existing.find((row) => typeof row.textId === 'string' && row.textId.length > 0)
          ?.textId;
        const ts = new Date(Date.now() + 60_000).toISOString();
        await dexie.ai_conversations.put({
          id: convId,
          title: 'E2E agent loop clarify',
          mode: 'assistant',
          providerId: 'mock',
          model: 'mock',
          ...(scopedTextId ? { textId: scopedTextId } : {}),
          createdAt: ts,
          updatedAt: ts,
        });
        await dexie.ai_messages.put({
          id: msgId,
          conversationId: convId,
          role: 'assistant',
          content: clarifyText,
          status: 'done',
          generationSource: 'local',
          createdAt: ts,
          updatedAt: ts,
        });
      },
      {
        conversationId,
        messageId,
        clarifyText: `${clarifyZh}。请尝试更具体的关键词、缩小范围，或确认当前选区/轨道是否正确。`,
      },
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('transcription-workspace-screen')).toBeVisible({ timeout: 25_000 });

    const chatTrigger = page.locator('.transcription-chat-window-trigger:not(.is-hidden)');
    const chatWindow = page.locator('.transcription-chat-window');
    if ((await chatWindow.count()) === 0) {
      await expect(chatTrigger).toBeVisible({ timeout: 15_000 });
      await chatTrigger.click();
    }
    await expect(chatWindow).toBeVisible({ timeout: 15_000 });

    await expect(page.locator('.ai-chat-message-content')).toContainText(
      new RegExp(`${clarifyZh}|${clarifyEn}`),
      { timeout: 15_000 },
    );

    await page.evaluate(
      async ({ conversationId: convId, messageId: msgId }) => {
        const dexie = (
          globalThis as unknown as {
            __jieyuDexie__?: {
              ai_conversations: { delete: (k: string) => Promise<unknown> };
              ai_messages: { delete: (k: string) => Promise<unknown> };
            };
          }
        ).__jieyuDexie__;
        await dexie?.ai_messages.delete(msgId).catch(() => undefined);
        await dexie?.ai_conversations.delete(convId).catch(() => undefined);
      },
      { conversationId, messageId },
    );
  });
});
