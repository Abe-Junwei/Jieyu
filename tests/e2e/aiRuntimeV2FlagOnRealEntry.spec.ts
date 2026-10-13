/**
 * R2：localStorage 打开 aiAgentRuntimeV2Enabled 后，真实聊天入口走 ToolLoopAgent。
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { setupFieldProjectWithMediaAndSegments } from './_helpers/transcriptionProjectFlow';
import { openTranscriptionChatWindow } from './_helpers/openTranscriptionChatWindow';

type AuditRow = { field: string; requestId?: string; newValue?: string; metadataJson?: string };

async function fulfillSse(route: Route, chunk: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    headers: { 'cache-control': 'no-cache' },
    body: `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
  });
}

function textChunk(text: string) {
  return {
    id: 'chatcmpl-text',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  };
}

function toolCallChunk(name: string, args: Record<string, unknown> | string, id = 'call_r2_1') {
  return {
    id: 'chatcmpl-tool',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [
            {
              index: 0,
              id,
              type: 'function',
              function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };
}

async function seedV2DeepSeek(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('jieyu.aiAgentRuntimeV2Enabled', '1');
    localStorage.setItem('jieyu.csp.aiOrigin', 'https://api.deepseek.com');
    localStorage.setItem(
      'jieyu.aiChat.settings',
      JSON.stringify({
        providerKind: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: 'sk-e2e-r2-test-key',
        apiKeysByProvider: { deepseek: 'sk-e2e-r2-test-key' },
        modelsByProvider: { deepseek: 'deepseek-chat' },
        baseUrlsByProvider: { deepseek: 'https://api.deepseek.com/v1' },
        toolFeedbackStyle: 'detailed',
        endpointUrl: '',
        authHeaderName: 'Authorization',
        authScheme: 'bearer',
        responseFormat: 'openai-sse',
      }),
    );
  });
}

function installSmartCompletionsRoute(
  page: Page,
  toolName: string,
  afterToolText: string,
  args: Record<string, unknown> | string = {},
) {
  return page.route('**/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}') as {
      tools?: unknown[];
      messages?: Array<{ role?: string; content?: string }>;
    };
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const isTitle = (body.messages ?? []).some((m) =>
      String(m.content ?? '').includes('conversation titles'),
    );
    const hasToolResult = (body.messages ?? []).some((m) => m.role === 'tool');
    if (isTitle || !hasTools) {
      await fulfillSse(route, textChunk('标题'));
      return;
    }
    if (hasToolResult) {
      await fulfillSse(route, textChunk(afterToolText));
      return;
    }
    await fulfillSse(route, toolCallChunk(toolName, args));
  });
}

async function readToolAudits(page: Page): Promise<AuditRow[]> {
  return page.evaluate(async () => {
    const dexie = (globalThis as unknown as {
      __jieyuDexie__: { open: () => Promise<unknown>; audit_logs: { toArray: () => Promise<AuditRow[]> } };
    }).__jieyuDexie__;
    await dexie.open();
    return (await dexie.audit_logs.toArray()).filter((r) => r.field.startsWith('ai_tool_call_'));
  });
}

test.describe('AI runtime v2 flag on — real chat entry', () => {
  // 批准/拒绝/取消：见 aiRuntimeV2Turn.test / AlertsPanel；重载见下方 Dexie 用例（须先选中句段，否则写目标越出作用域）

  test('native tool path loads v2 chunk, executes create, audit by requestId', async ({ page }) => {
    test.setTimeout(180_000);
    await seedV2DeepSeek(page);
    const requested: string[] = [];
    page.on('request', (req) => requested.push(req.url()));
    await installSmartCompletionsRoute(page, 'create_transcription_segment', '已创建句段');

    await setupFieldProjectWithMediaAndSegments(page);
    await openTranscriptionChatWindow(page);
    await page.getByRole('button', { name: /00:00\.0.*alpha/ }).first().click();

    const chat = page.locator('.transcription-chat-window');
    const input = chat.getByTestId('ai-chat-composer-input');
    await expect(input).toBeVisible({ timeout: 60_000 });
    await input.fill('创建一个句段');
    await input.press('Enter');

    await expect
      .poll(async () => requested.some((u) => /aiRuntimeV2Turn/.test(u)), { timeout: 30_000 })
      .toBe(true);

    await expect
      .poll(async () => (await readToolAudits(page)).some((r) => r.field === 'ai_tool_call_decision'), {
        timeout: 60_000,
      })
      .toBe(true);

    const rows = await readToolAudits(page);
    const decision = rows.find(
      (r) => r.field === 'ai_tool_call_decision' && (r.newValue?.includes('create_transcription_segment') ?? false),
    );
    expect(decision?.requestId).toMatch(/^toolreq_/);
    expect(rows.some((r) => r.requestId === decision!.requestId && r.field === 'ai_tool_call_intent')).toBe(true);
  });

  test('unparseable tool args go to clarification with an invalid_args audit row (B2)', async ({ page }) => {
    test.setTimeout(180_000);
    await seedV2DeepSeek(page);
    await installSmartCompletionsRoute(page, 'create_transcription_segment', 'unused', '{"segmentId":');

    await setupFieldProjectWithMediaAndSegments(page);
    await openTranscriptionChatWindow(page);
    const input = page.locator('.transcription-chat-window').getByTestId('ai-chat-composer-input');
    await expect(input).toBeVisible({ timeout: 60_000 });
    await input.fill('创建一个句段');
    await input.press('Enter');

    await expect
      .poll(
        async () =>
          (await readToolAudits(page)).some(
            (r) => r.field === 'ai_tool_call_decision' && (r.newValue ?? '').endsWith(':invalid_args'),
          ),
        { timeout: 60_000 },
      )
      .toBe(true);
  });
  test('pending approval survives reload; approving after reload deletes exactly the card target once (N1/N2)', async ({ page }) => {
    test.setTimeout(240_000);
    await seedV2DeepSeek(page);
    await setupFieldProjectWithMediaAndSegments(page);
    const readUnits = () =>
      page.evaluate(async () => {
        const dexie = (globalThis as unknown as {
          __jieyuDexie__: { open: () => Promise<unknown>; layer_units: { toArray: () => Promise<Array<{ id: string }>> } };
        }).__jieyuDexie__;
        await dexie.open();
        return (await dexie.layer_units.toArray()).map((u) => u.id);
      });
    const unitsBefore = await readUnits();
    expect(unitsBefore).toContain('seg_e2e_a');
    expect(unitsBefore).toContain('seg_e2e_b');
    // 模型只说“删当前句段”（无 id）：目标由卡片按当时选区解析 | target resolved from the selection
    await installSmartCompletionsRoute(page, 'delete_transcription_segment', '已删除', {});

    await openTranscriptionChatWindow(page);
    await page.getByRole('button', { name: /00:00\.0.*alpha/ }).first().click();
    const chat = page.locator('.transcription-chat-window');
    const input = chat.getByTestId('ai-chat-composer-input');
    await expect(input).toBeVisible({ timeout: 60_000 });
    await input.fill('删除当前句段');
    await input.press('Enter');

    const readTurns = () =>
      page.evaluate(async () => {
        const dexie = (globalThis as unknown as {
          __jieyuDexie__: { open: () => Promise<unknown>; table: (n: string) => { toArray: () => Promise<Array<{ approvals: Record<string, { requestId: string; executionCall?: { arguments: Record<string, unknown> } }> }>> } };
        }).__jieyuDexie__;
        await dexie.open();
        return dexie.table('ai_runtime_v2_turns').toArray();
      });
    await expect
      .poll(async () => (await readTurns()).some((t) => Object.keys(t.approvals).length > 0), { timeout: 60_000 })
      .toBe(true);
    const meta = Object.values((await readTurns())[0]!.approvals)[0]!;
    expect(JSON.stringify(meta.executionCall)).toContain('seg_e2e_a');

    await page.reload();
    expect((await readTurns()).length).toBe(1);
    await openTranscriptionChatWindow(page);
    // 重载后先把选区换到 beta，再批准 | move the selection to beta, then approve
    await page.getByRole('button', { name: /00:01\.0.*beta/ }).first().click();
    const alerts = page.getByTestId('ai-chat-alerts-region');
    const approve = alerts.locator('.ai-chat-alerts-actions .ai-chat-alerts-action-btn').first();
    await expect(approve).toBeEnabled({ timeout: 60_000 });
    await approve.click();
    // 等审批落盘、卡片关闭后再发下一条（否则输入框仍在忙，Enter 不发送）| wait until the card closes
    await expect(approve).toBeHidden({ timeout: 30_000 });

    // 重载后批准：下一回合开头执行 | after reload the approved call runs at the next turn
    const input2 = page.locator('.transcription-chat-window').getByTestId('ai-chat-composer-input');
    await expect(input2).toBeVisible({ timeout: 60_000 });
    await input2.fill('继续');
    await expect(async () => {
      await input2.press('Enter');
      await expect(input2).toHaveValue('', { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    await expect.poll(async () => (await readUnits()).includes('seg_e2e_a'), { timeout: 60_000 }).toBe(false);
    const unitsAfter = await readUnits();
    expect(unitsAfter).toContain('seg_e2e_b');
    expect(unitsAfter.length).toBe(unitsBefore.length - 1);

    const rows = await readToolAudits(page);
    const rid = meta.requestId;
    const mine = rows.filter((r) => r.requestId === rid && r.field === 'ai_tool_call_decision').map((r) => r.newValue ?? '');
    expect(mine.some((v) => v.startsWith('policy_pending:delete_transcription_segment'))).toBe(true);
    expect(mine.some((v) => v.startsWith('approved:delete_transcription_segment'))).toBe(true);
    expect(mine.filter((v) => /^(auto_|confirmed:|executed)/.test(v) && !v.includes('failed')).length).toBe(1);
  });
});
